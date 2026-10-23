import type { Word } from "./types";

export interface LookupOptions {
  /** How long after a word ends it still counts as current, so brief gaps don't flicker. */
  holdSeconds?: number;
  /** Treat times this much before a word's start as already inside it (seeks land on frame boundaries). */
  toleranceSeconds?: number;
}

/**
 * Index of the word being spoken at source time `t`: the last word starting at
 * or before `t`, unless it ended more than `holdSeconds` ago. Returns -1 before
 * the first word or in a long silence. Words must be sorted by start time.
 */
export function findWordIndexAtTime(
  words: readonly Word[],
  t: number,
  { holdSeconds = 0.5, toleranceSeconds = 0 }: LookupOptions = {},
): number {
  const target = t + toleranceSeconds;
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= target) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  if (i < 0 || t > words[i].end + holdSeconds) return -1;
  return i;
}
