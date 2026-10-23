import { fromSpans, type Edl } from "@/lib/edl/edl";
import type { WordRange } from "@/lib/transcript/selection";
import type { Word } from "@/lib/transcript/types";

/** Silence added either side of a clip made from words, so it doesn't start or stop on the very edge of speech. */
export const CLIP_PAD = 0.12;

const round3 = (t: number) => Math.round(t * 1000) / 1000;

/**
 * The EDL of one clip: the kept ranges of `edl` that fall in [start, end), laid
 * end to end from 0. It is an ordinary Edl, so every time function (sourceToEdited,
 * editedToSource, playbackJump...) works on a clip unchanged, in clip time.
 */
export function clipEdl(edl: Edl, start: number, end: number): Edl {
  const spans: { start: number; end: number }[] = [];
  if (end > start) {
    for (const r of edl.ranges) {
      if (r.end <= start) continue;
      if (r.start >= end) break;
      spans.push({ start: Math.max(r.start, start), end: Math.min(r.end, end) });
    }
  }
  return fromSpans(spans, edl.sourceDuration);
}

/**
 * The source range of a clip covering words `range.start..range.end`. It pads
 * each side by up to CLIP_PAD, but never more than half the pause to the
 * neighbouring word, so the clip can't pick up speech from outside it.
 */
export function clipFromWordRange(
  words: readonly Word[],
  range: WordRange,
  sourceDuration: number,
  pad = CLIP_PAD,
): { start: number; end: number } {
  const first = words[range.start];
  const last = words[range.end];
  const before = words[range.start - 1];
  const after = words[range.end + 1];
  const padBefore = before ? Math.min(pad, Math.max(0, (first.start - before.end) / 2)) : pad;
  const padAfter = after ? Math.min(pad, Math.max(0, (after.start - last.end) / 2)) : pad;
  return {
    start: round3(Math.max(0, first.start - padBefore)),
    end: round3(Math.min(Math.max(0, sourceDuration), last.end + padAfter)),
  };
}

/** Words belonging to the clip range: those whose midpoint falls inside [start, end). */
export function wordsInRange(words: readonly Word[], start: number, end: number): Word[] {
  return words.filter((w) => {
    const mid = (w.start + w.end) / 2;
    return mid >= start && mid < end;
  });
}

/**
 * What a clip made from words `range` would be: its source range and its edited
 * duration under `edl`. A duration of 0 means every bit of it is cut.
 */
export function planClip(
  words: readonly Word[],
  range: WordRange,
  edl: Edl,
): { start: number; end: number; duration: number } {
  const { start, end } = clipFromWordRange(words, range, edl.sourceDuration);
  return { start, end, duration: clipEdl(edl, start, end).duration };
}
