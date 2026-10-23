import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  OggOutputFormat,
  Output,
  Quality,
  WavOutputFormat,
  canEncodeAudio,
  type InputAudioTrack,
} from "mediabunny";
import type { ChunkRange } from "./chunks";
import { EnvelopeBuilder, type Envelope } from "./envelope";

export class AudioExtractError extends Error {}

/** 16 kHz mono is what speech models are trained on; more is wasted upload. */
const SAMPLE_RATE = 16_000;
const OPUS_BITRATE = 24_000;

export interface ChunkFormat {
  codec: "opus" | "pcm-s16";
  mimeType: string;
  /** Upper estimate used to size chunks, including container overhead. */
  bytesPerSecond: number;
}

const OPUS_FORMAT: ChunkFormat = { codec: "opus", mimeType: "audio/ogg", bytesPerSecond: 3_500 };
const WAV_FORMAT: ChunkFormat = { codec: "pcm-s16", mimeType: "audio/wav", bytesPerSecond: 32_100 };

/**
 * Opus when the browser can encode it (Chromium, recent Firefox); otherwise
 * uncompressed WAV. Pass "wav" to force lossless audio, e.g. to compare accuracy.
 */
export async function pickChunkFormat(prefer: "opus" | "wav" = "opus"): Promise<ChunkFormat> {
  if (prefer === "wav") return WAV_FORMAT;
  const opus = await canEncodeAudio("opus", {
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
    quality: new Quality({ bitrate: OPUS_BITRATE }),
  }).catch(() => false);
  return opus ? OPUS_FORMAT : WAV_FORMAT;
}

/** Opens a local file for lazy reads. Nothing is loaded into memory up front. */
export async function openAudio(file: File): Promise<{ input: Input; track: InputAudioTrack; duration: number }> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new AudioExtractError("This video has no audio track to transcribe.");
    if (!(await track.canDecode())) {
      throw new AudioExtractError(
        `Your browser cannot decode this audio (${track.codec ?? "unknown codec"}). Try Chrome or Edge.`,
      );
    }
    const duration = await track.computeDuration();
    return { input, track, duration };
  } catch (e) {
    input.dispose();
    throw e;
  }
}

/** Decodes the track once, streaming, and returns its loudness envelope. */
export async function computeEnvelope(
  track: InputAudioTrack,
  duration: number,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Envelope> {
  const builder = new EnvelopeBuilder(duration);
  const sink = new AudioBufferSink(track);
  let lastReport = 0;
  for await (const { buffer, timestamp } of sink.buffers()) {
    signal?.throwIfAborted();
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
    builder.push(channels, buffer.sampleRate, timestamp);
    if (onProgress && timestamp - lastReport > 1) {
      lastReport = timestamp;
      onProgress(Math.min(1, timestamp / duration));
    }
  }
  onProgress?.(1);
  return builder.finish();
}

/** Trims, downmixes to mono 16 kHz and encodes one chunk. */
export async function encodeChunk(
  input: Input,
  range: ChunkRange,
  format: ChunkFormat,
  signal?: AbortSignal,
): Promise<Blob> {
  const target = new BufferTarget();
  const output = new Output({
    format: format.codec === "opus" ? new OggOutputFormat() : new WavOutputFormat(),
    target,
  });
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    video: { discard: true },
    audio: {
      codec: format.codec,
      numberOfChannels: 1,
      sampleRate: SAMPLE_RATE,
      forceTranscode: true,
      ...(format.codec === "opus" && { quality: new Quality({ bitrate: OPUS_BITRATE }) }),
    },
    trim: { start: range.start, end: range.end },
    tags: {},
    showWarnings: false,
  });
  if (!conversion.isValid) {
    const reason = conversion.discardedTracks.map((t) => t.reason).join(", ");
    throw new AudioExtractError(`Could not extract audio (${reason || "unsupported track"}).`);
  }
  const onAbort = () => void conversion.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await conversion.execute();
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
  signal?.throwIfAborted();
  return new Blob([target.buffer!], { type: format.mimeType });
}
