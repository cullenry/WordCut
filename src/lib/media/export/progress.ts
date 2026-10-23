/** Share of the export time spent on audio; decoding and encoding frames is the rest. */
export const AUDIO_WEIGHT = 0.08;

export interface ExportCounts {
  framesDone: number;
  totalFrames: number;
  samplesDone: number;
  /** 0 when the clip has no audio. */
  totalSamples: number;
}

const part = (done: number, total: number) => (total > 0 ? Math.min(1, Math.max(0, done / total)) : 1);

/** 0..1 across video and audio, weighted by how long each takes. Stays below 1 until both are done. */
export function exportFraction(c: ExportCounts): number {
  const video = part(c.framesDone, c.totalFrames);
  if (c.totalSamples <= 0) return video;
  return video * (1 - AUDIO_WEIGHT) + part(c.samplesDone, c.totalSamples) * AUDIO_WEIGHT;
}

/** Whole percent, never showing 100 before the file is actually done. */
export function percentOf(fraction: number, finished = false): number {
  if (finished) return 100;
  return Math.min(99, Math.max(0, Math.floor(fraction * 100)));
}

/**
 * Estimates time remaining from recent progress, not the average since the start:
 * the first frames include opening the file and warming up the encoder, so they
 * would make the estimate too pessimistic for the rest of the export.
 */
export class EtaEstimator {
  private samples: { t: number; f: number }[] = [];

  /** `windowSeconds` of history are kept; `minElapsed` must pass before there is any estimate. */
  constructor(
    readonly windowSeconds = 5,
    readonly minElapsed = 1,
  ) {}

  /** Records progress `fraction` at time `now` (seconds, any monotonic clock). */
  push(now: number, fraction: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && (now <= last.t || fraction < last.f)) return;
    this.samples.push({ t: now, f: fraction });
    // Keep one sample older than the window so the rate always spans the full window.
    while (this.samples.length > 2 && now - this.samples[1].t >= this.windowSeconds) this.samples.shift();
  }

  /** Seconds left, or null while there isn't enough to go on. */
  remaining(): number | null {
    const s = this.samples;
    if (s.length < 2) return null;
    const a = s[0];
    const b = s[s.length - 1];
    if (b.t - a.t < this.minElapsed || b.f <= a.f) return null;
    const rate = (b.f - a.f) / (b.t - a.t);
    return Math.max(0, (1 - b.f) / rate);
  }
}

/** "About 5 s left", "About 1 min 20 s left", "Less than a second left". Null → "Estimating…". */
export function formatRemaining(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "Estimating time left…";
  if (seconds < 1) return "Less than a second left";
  if (seconds < 60) return `About ${Math.ceil(seconds)} s left`;
  // Round to 10 s past a minute: the estimate isn't that precise and it reads calmer.
  const total = Math.round(seconds / 10) * 10;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `About ${m} min ${s} s left` : `About ${m} min left`;
}
