import type { Word } from "@/lib/transcript/types";
import { subtractSpans, trimSpans, type TrimMap } from "./trims";

/**
 * A kept span of the source video, half-open [start, end) in source seconds.
 * `offset` is where it begins on the edited timeline.
 */
export interface KeptRange {
  start: number;
  end: number;
  offset: number;
}

/** Edit decision list: the source spans that survive the edit, in order, never overlapping or touching. */
export interface Edl {
  ranges: readonly KeptRange[];
  /** Length of the edited video. */
  duration: number;
  /** Length of the source video. */
  sourceDuration: number;
}

export interface EdlOptions {
  /**
   * Silence a kept word keeps on the side facing a deleted word: half the pause,
   * capped at this. Two such joins give a pause of at most twice this.
   */
  padSeconds?: number;
  /**
   * Shortened pauses (see SilenceTrim). Their spans are removed from whatever
   * the word cuts keep, so a trim composes with deletions and never clips a word.
   */
  trims?: TrimMap;
}

export const DEFAULT_PAD_SECONDS = 0.25;
/** Spans shorter than this (1 ms) are float noise: dropped if kept, closed up if removed. */
export const MIN_SPAN = 0.001;

/** Rounds to the microsecond so sums like 0.1 + 0.2 compare equal to 0.3. */
export const roundTime = (t: number): number => Math.round(t * 1e6) / 1e6;

/**
 * Builds the EDL from the transcript and the set of deleted word ids.
 *
 * Every word owns its own span plus a share of the pause on either side, and
 * the video is the concatenation of what kept words own:
 * - A pause between two kept words, or two deleted words, is untouched.
 * - A pause between a kept and a deleted word is split: the kept word keeps
 *   min(pause / 2, padSeconds) next to itself, the deleted word takes the rest.
 *   Cuts therefore land in silence, and a join is never longer than 2 x pad.
 * - Silence before the first word goes with the first word, and silence after
 *   the last word with the last, so deleting everything leaves nothing.
 *
 * Trims then carve the middle out of the pauses they name.
 *
 * Words must be sorted by start time. With no words the whole source is kept.
 */
export function buildEdl(
  words: readonly Word[],
  deleted: ReadonlySet<string>,
  sourceDuration: number,
  { padSeconds = DEFAULT_PAD_SECONDS, trims }: EdlOptions = {},
): Edl {
  const total = Math.max(0, sourceDuration);
  const spans: { start: number; end: number }[] = [];

  if (words.length === 0) {
    if (total > 0) spans.push({ start: 0, end: total });
  } else {
    let lo = 0; // where the current word's ownership begins
    let runStart = -1;
    for (let i = 0; i < words.length; i++) {
      const kept = !deleted.has(words[i].id);
      const next = words[i + 1];
      let hi = total;
      if (next) {
        const nextKept = !deleted.has(next.id);
        hi = clamp(boundary(words[i], next, kept, nextKept, padSeconds), lo, total);
      }
      if (kept && runStart < 0) runStart = lo;
      if (!kept && runStart >= 0) {
        spans.push({ start: runStart, end: lo });
        runStart = -1;
      }
      lo = hi;
    }
    if (runStart >= 0) spans.push({ start: runStart, end: total });
  }

  return fromSpans(trims?.size ? subtractSpans(spans, trimSpans(words, trims)) : spans, total);
}

/** Where ownership passes from word `a` to the next word `b`. */
function boundary(a: Word, b: Word, aKept: boolean, bKept: boolean, pad: number): number {
  const pause = b.start - a.end;
  if (pause <= 0 || aKept === bKept) return (a.end + b.start) / 2;
  const keep = Math.min(pause / 2, pad);
  return aKept ? a.end + keep : b.start - keep;
}

/**
 * Normalises source spans into an EDL: rounds, clamps to the source, sorts,
 * merges spans that overlap or touch, drops slivers and assigns offsets.
 */
export function fromSpans(spans: readonly { start: number; end: number }[], sourceDuration: number): Edl {
  const total = Math.max(0, sourceDuration);
  const sorted = spans
    .map((s) => ({ start: roundTime(clamp(s.start, 0, total)), end: roundTime(clamp(s.end, 0, total)) }))
    .filter((s) => s.end - s.start >= MIN_SPAN)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < MIN_SPAN) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }

  let offset = 0;
  const ranges = merged.map((s) => {
    const r = { start: s.start, end: s.end, offset };
    offset = roundTime(offset + s.end - s.start);
    return r;
  });
  return { ranges, duration: offset, sourceDuration: total };
}

/** The removed source spans: the complement of the kept ranges within [0, sourceDuration). */
export function removedRanges(edl: Edl): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const r of edl.ranges) {
    if (r.start > cursor) out.push({ start: cursor, end: r.start });
    cursor = r.end;
  }
  if (cursor < edl.sourceDuration) out.push({ start: cursor, end: edl.sourceDuration });
  return out;
}

/** A cut as seen on the edited timeline: where the join is, and how much source was removed there. */
export interface EditedCut {
  at: number;
  removed: number;
}

/** One entry per cut, including a cut lead-in (at 0) and a cut tail (at the edited end). */
export function editedCuts(edl: Edl): EditedCut[] {
  const cuts: EditedCut[] = [];
  let prevEnd = 0;
  for (const r of edl.ranges) {
    if (r.start > prevEnd) cuts.push({ at: r.offset, removed: roundTime(r.start - prevEnd) });
    prevEnd = r.end;
  }
  if (prevEnd < edl.sourceDuration) cuts.push({ at: edl.duration, removed: roundTime(edl.sourceDuration - prevEnd) });
  return cuts;
}

/** True when nothing has been cut. */
export function isIdentity(edl: Edl): boolean {
  return edl.ranges.length === 1 && edl.ranges[0].start === 0 && edl.ranges[0].end === edl.sourceDuration;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
