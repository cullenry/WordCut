import { describe, expect, it } from "vitest";
import { findWordIndexAtTime } from "@/lib/transcript/lookup";
import type { Word } from "@/lib/transcript/types";

const w = (i: number, start: number, end: number): Word => ({ id: `w${i}`, text: "x", start, end, confidence: 1 });
const words = [w(0, 1, 1.5), w(1, 1.6, 2), w(2, 10, 10.5)];

describe("findWordIndexAtTime", () => {
  it("returns -1 for no words", () => expect(findWordIndexAtTime([], 1)).toBe(-1));

  it("returns -1 before the first word", () => expect(findWordIndexAtTime(words, 0.5)).toBe(-1));

  it("finds the word containing the time", () => {
    expect(findWordIndexAtTime(words, 1.2)).toBe(0);
    expect(findWordIndexAtTime(words, 1.8)).toBe(1);
  });

  it("is inclusive of a word's start", () => expect(findWordIndexAtTime(words, 1.6)).toBe(1));

  it("holds the previous word through a short gap", () => {
    expect(findWordIndexAtTime(words, 1.55)).toBe(0);
    expect(findWordIndexAtTime(words, 2.4)).toBe(1);
  });

  it("returns -1 once the hold has passed in a long silence", () => {
    expect(findWordIndexAtTime(words, 2.6)).toBe(-1);
    expect(findWordIndexAtTime(words, 9)).toBe(-1);
  });

  it("honours a custom hold", () => expect(findWordIndexAtTime(words, 5, { holdSeconds: 4 })).toBe(1));

  it("keeps the last word highlighted only briefly after the end", () => {
    expect(findWordIndexAtTime(words, 10.9)).toBe(2);
    expect(findWordIndexAtTime(words, 12)).toBe(-1);
  });

  it("applies tolerance so a seek landing just before a word still selects it", () => {
    expect(findWordIndexAtTime(words, 9.99)).toBe(-1);
    expect(findWordIndexAtTime(words, 9.99, { toleranceSeconds: 0.02 })).toBe(2);
  });

  it("works on a large transcript", () => {
    const big = Array.from({ length: 50_000 }, (_, i) => w(i, i * 0.3, i * 0.3 + 0.25));
    expect(findWordIndexAtTime(big, 12_345 * 0.3 + 0.1)).toBe(12_345);
  });
});
