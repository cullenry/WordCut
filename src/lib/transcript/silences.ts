import type { TrimMap } from "@/lib/edl/trims";
import type { Word } from "./types";

export const MIN_THRESHOLD = 0.3;
export const MAX_THRESHOLD = 3;
export const DEFAULT_THRESHOLD = 1;
export const DEFAULT_KEEP = 0.3;
/** A pause is not worth trimming unless at least this much would go. */
export const MIN_REMOVED = 0.05;

export interface SilenceOptions {
  /** Pauses at least this long are found. Floored at MIN_THRESHOLD; no upper limit. */
  threshold?: number;
  /** How much of the pause survives. Never more than the threshold. */
  keep?: number;
}

/** A pause between two adjacent words that would be shortened. */
export interface SilenceMatch {
  /** Stable across re-detection: the id of the word before the pause. */
  key: string;
  afterId: string;
  /** Index of the word before the pause. */
  index: number;
  /** Source seconds: the pause runs from the end of one word to the start of the next. */
  start: number;
  end: number;
  /** Current length of the pause (already shortened if it was trimmed before). */
  pause: number;
  keep: number;
  removed: number;
  /** The span that goes, centred in the pause. */
  cutStart: number;
  cutEnd: number;
  /** What the trim was before (for undo), or null. */
  previousKeep: number | null;
}

const finiteOr = (v: number | undefined, fallback: number) => (v !== undefined && Number.isFinite(v) ? v : fallback);

/** The threshold and keep actually used for a pair of raw settings. */
export function resolveSilenceOptions({ threshold, keep }: SilenceOptions = {}) {
  const t = Math.max(finiteOr(threshold, DEFAULT_THRESHOLD), MIN_THRESHOLD);
  return { threshold: t, keep: Math.min(Math.max(finiteOr(keep, DEFAULT_KEEP), 0), t) };
}

/**
 * Long pauses between two adjacent words that are both kept. A pause next to a
 * deleted word is skipped: the EDL's pause rule already shortens it to at most
 * 0.25 s on each side of the cut. `trims` are existing shortened pauses; those
 * are measured at their shortened length.
 */
export function findSilences(
  words: readonly Word[],
  deleted: ReadonlySet<string>,
  trims: TrimMap,
  options: SilenceOptions = {},
): SilenceMatch[] {
  const { threshold, keep } = resolveSilenceOptions(options);
  const out: SilenceMatch[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (deleted.has(a.id) || deleted.has(b.id)) continue;
    const previousKeep = trims.get(a.id) ?? null;
    const raw = b.start - a.end;
    const pause = previousKeep === null ? raw : Math.min(raw, previousKeep);
    // Epsilon: a pause of exactly the threshold counts, despite float noise in word times.
    if (pause < threshold - 1e-9) continue;
    const removed = pause - keep;
    if (removed < MIN_REMOVED) continue;
    out.push({
      key: `s:${a.id}`,
      afterId: a.id,
      index: i,
      start: a.end,
      end: b.start,
      pause,
      keep,
      removed,
      cutStart: a.end + keep / 2,
      cutEnd: b.start - keep / 2,
      previousKeep,
    });
  }
  return out;
}
