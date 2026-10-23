import { describe, expect, it } from "vitest";
import type { RawWord } from "@/lib/transcript/types";
import { stitchChunks } from "@/lib/transcription/stitch";

const w = (text: string, start: number, end: number, extra: Partial<RawWord> = {}): RawWord => ({
  text,
  start,
  end,
  confidence: 0.9,
  ...extra,
});

describe("stitchChunks", () => {
  it("offsets each chunk's words by the chunk start", () => {
    const words = stitchChunks([
      { start: 0, end: 10, words: [w("hello", 1, 1.5), w("there", 1.6, 2)] },
      { start: 10, end: 20, words: [w("second", 0.5, 1), w("chunk", 1.2, 1.8)] },
    ]);
    expect(words.map((x) => [x.text, x.start, x.end])).toEqual([
      ["hello", 1, 1.5],
      ["there", 1.6, 2],
      ["second", 10.5, 11],
      ["chunk", 11.2, 11.8],
    ]);
  });

  it("assigns sequential ids across chunks", () => {
    const words = stitchChunks([
      { start: 0, end: 5, words: [w("a", 0, 1)] },
      { start: 5, end: 10, words: [w("b", 0, 1), w("c", 1, 2)] },
    ]);
    expect(words.map((x) => x.id)).toEqual(["w0", "w1", "w2"]);
  });

  it("orders chunks by start time even if they finish out of order", () => {
    const words = stitchChunks([
      { start: 30, end: 60, words: [w("later", 1, 2)] },
      { start: 0, end: 30, words: [w("earlier", 1, 2)] },
    ]);
    expect(words.map((x) => x.text)).toEqual(["earlier", "later"]);
  });

  it("clamps words that spill past their chunk end", () => {
    const words = stitchChunks([
      { start: 0, end: 10, words: [w("edge", 9.8, 10.4)] },
      { start: 10, end: 20, words: [w("next", 0.1, 0.5)] },
    ]);
    expect(words[0]).toMatchObject({ start: 9.8, end: 10 });
    expect(words[1]).toMatchObject({ start: 10.1, end: 10.5 });
  });

  it("keeps times monotonic when a provider returns overlapping words", () => {
    const words = stitchChunks([{ start: 0, end: 10, words: [w("one", 1, 2), w("two", 1.8, 2.5)] }]);
    expect(words[1].start).toBe(2);
    expect(words[1].end).toBe(2.5);
  });

  it("drops empty words and trims whitespace", () => {
    const words = stitchChunks([{ start: 0, end: 5, words: [w(" ", 0, 1), w(" hi ", 1, 2)] }]);
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe("hi");
  });

  it("rounds to millisecond precision to avoid float drift", () => {
    const [word] = stitchChunks([{ start: 600.1, end: 1200, words: [w("x", 0.2, 0.3)] }]);
    expect(word.start).toBe(600.3);
    expect(word.end).toBe(600.4);
  });

  it("keeps speaker labels and confidence", () => {
    const [word] = stitchChunks([{ start: 0, end: 5, words: [w("x", 0, 1, { speaker: 1, confidence: 0.5 })] }]);
    expect(word).toMatchObject({ speaker: 1, confidence: 0.5 });
  });

  it("handles chunks with no words", () => {
    expect(stitchChunks([{ start: 0, end: 5, words: [] }])).toEqual([]);
  });
});
