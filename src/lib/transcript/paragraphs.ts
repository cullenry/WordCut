import type { Word } from "./types";

export interface Paragraph {
  /** Index of the first word (inclusive). */
  startIndex: number;
  /** Index after the last word (exclusive). */
  endIndex: number;
  start: number;
  end: number;
  speaker?: number;
}

/**
 * Groups words into display paragraphs, breaking on long pauses, speaker
 * changes, or when a paragraph gets too long (preferring a sentence end).
 */
export function groupParagraphs(
  words: Word[],
  { gapSeconds = 1.2, softMaxWords = 60, hardMaxWords = 120 } = {},
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let startIndex = 0;

  for (let i = 1; i <= words.length; i++) {
    const prev = words[i - 1];
    const cur = words[i];
    const count = i - startIndex;
    const shouldBreak =
      cur === undefined ||
      cur.start - prev.end >= gapSeconds ||
      cur.speaker !== prev.speaker ||
      count >= hardMaxWords ||
      (count >= softMaxWords && /[.!?]$/.test(prev.text));
    if (shouldBreak) {
      paragraphs.push({
        startIndex,
        endIndex: i,
        start: words[startIndex].start,
        end: prev.end,
        speaker: words[startIndex].speaker,
      });
      startIndex = i;
    }
  }
  return paragraphs;
}
