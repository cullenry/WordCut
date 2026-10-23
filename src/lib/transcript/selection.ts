import type { Word } from "./types";

/**
 * A selection over the transcript, stored as the word ids where the drag began
 * (anchor) and where it is now (focus). Focus may be before anchor. Ids rather
 * than indexes so the selection survives anything that reorders or filters words.
 */
export interface Selection {
  anchor: string;
  focus: string;
}

/** Inclusive, ordered word-index range. */
export interface WordRange {
  start: number;
  end: number;
}

export type WordIndex = ReadonlyMap<string, number>;

export function buildWordIndex(words: readonly Word[]): WordIndex {
  return new Map(words.map((w, i) => [w.id, i]));
}

export const collapsedSelection = (id: string): Selection => ({ anchor: id, focus: id });

/** Moves the focus, keeping the anchor; with no selection yet, starts one at `id`. */
export function extendSelection(selection: Selection | null, id: string): Selection {
  return selection ? { anchor: selection.anchor, focus: id } : collapsedSelection(id);
}

/** The ordered index range, or null if empty or either id is unknown. */
export function selectionRange(selection: Selection | null, index: WordIndex): WordRange | null {
  if (!selection) return null;
  const a = index.get(selection.anchor);
  const f = index.get(selection.focus);
  if (a === undefined || f === undefined) return null;
  return a <= f ? { start: a, end: f } : { start: f, end: a };
}

export function rangeContains(range: WordRange | null, wordIndex: number): boolean {
  return range !== null && wordIndex >= range.start && wordIndex <= range.end;
}

/** The part of `range` falling within [from, to), or null if they don't overlap. */
export function clipRange(range: WordRange | null, from: number, to: number): WordRange | null {
  if (!range || range.end < from || range.start >= to) return null;
  return { start: Math.max(range.start, from), end: Math.min(range.end, to - 1) };
}

export function selectedIds(words: readonly Word[], range: WordRange | null): string[] {
  return range ? words.slice(range.start, range.end + 1).map((w) => w.id) : [];
}

export function selectedText(words: readonly Word[], range: WordRange | null): string {
  return range ? words.slice(range.start, range.end + 1).map((w) => w.text).join(" ") : "";
}

/** Source-time span covered by the range, or null if empty. */
export function rangeTimes(words: readonly Word[], range: WordRange | null): { start: number; end: number } | null {
  return range ? { start: words[range.start].start, end: words[range.end].end } : null;
}
