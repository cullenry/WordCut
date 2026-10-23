import type { AudioSegment } from "./plan";

/**
 * Each kept range fades in and out over this long. Cuts land in pauses (see the EDL
 * pause rule), so the dip is silent; it is there so a join can never click.
 */
export const JOIN_FADE_SECONDS = 0.004;

export const fadeSamples = (sampleRate: number): number => Math.round(JOIN_FADE_SECONDS * sampleRate);

/**
 * Gain of sample `k` of a segment `length` samples long: a raised-cosine ramp from 0
 * over the first `fade` samples and back to 0 over the last `fade`, 1 in between.
 * The fade shrinks to half the segment, so a very short one fades all the way in and straight back out.
 */
export function fadeGain(k: number, length: number, fade: number): number {
  const f = Math.min(fade, Math.floor(length / 2));
  if (f <= 0) return 1;
  const edge = Math.min(k, length - 1 - k);
  if (edge >= f) return 1;
  if (edge < 0) return 0;
  return 0.5 - 0.5 * Math.cos((Math.PI * edge) / f);
}

/**
 * Writes one segment of the output from decoded source audio, as it streams in.
 * Exactly `segment.length` samples come out per channel, in order, whatever the
 * decoder hands over: samples before the segment or already written are skipped
 * (never written twice), and a gap in the source is filled with silence (never
 * closed up), so everything after the gap stays in sync.
 */
export class SegmentWriter {
  private written = 0;

  constructor(
    readonly segment: AudioSegment,
    readonly channels: number,
    readonly fade: number,
  ) {}

  get done(): boolean {
    return this.written >= this.segment.length;
  }

  /** Source sample index of the next sample this segment needs. */
  get nextSourceSample(): number {
    return this.segment.srcStart + this.written;
  }

  /**
   * Takes a decoded chunk whose first sample is source sample `first`, one plane per
   * channel (a missing channel repeats the first). Returns the next output samples,
   * or null if the chunk adds nothing.
   */
  push(first: number, planes: readonly Float32Array[]): Float32Array[] | null {
    const { srcStart, length } = this.segment;
    const end = srcStart + length;
    const at = this.nextSourceSample;
    const size = planes[0]?.length ?? 0;
    const copyFrom = Math.max(first, at);
    const copyTo = Math.min(first + size, end);
    const silence = Math.min(copyFrom, end) - at;
    const copy = Math.max(0, copyTo - copyFrom);
    return this.emit(silence, copy, planes, copyFrom - first);
  }

  /** Whatever the decoder never delivered, as silence. Null if the segment is complete. */
  finish(): Float32Array[] | null {
    return this.emit(this.segment.length - this.written, 0, [], 0);
  }

  private emit(silence: number, copy: number, planes: readonly Float32Array[], from: number): Float32Array[] | null {
    const n = Math.max(0, silence) + copy;
    if (n === 0) return null;
    const lead = n - copy;
    const out: Float32Array[] = [];
    for (let c = 0; c < this.channels; c++) {
      const plane = new Float32Array(n);
      if (copy > 0) plane.set((planes[c] ?? planes[0]).subarray(from, from + copy), lead);
      out.push(plane);
    }
    this.applyFades(out, this.written, n);
    this.written += n;
    return out;
  }

  private applyFades(out: Float32Array[], at: number, n: number) {
    const { length } = this.segment;
    const f = Math.min(this.fade, Math.floor(length / 2));
    if (f <= 0) return;
    // Only the samples within `f` of either edge of the segment change: [0, f) and [length - f, length).
    for (const [lo, hi] of [
      [0, f],
      [length - f, length],
    ]) {
      for (let k = Math.max(lo, at); k < Math.min(hi, at + n); k++) {
        const g = fadeGain(k, length, f);
        for (const plane of out) plane[k - at] *= g;
      }
    }
  }
}

/** Planes laid end to end, the layout of an "f32-planar" AudioSample. */
export function packPlanar(planes: readonly Float32Array[]): Float32Array {
  const n = planes[0]?.length ?? 0;
  const out = new Float32Array(n * planes.length);
  planes.forEach((p, c) => out.set(p, c * n));
  return out;
}
