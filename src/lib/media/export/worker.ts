import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  UnsupportedInputFormatError,
  canEncodeAudio,
  canEncodeVideo,
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny";
import { captionCharacters } from "@/lib/captions/fonts";
import { renderClipFrame } from "@/lib/captions/frame";
import { captionFont } from "@/lib/captions/render";
import { cropRect } from "@/lib/clips/crop";
import { SegmentWriter, fadeSamples, packPlanar } from "./audio";
import {
  RESOLUTION_IDS,
  RESOLUTIONS,
  audioBitrate,
  audioSegments,
  codecName,
  frameCount,
  frameDuration,
  frameSourceTimes,
  frameTime,
  outputFrameRate,
  videoBitrate,
  type ResolutionId,
} from "./plan";
import type {
  AudioEncoderChoice,
  ExportJob,
  ExportResult,
  ProbeResult,
  VideoCodecId,
  VideoEncoderChoice,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

/**
 * The export worker. It reads the source lazily through Mediabunny (never the whole
 * file), draws every output frame with renderClipFrame (the preview's own renderer)
 * onto an OffscreenCanvas, encodes with WebCodecs and muxes an MP4 in memory.
 * Cancelling is terminate() from the page: that stops everything and frees it all.
 */

/** The parts of DedicatedWorkerGlobalScope used here (the project compiles against the DOM lib, not "webworker"). */
interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer: Transferable[]): void;
  /** Missing in browsers that can't load fonts in a worker. */
  fonts?: FontFaceSet;
}

const scope = self as unknown as WorkerScope;
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);

scope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === "probe") post({ type: "probe", result: await probe(req.file) });
    else {
      const result = await exportWithFallback(req.job);
      post({ type: "done", result }, [result.buffer]);
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

const REQUIRED_APIS = ["VideoDecoder", "VideoEncoder", "AudioDecoder", "AudioEncoder", "OffscreenCanvas"] as const;
/** In order of preference; all of them can go in an MP4. H.264 plays everywhere, so it wins whenever it works. */
const VIDEO_CODECS: VideoCodecId[] = ["avc", "hevc", "vp9", "av1"];
const AAC_RATES = [44_100, 48_000];

function openInput(file: File): Input {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

async function probe(file: File): Promise<ProbeResult> {
  const missing = REQUIRED_APIS.filter((name) => !(name in globalThis));
  if (missing.length) {
    return {
      ok: false,
      reason: `This browser doesn't support ${listOf(missing)}, which export needs. Use a recent Chrome or Edge.`,
    };
  }

  const input = openInput(file);
  try {
    let video: InputVideoTrack | null;
    try {
      video = await input.getPrimaryVideoTrack();
    } catch (err) {
      if (!(err instanceof UnsupportedInputFormatError)) throw err;
      return {
        ok: false,
        reason: "Export can't read this file's container. It reads MP4, MOV, WebM and MKV; try converting the video to MP4 first.",
      };
    }
    if (!video) return { ok: false, reason: "This file has no video track to export." };
    const videoCodec = await describeCodec(video);
    if (!(await video.canDecode())) {
      return {
        ok: false,
        reason: `This browser can't decode the video in this file (${videoCodec}). Try Chrome or Edge, or convert the video to H.264 first.`,
      };
    }

    const stats = await video.computePacketStats(240).catch(() => null);
    const sourceFrameRate = stats && stats.averagePacketRate > 0 ? stats.averagePacketRate : null;
    const frameRate = outputFrameRate(sourceFrameRate);

    const encoders = {} as Record<ResolutionId, VideoEncoderChoice | null>;
    for (const id of RESOLUTION_IDS) {
      const { width, height } = RESOLUTIONS[id];
      encoders[id] = await pickVideoEncoder(width, height, frameRate);
    }
    if (!encoders["1080"] && !encoders["720"]) {
      return {
        ok: false,
        reason: "This browser can't encode H.264, HEVC, VP9 or AV1 video at 9:16 sizes, so it can't make an MP4.",
      };
    }

    const audioTrack = await input.getPrimaryAudioTrack();
    let audio: { codec: string; encoder: AudioEncoderChoice } | null = null;
    if (audioTrack) {
      const codec = await describeCodec(audioTrack);
      if (!(await audioTrack.canDecode())) {
        return {
          ok: false,
          reason: `This browser can't decode the audio in this file (${codec}). Try Chrome or Edge, or convert the audio to AAC first.`,
        };
      }
      const encoder = await pickAudioEncoder(audioTrack.sampleRate, audioTrack.numberOfChannels);
      if (!encoder) return { ok: false, reason: "This browser can't encode AAC or Opus audio, so it can't make an MP4 with sound." };
      audio = { codec, encoder };
    }

    return { ok: true, frameRate, sourceFrameRate, videoCodec, audio, encoders };
  } finally {
    input.dispose();
  }
}

async function describeCodec(track: InputVideoTrack | InputAudioTrack): Promise<string> {
  const full = await track.getCodecParameterString().catch(() => null);
  const name = codecName(track.codec);
  return full && full !== track.codec ? `${name}, ${full}` : name;
}

async function pickVideoEncoder(width: number, height: number, fps: number): Promise<VideoEncoderChoice | null> {
  const bitrate = videoBitrate(width, height, fps);
  for (const codec of VIDEO_CODECS) {
    const base = { width, height, frameRate: fps, quality: new Quality({ bitrate }) };
    if (await canEncodeVideo(codec, { ...base, hardwareAcceleration: "prefer-hardware" }).catch(() => false)) {
      return { codec, bitrate, hardware: true };
    }
    if (await canEncodeVideo(codec, base).catch(() => false)) return { codec, bitrate, hardware: false };
  }
  return null;
}

async function pickAudioEncoder(sourceRate: number, sourceChannels: number): Promise<AudioEncoderChoice | null> {
  const channels = Math.min(2, Math.max(1, sourceChannels || 1));
  const bitrate = audioBitrate(channels);
  const candidates: AudioEncoderChoice[] = [
    // AAC only takes 44.1 or 48 kHz in browsers; anything else is resampled to 48.
    { codec: "aac", sampleRate: AAC_RATES.includes(sourceRate) ? sourceRate : 48_000, channels, bitrate },
    { codec: "opus", sampleRate: 48_000, channels, bitrate },
  ];
  for (const c of candidates) {
    const ok = await canEncodeAudio(c.codec, {
      numberOfChannels: c.channels,
      sampleRate: c.sampleRate,
      quality: new Quality({ bitrate: c.bitrate }),
    }).catch(() => false);
    if (ok) return c;
  }
  return null;
}

/** A hardware encoder can pass the support check and still fail on the first frame; then try again in software. */
async function exportWithFallback(job: ExportJob): Promise<ExportResult> {
  try {
    return await runExport(job);
  } catch (err) {
    if (!job.video.hardware) throw err;
    console.warn("[export] hardware encoder failed, retrying in software", err);
    return runExport({ ...job, video: { ...job.video, hardware: false } });
  }
}

async function runExport(job: ExportJob): Promise<ExportResult> {
  const input = openInput(job.file);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("This file has no video track to export.");
    const audioTrack = job.audio ? await input.getPrimaryAudioTrack() : null;

    const canvas = new OffscreenCanvas(job.width, job.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("This browser can't draw to a canvas in a worker.");

    // Fonts first: nothing is drawn until the caption font is ready.
    const fontWarning = await loadCaptionFont(job, ctx);

    const fps = job.frameRate;
    const duration = job.clipEdl.duration;
    const totalFrames = frameCount(duration, fps);
    if (totalFrames === 0) throw new Error("Everything in this clip is cut, so there is nothing to export.");

    const videoSource = new CanvasSource(canvas, {
      codec: job.video.codec,
      quality: new Quality({ bitrate: job.video.bitrate }),
      hardwareAcceleration: job.video.hardware ? "prefer-hardware" : "no-preference",
      keyFrameInterval: 2,
      latencyMode: "quality",
    });
    output.addVideoTrack(videoSource);

    let audio: Awaited<ReturnType<typeof prepareAudio>> = null;
    if (audioTrack && job.audio) {
      audio = await prepareAudio(job, audioTrack, job.audio);
      if (audio) output.addAudioTrack(audio.source);
    }

    await output.start();

    const counts = { framesDone: 0, totalFrames, samplesDone: 0, totalSamples: audio?.totalSamples ?? 0 };
    let lastPost = 0;
    const report = (force = false) => {
      const now = performance.now();
      if (!force && now - lastPost < 100) return;
      lastPost = now;
      post({ type: "progress", ...counts });
    };
    report(true);

    await Promise.all([
      encodeVideo(job, videoTrack, ctx, videoSource, totalFrames, (n) => {
        counts.framesDone = n;
        report();
      }),
      audio?.run((n) => {
        counts.samplesDone = n;
        report();
      }),
    ]);
    report(true);

    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error("The MP4 muxer produced no data.");
    return { buffer, duration, frames: totalFrames, audioSamples: counts.totalSamples, fontWarning };
  } catch (err) {
    if (output.state === "started" || output.state === "pending") await output.cancel().catch(() => undefined);
    throw err;
  } finally {
    input.dispose();
  }
}

/**
 * One output frame per point of a fixed grid in clip time. Frame n shows the source
 * at editedToSource(n / fps), so the frames before a join come from one kept range and
 * the frames after it from the next; nothing in a cut is ever shown for more than the
 * fraction of a frame it sits before the join.
 */
async function encodeVideo(
  job: ExportJob,
  track: InputVideoTrack,
  ctx: OffscreenCanvasRenderingContext2D,
  source: CanvasSource,
  totalFrames: number,
  onFrame: (n: number) => void,
) {
  const fps = job.frameRate;
  const duration = job.clipEdl.duration;
  // Decode at no more than the size the crop is drawn at: a 4K source is scaled down once, in the decoder's canvas.
  const dw = track.displayWidth;
  const dh = track.displayHeight;
  const crop = cropRect(dw, dh, job.cropOffset);
  const scale = crop.w > 0 ? Math.min(1, job.width / crop.w) : 1;
  const sinkW = Math.max(2, Math.round(dw * scale));
  const sinkH = Math.max(2, Math.round(dh * scale));
  const sink = new CanvasSink(track, { width: sinkW, height: sinkH, fit: "fill", poolSize: 2 });

  const first = await track.getFirstTimestamp();
  let n = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(frameSourceTimes(job.clipEdl, fps, first))) {
    if (n >= totalFrames) break;
    renderClipFrame(ctx, job.width, job.height, {
      image: wrapped?.canvas ?? ctx.canvas,
      imageWidth: wrapped ? wrapped.canvas.width : 0,
      imageHeight: wrapped ? wrapped.canvas.height : 0,
      cropOffset: job.cropOffset,
      pages: job.pages,
      time: frameTime(n, fps),
      settings: job.captions,
      fontFamily: job.fontFamily,
    });
    await source.add(frameTime(n, fps), frameDuration(n, fps, duration));
    n++;
    onFrame(n);
  }
  if (n < totalFrames) throw new Error(`The video decoder stopped after ${n} of ${totalFrames} frames.`);
  source.close();
}

/**
 * Sets up the audio track: learns the decoded format from the first sample (the
 * container can disagree, e.g. HE-AAC decodes at twice its stored rate), then plans
 * the sample-exact segments. Encoding resamples and remixes to the chosen format.
 */
async function prepareAudio(job: ExportJob, track: InputAudioTrack, choice: AudioEncoderChoice) {
  const sink = new AudioSampleSink(track);
  const startTime = Math.max(job.clipEdl.ranges[0]?.start ?? 0, await track.getFirstTimestamp());
  const peek = await sink.getSample(startTime);
  if (!peek) return null;
  const rate = peek.sampleRate;
  const channels = peek.numberOfChannels;
  peek.close();

  const { segments, totalSamples } = audioSegments(job.clipEdl, rate);
  const source = new AudioSampleSource({
    codec: choice.codec,
    quality: new Quality({ bitrate: choice.bitrate }),
    transform: { sampleRate: choice.sampleRate, numberOfChannels: choice.channels },
  });

  const run = async (onSamples: (n: number) => void) => {
    const fade = fadeSamples(rate);
    let out = 0;
    const emit = async (planes: Float32Array[] | null) => {
      if (!planes) return;
      const sample = new AudioSample({
        data: packPlanar(planes),
        format: "f32-planar",
        numberOfChannels: channels,
        sampleRate: rate,
        timestamp: out / rate,
      });
      out += planes[0].length;
      await source.add(sample);
      sample.close();
      onSamples(out);
    };

    for (const seg of segments) {
      if (out !== seg.outStart) throw new Error(`Audio join is off by ${seg.outStart - out} samples.`);
      const writer = new SegmentWriter(seg, channels, fade);
      // A little before the segment, so the decoder is warmed up when it starts.
      const from = Math.max(0, seg.srcStart / rate - 0.05);
      const to = (seg.srcStart + seg.length) / rate;
      for await (const s of sink.samples(from, to)) {
        const planes: Float32Array[] = [];
        for (let c = 0; c < channels; c++) {
          const plane = new Float32Array(s.numberOfFrames);
          s.copyTo(plane, { planeIndex: Math.min(c, s.numberOfChannels - 1), format: "f32-planar" });
          planes.push(plane);
        }
        const first = Math.round(s.timestamp * rate);
        s.close();
        await emit(writer.push(first, planes));
        if (writer.done) break;
      }
      await emit(writer.finish());
    }
    source.close();
  };

  return { source, totalSamples, run };
}

/**
 * Loads the caption font into this worker's own FontFaceSet (the page's fonts aren't
 * visible here), waits until every character the captions use is ready, then checks
 * the result measures the same as on the page. Returns a warning, or null if all is well.
 */
async function loadCaptionFont(job: ExportJob, ctx: OffscreenCanvasRenderingContext2D): Promise<string | null> {
  if (!job.captions.enabled || job.pages.length === 0) return null;
  const fonts = scope.fonts;
  if (!fonts) return "This browser can't load fonts in a worker, so captions were drawn in a system font.";
  if (job.fontFaces.length === 0) return "The caption font wasn't found on the page, so captions were drawn in a system font.";

  for (const f of job.fontFaces) {
    try {
      fonts.add(new FontFace(f.family, f.src, f.descriptors as FontFaceDescriptors));
    } catch (err) {
      console.warn("[export] skipped a font face", f.family, err);
    }
  }
  const { font, uppercase } = captionFont(job.captions, job.fontFamily);
  const text = captionCharacters(job.pages, uppercase);
  try {
    await withTimeout(fonts.load(font, text), 15_000);
  } catch {
    return "The caption font didn't load in time, so captions may use a fallback font.";
  }
  if (!fonts.check(font, text)) return "The caption font didn't load, so captions may use a fallback font.";

  const check = job.fontCheck;
  if (!check) return null;
  ctx.font = check.font;
  const width = ctx.measureText(check.text).width;
  if (Math.abs(width - check.width) > 0.5) {
    console.warn("[export] font check failed", { font: check.font, preview: check.width, export: width });
    return `Captions measured ${width.toFixed(1)}px here but ${check.width.toFixed(1)}px in the preview, so line breaks may differ.`;
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(resolve, reject).finally(() => clearTimeout(id));
  });
}

function listOf(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
