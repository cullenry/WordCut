import type { Word } from "@/lib/transcript/types";

/** A spoken line: each word with its start and end in seconds, timed like a real transcript. */
export type Line = readonly (readonly [text: string, start: number, end: number])[];

export const toWords = (line: Line, prefix: string): Word[] =>
  line.map(([text, start, end], i) => ({ id: `${prefix}${i}`, text, start, end, confidence: 1 }));

/** The hero's line, also played by the animated editor. */
export const HERO_LINE: Line = [
  ["So,", 0.2, 0.42],
  ["um,", 0.55, 0.95],
  ["here's", 1.2, 1.48],
  ["the", 1.5, 1.6],
  ["trick.", 1.62, 1.98],
  ["You", 2.4, 2.55],
  ["record", 2.58, 2.95],
  ["way", 2.98, 3.15],
  ["more", 3.18, 3.4],
  ["than", 3.42, 3.52],
  ["you", 3.54, 3.64],
  ["need,", 3.66, 3.98],
  ["uh,", 4.3, 4.8],
  ["then", 5.05, 5.24],
  ["you", 5.26, 5.36],
  ["delete", 5.4, 5.78],
  ["the", 5.8, 5.88],
  ["words", 5.9, 6.22],
  ["you", 6.24, 6.32],
  ["don't", 6.34, 6.58],
  ["want.", 6.6, 7.05],
];
export const HERO_DURATION = 7.4;

/** The playable demo's line: a different take, with phrase fillers as well as hesitations. */
export const DEMO_LINE: Line = [
  ["Okay,", 0.15, 0.45],
  ["so,", 0.6, 0.8],
  ["like,", 0.95, 1.2],
  ["the", 1.3, 1.38],
  ["first", 1.4, 1.7],
  ["take", 1.72, 1.98],
  ["was,", 2.0, 2.2],
  ["um,", 2.5, 2.95],
  ["honestly", 3.2, 3.62],
  ["pretty", 3.65, 3.9],
  ["rough.", 3.93, 4.3],
  ["But", 4.75, 4.9],
  ["the,", 4.92, 5.05],
  ["uh,", 5.3, 5.8],
  ["second", 6.0, 6.35],
  ["one?", 6.38, 6.7],
  ["You", 7.05, 7.15],
  ["know", 7.17, 7.35],
  ["what,", 7.37, 7.6],
  ["that", 7.75, 7.9],
  ["one's", 7.92, 8.15],
  ["a", 8.17, 8.22],
  ["keeper.", 8.25, 8.75],
];
export const DEMO_DURATION = 9;

/** "1:02.4": minutes, seconds and tenths, like a timeline readout. */
export function timecode(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const s = Math.floor((tenths % 600) / 10);
  return `${Math.floor(tenths / 600)}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}
