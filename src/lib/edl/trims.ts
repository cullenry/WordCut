import type { Word } from "@/lib/transcript/types";

/**
 * A shortened pause. The gap between word `afterId` and the word after it is
 * cut down to `keep` seconds of silence. Words stay untouched; only the
 * (id, keep) pair is stored, and the removed span is derived from word timings.
 */
export interface SilenceTrim {
  afterId: string;
  keep: number;
}

/** Trims by the id of the word before the gap. */
export type TrimMap = ReadonlyMap<string, number>;

export interface Span {
  start: number;
  end: number;
}

/**
 * The source spans that trims remove, in order. Each is the middle of its gap,
 * `keep / 2` clear of both neighbouring words, so it never touches speech.
 * A trim whose gap is already `keep` long or shorter (or whose word is last)
 * removes nothing; slivers under a millisecond are dropped later by fromSpans.
 */
export function trimSpans(words: readonly Word[], trims: TrimMap): Span[] {
  const out: Span[] = [];
  if (trims.size === 0) return out;
  for (let i = 0; i < words.length - 1; i++) {
    const keep = trims.get(words[i].id);
    if (keep === undefined) continue;
    const from = words[i].end;
    const to = words[i + 1].start;
    const kept = Math.max(keep, 0);
    if (to - from - kept <= 0) continue;
    out.push({ start: from + kept / 2, end: to - kept / 2 });
  }
  return out;
}

/**
 * `kept` minus `removed`. Both must be sorted and internally non-overlapping.
 * Slivers are left for fromSpans to drop.
 */
export function subtractSpans(kept: readonly Span[], removed: readonly Span[]): Span[] {
  if (removed.length === 0) return [...kept];
  const out: Span[] = [];
  let j = 0;
  for (const k of kept) {
    let start = k.start;
    while (j < removed.length && removed[j].end <= start) j++;
    for (let r = j; r < removed.length && removed[r].start < k.end; r++) {
      if (removed[r].start > start) out.push({ start, end: removed[r].start });
      start = Math.max(start, removed[r].end);
    }
    if (start < k.end) out.push({ start, end: k.end });
  }
  return out;
}

/** Saved trims as a map, dropping entries that no longer fit the transcript. */
export function sanitizeTrims(words: readonly Word[], saved: Iterable<SilenceTrim>): TrimMap {
  const lastIndexOk = new Set(words.slice(0, -1).map((w) => w.id));
  const out = new Map<string, number>();
  for (const t of saved) {
    if (lastIndexOk.has(t.afterId) && Number.isFinite(t.keep) && t.keep >= 0) out.set(t.afterId, t.keep);
  }
  return out;
}

export const trimsToList = (trims: TrimMap): SilenceTrim[] =>
  [...trims].map(([afterId, keep]) => ({ afterId, keep }));
