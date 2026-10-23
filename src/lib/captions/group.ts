/** A word on a clip's own timeline: seconds from the start of the edited clip. */
export interface CaptionWord {
  id: string;
  text: string;
  start: number;
  end: number;
}

/** Words on screen together: at most `maxLines` lines. */
export interface CaptionPage {
  /** When the page appears (its first word starts) and goes away. Pages never overlap. */
  start: number;
  end: number;
  words: CaptionWord[];
  lines: CaptionWord[][];
}

export interface GroupOptions {
  maxWordsPerLine: number;
  maxLines: number;
  /** A line is closed early once it would pass this many characters (a lone long word still gets its own line). */
  maxCharsPerLine: number;
  /** A silence this long starts a new page. */
  breakGap: number;
  /** How long a page stays after its last word ends, if nothing follows sooner. */
  hold: number;
}

export const DEFAULT_GROUPING: GroupOptions = {
  maxWordsPerLine: 4,
  maxLines: 2,
  maxCharsPerLine: 22,
  breakGap: 0.7,
  hold: 0.35,
};

const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

/**
 * Groups words (already cut-free, in clip time) into pages of short lines.
 * A pause of `breakGap` or the end of a sentence always starts a new page;
 * otherwise lines fill to `maxWordsPerLine` words and pages to `maxLines` lines.
 * A run that needs several lines is split evenly, so a fifth word never sits alone.
 */
export function groupCaptionPages(words: readonly CaptionWord[], options: Partial<GroupOptions> = {}): CaptionPage[] {
  const o = { ...DEFAULT_GROUPING, ...options };
  const maxWords = Math.max(1, Math.floor(o.maxWordsPerLine));
  const maxLines = Math.max(1, Math.floor(o.maxLines));

  const groups: CaptionWord[][][] = []; // pages of lines
  for (const run of splitRuns(words, o.breakGap)) {
    const lines = splitLines(run, maxWords, o.maxCharsPerLine);
    for (let i = 0; i < lines.length; i += maxLines) groups.push(lines.slice(i, i + maxLines));
  }

  return groups.map((lines, i) => {
    const flat = lines.flat();
    const first = flat[0];
    const last = flat[flat.length - 1];
    const next = groups[i + 1]?.[0][0];
    let end = last.end + o.hold;
    if (next) end = Math.min(end, next.start);
    return { start: first.start, end: Math.max(end, first.start), words: flat, lines };
  });
}

/** Runs of words with no sentence end or long pause inside them. */
function splitRuns(words: readonly CaptionWord[], breakGap: number): CaptionWord[][] {
  const runs: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.start - prev.end >= breakGap || SENTENCE_END.test(prev.text.trim()))) {
      runs.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

const charsOf = (line: readonly CaptionWord[]): number =>
  line.reduce((n, w) => n + w.text.trim().length, 0) + Math.max(0, line.length - 1);

function splitLines(run: CaptionWord[], maxWords: number, maxChars: number): CaptionWord[][] {
  const greedy: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  for (const w of run) {
    if (cur.length > 0 && (cur.length >= maxWords || charsOf(cur) + 1 + w.text.trim().length > maxChars)) {
      greedy.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) greedy.push(cur);
  if (greedy.length <= 1) return greedy;

  // Same number of lines, but evenly filled.
  const k = greedy.length;
  const base = Math.floor(run.length / k);
  const extra = run.length % k;
  const even: CaptionWord[][] = [];
  let at = 0;
  for (let i = 0; i < k; i++) {
    const n = base + (i < extra ? 1 : 0);
    even.push(run.slice(at, at + n));
    at += n;
  }
  const fits = (line: CaptionWord[]) => line.length <= maxWords && (line.length === 1 || charsOf(line) <= maxChars);
  return even.every(fits) ? even : greedy;
}

/** Index of the last item starting at or before `t`, or -1 if `t` is before the first. Items sorted by start. */
export function lastStartedIndex(items: readonly { start: number }[], t: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].start <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** Index of the page on screen at clip time `t`, or -1 between pages. */
export function pageIndexAt(pages: readonly CaptionPage[], t: number): number {
  const i = lastStartedIndex(pages, t);
  return i >= 0 && t < pages[i].end ? i : -1;
}

/**
 * The word being spoken at `t`: the last one that has started, and it stays
 * highlighted until the next begins, so there is no flicker in the gaps between
 * words. Null before the page's first word.
 */
export function activeWordAt(page: CaptionPage, t: number): CaptionWord | null {
  const i = lastStartedIndex(page.words, t);
  return i >= 0 ? page.words[i] : null;
}
