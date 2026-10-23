import { roundTime, type Edl } from "@/lib/edl/edl";

/**
 * Export plans the output on one clock: clip time, the edited timeline of the clip
 * (see clipEdl). Video frames sit on a fixed grid of that clock and audio samples on
 * a sample-exact grid of it, both derived from the same EDL, so they cannot drift.
 */

export const MAX_FRAME_RATE = 30;
/** A source rate divided down to stay under the cap must not drop below this, or motion turns choppy. */
const MIN_DIVIDED_RATE = 24;

export type ResolutionId = "1080" | "720";

export const RESOLUTIONS: Record<ResolutionId, { width: number; height: number }> = {
  "1080": { width: 1080, height: 1920 },
  "720": { width: 720, height: 1280 },
};

/** Largest first. Spelled out because "1080" and "720" are integer-like keys, which Object.keys sorts ascending. */
export const RESOLUTION_IDS: readonly ResolutionId[] = ["1080", "720"];

export const DEFAULT_RESOLUTION: ResolutionId = "1080";

/** Rates cameras and phones actually record at; a measured average is snapped to the nearest. */
const COMMON_RATES = [24000 / 1001, 24, 25, 30000 / 1001, 30, 48, 50, 60000 / 1001, 60, 90, 100, 120, 240];
const SNAP_TOLERANCE = 0.02;

/**
 * A measured frame rate snapped to the nearest common rate within 2% (phones record
 * variable rate, so an average of 29.6 is really 29.97). Anything else is kept to 3 decimals.
 */
export function snapFrameRate(measured: number): number {
  let best: number | null = null;
  let bestErr = SNAP_TOLERANCE;
  for (const r of COMMON_RATES) {
    const err = Math.abs(measured - r) / r;
    if (err <= bestErr) {
      best = r;
      bestErr = err;
    }
  }
  return best ?? Math.round(measured * 1000) / 1000;
}

/**
 * The output frame rate: the source's, capped at 30. A faster source is divided by a
 * whole number where that stays at 24 or more (59.94 → 29.97, 50 → 25, 120 → 30), so
 * every output frame is a real source frame at an even cadence. Unknown → 30.
 */
export function outputFrameRate(sourceRate: number | null | undefined): number {
  if (typeof sourceRate !== "number" || !Number.isFinite(sourceRate) || sourceRate <= 0) return MAX_FRAME_RATE;
  const rate = snapFrameRate(sourceRate);
  if (rate <= MAX_FRAME_RATE) return rate;
  const divided = rate / Math.ceil(rate / MAX_FRAME_RATE - 1e-9);
  return divided >= MIN_DIVIDED_RATE ? divided : MAX_FRAME_RATE;
}

/** "29.97", "30", "23.976". */
export function formatFrameRate(fps: number): string {
  return String(Math.round(fps * 1000) / 1000);
}

/** Frames needed to cover `duration` seconds. The last one may be short, so the video ends exactly at `duration`. */
export function frameCount(duration: number, fps: number): number {
  if (!(duration > 0) || !(fps > 0)) return 0;
  return Math.max(1, Math.ceil(roundTime(duration * fps) - 1e-6));
}

/** Clip time of output frame `n`, rounded like every other EDL time so a frame on a join lands exactly on it. */
export const frameTime = (n: number, fps: number): number => roundTime(n / fps);

/** How long frame `n` is shown: one frame, or less for the last so the video stops at `duration`. */
export function frameDuration(n: number, fps: number, duration: number): number {
  return roundTime(Math.min(frameTime(n + 1, fps), duration) - frameTime(n, fps));
}

/**
 * How far into an output frame its source frame is looked up. A decoder returns the
 * last frame starting at or before the time asked for, and EDL times are rounded to
 * the microsecond, so asking at the exact edge can land a hair before a source frame
 * that starts there and return the one before it: a repeated frame, then a skipped
 * one. 0.1 ms is far above that rounding and far below a frame.
 */
export const FRAME_LOOKUP_OFFSET = 0.0001;

/**
 * The source time to take each output frame from, in output order. Frame `n` shows
 * whatever the source shows at editedToSource(clip time), looked up FRAME_LOOKUP_OFFSET
 * into the frame but never past its kept range. A frame exactly on a join belongs to
 * the range after it. Never earlier than `firstTimestamp`, the source's first frame.
 * Always ascending.
 */
export function* frameSourceTimes(clipEdl: Edl, fps: number, firstTimestamp = 0): Generator<number> {
  const { ranges } = clipEdl;
  const n = frameCount(clipEdl.duration, fps);
  let r = 0;
  for (let i = 0; i < n; i++) {
    const edited = frameTime(i, fps);
    // Same rule as editedToSource: the last range whose offset is at or before the frame.
    while (r + 1 < ranges.length && ranges[r + 1].offset <= edited) r++;
    const range = ranges[r];
    const source = roundTime(range.start + (edited - range.offset));
    const lookup = Math.max(source, Math.min(source + FRAME_LOOKUP_OFFSET, range.end - FRAME_LOOKUP_OFFSET));
    yield Math.max(firstTimestamp, lookup);
  }
}

/** One kept range in samples: copy `length` samples from source sample `srcStart` to output sample `outStart`. */
export interface AudioSegment {
  srcStart: number;
  outStart: number;
  length: number;
}

/**
 * The kept ranges as sample-exact segments. Each segment's output edge is the rounded
 * edited time of its join, and the next segment starts on that same sample, so the
 * segments tile the output with no gap or overlap and rounding never accumulates: at
 * every join audio is within half a sample of where the video frame grid puts it.
 */
export function audioSegments(clipEdl: Edl, sampleRate: number): { segments: AudioSegment[]; totalSamples: number } {
  const { ranges } = clipEdl;
  const segments: AudioSegment[] = [];
  let outStart = 0;
  for (let i = 0; i < ranges.length; i++) {
    const editedEnd = i + 1 < ranges.length ? ranges[i + 1].offset : clipEdl.duration;
    const outEnd = Math.round(editedEnd * sampleRate);
    const length = outEnd - outStart;
    if (length > 0) segments.push({ srcStart: Math.round(ranges[i].start * sampleRate), outStart, length });
    outStart = Math.max(outStart, outEnd);
  }
  return { segments, totalSamples: outStart };
}

/** Video bitrate for H.264-class codecs: about 8 Mbps at 1080x1920 30 fps, scaled by pixels per second. */
export function videoBitrate(width: number, height: number, fps: number): number {
  const bits = width * height * fps * 0.13;
  return Math.max(500_000, Math.round(bits / 100_000) * 100_000);
}

export const audioBitrate = (channels: number): number => (channels > 1 ? 192_000 : 128_000);

const MAX_FILE_NAME = 120;

/** A safe download name ending in .mp4: no path or reserved characters, never empty. */
export function exportFileName(name: string): string {
  const base = name
    .replace(/\.mp4$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, MAX_FILE_NAME)
    .trim();
  return `${base || "clip"}.mp4`;
}

const CODEC_NAMES: Record<string, string> = {
  avc: "H.264",
  hevc: "HEVC (H.265)",
  vp8: "VP8",
  vp9: "VP9",
  av1: "AV1",
  aac: "AAC",
  opus: "Opus",
  mp3: "MP3",
  vorbis: "Vorbis",
  flac: "FLAC",
  ac3: "AC-3",
  eac3: "E-AC-3",
};

/** A codec as people know it: "avc" → "H.264". Unknown codecs pass through; none → "an unknown codec". */
export function codecName(codec: string | null | undefined): string {
  if (!codec) return "an unknown codec";
  return CODEC_NAMES[codec] ?? (codec.startsWith("pcm") ? "PCM" : codec);
}
