import type { Word } from "./types";

export interface Paragraph {
  /** Index of the first word (inclusive). */
  startIndex: number;
  /** Index after the last word (exclusive). */
  endIndex: number;
  start: number;
  end: number;
  /** Most common speaker in the paragraph. */
  speaker?: number;
  /** Chunk the paragraph's words came from; paragraphs never span chunks. */
  chunk?: number;
}

export interface ParagraphOptions {
  /** A silence at least this long always starts a new paragraph. */
  pauseSeconds?: number;
  /** Once a paragraph has this many words, the next sentence end closes it. */
  softMaxWords?: number;
  /** Past this many words, a clause end (comma etc.) will do for unpunctuated or run-on speech. */
  hardMaxWords?: number;
}

const NOT_SENTENCE_END = new Set(["mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "st.", "vs.", "e.g.", "i.e."]);

/** True when the word closes a sentence ("." "!" "?" "…", optionally followed by a closing quote or bracket). */
export function isSentenceEnd(text: string): boolean {
  if (!/[.!?…]["'”’)\]]*$/.test(text)) return false;
  const bare = text.replace(/["'”’)\]]+$/, "").toLowerCase();
  if (NOT_SENTENCE_END.has(bare)) return false;
  return !/^[a-z]\.$/i.test(bare); // a lone initial, like the J. in "J. Smith"
}

const isClauseEnd = (text: string) => /[,;:–—-]["'”’)\]]*$/.test(text);

/**
 * Groups words into display paragraphs. Breaks land on a sentence end or a long
 * pause, never mid-sentence, with two exceptions: a pause is a break wherever it
 * falls, and a very long run with no sentence end is cut at a clause end so one
 * paragraph can't grow without bound.
 */
export function groupParagraphs(
  words: Word[],
  { pauseSeconds = 1.2, softMaxWords = 60, hardMaxWords = 140 }: ParagraphOptions = {},
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let startIndex = 0;

  for (let i = 1; i <= words.length; i++) {
    const prev = words[i - 1];
    const cur = words[i];
    const count = i - startIndex;
    let shouldBreak = cur === undefined || cur.chunk !== prev.chunk || cur.start - prev.end >= pauseSeconds;

    if (!shouldBreak) {
      if (isSentenceEnd(prev.text)) {
        const speakerChanged = cur.speaker !== undefined && prev.speaker !== undefined && cur.speaker !== prev.speaker;
        shouldBreak = speakerChanged || count >= softMaxWords;
      } else {
        shouldBreak = (count >= hardMaxWords && isClauseEnd(prev.text)) || count >= hardMaxWords * 2;
      }
    }

    if (shouldBreak) {
      paragraphs.push({
        startIndex,
        endIndex: i,
        start: words[startIndex].start,
        end: prev.end,
        speaker: dominantSpeaker(words, startIndex, i),
        chunk: words[startIndex].chunk,
      });
      startIndex = i;
    }
  }
  return paragraphs;
}

function dominantSpeaker(words: Word[], from: number, to: number): number | undefined {
  const counts = new Map<number, number>();
  let best: number | undefined;
  for (let i = from; i < to; i++) {
    const s = words[i].speaker;
    if (s === undefined) continue;
    const n = (counts.get(s) ?? 0) + 1;
    counts.set(s, n);
    if (best === undefined || n > counts.get(best)!) best = s;
  }
  return best;
}

/** Index of the paragraph containing the word at `wordIndex`, or -1 if out of range. */
export function paragraphIndexOfWord(paragraphs: Paragraph[], wordIndex: number): number {
  let lo = 0;
  let hi = paragraphs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = paragraphs[mid];
    if (wordIndex < p.startIndex) hi = mid - 1;
    else if (wordIndex >= p.endIndex) lo = mid + 1;
    else return mid;
  }
  return -1;
}
