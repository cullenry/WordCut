/** Loudness over time: one RMS value per frame of `frameSeconds`. */
export interface Envelope {
  frameSeconds: number;
  rms: Float32Array;
}

export const DEFAULT_FRAME_SECONDS = 0.05;

/**
 * Accumulates an RMS envelope from decoded audio buffers as they stream in,
 * so the whole track never has to sit in memory. Channels are averaged.
 */
export class EnvelopeBuilder {
  private sumSq: Float64Array;
  private count: Uint32Array;

  constructor(
    readonly duration: number,
    readonly frameSeconds = DEFAULT_FRAME_SECONDS,
  ) {
    const frames = Math.max(1, Math.ceil(duration / frameSeconds));
    this.sumSq = new Float64Array(frames);
    this.count = new Uint32Array(frames);
  }

  /** Adds a block of samples starting at `timestamp` seconds. */
  push(channels: Float32Array[], sampleRate: number, timestamp: number): void {
    if (channels.length === 0) return;
    const n = channels[0].length;
    const nch = channels.length;
    const last = this.sumSq.length - 1;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let c = 0; c < nch; c++) s += channels[c][i];
      s /= nch;
      const frame = Math.floor((timestamp + i / sampleRate) / this.frameSeconds);
      if (frame < 0 || frame > last) continue;
      this.sumSq[frame] += s * s;
      this.count[frame]++;
    }
  }

  finish(): Envelope {
    const rms = new Float32Array(this.sumSq.length);
    for (let i = 0; i < rms.length; i++) {
      rms[i] = this.count[i] ? Math.sqrt(this.sumSq[i] / this.count[i]) : 0;
    }
    return { frameSeconds: this.frameSeconds, rms };
  }
}
