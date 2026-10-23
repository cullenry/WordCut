import type { Word } from "@/lib/transcript/types";

/** Words from [text, start, end] triples with positional ids, like real transcripts. */
export const makeWords = (rows: [string, number, number][]): Word[] =>
  rows.map(([text, start, end], i) => ({ id: `w${i}`, text, start, end, confidence: 1 }));

/** Words spoken back to back, 0.3 s each with a 0.1 s pause. */
export const sayWords = (...texts: string[]): Word[] =>
  makeWords(texts.map((t, i): [string, number, number] => [t, i * 0.4, i * 0.4 + 0.3]));
