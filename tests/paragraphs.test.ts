import { describe, expect, it } from "vitest";
import { groupParagraphs } from "@/lib/transcript/paragraphs";
import type { Word } from "@/lib/transcript/types";

let n = 0;
const w = (text: string, start: number, end: number, speaker?: number): Word => ({
  id: `w${n++}`,
  text,
  start,
  end,
  confidence: 1,
  speaker,
});

describe("groupParagraphs", () => {
  it("returns nothing for no words", () => expect(groupParagraphs([])).toEqual([]));

  it("breaks on long pauses", () => {
    const words = [w("a", 0, 1), w("b", 1.1, 2), w("c", 5, 6)];
    expect(groupParagraphs(words).map((p) => [p.startIndex, p.endIndex])).toEqual([
      [0, 2],
      [2, 3],
    ]);
  });

  it("breaks on speaker changes", () => {
    const words = [w("a", 0, 1, 0), w("b", 1, 2, 1)];
    const ps = groupParagraphs(words);
    expect(ps).toHaveLength(2);
    expect(ps[1].speaker).toBe(1);
  });

  it("breaks long runs at a sentence end after the soft limit", () => {
    const words = Array.from({ length: 10 }, (_, i) => w(i === 5 ? "end." : "x", i, i + 0.5));
    const ps = groupParagraphs(words, { gapSeconds: 10, softMaxWords: 4, hardMaxWords: 100 });
    expect(ps[0].endIndex).toBe(6);
  });

  it("forces a break at the hard limit", () => {
    const words = Array.from({ length: 5 }, (_, i) => w("x", i, i + 0.5));
    const ps = groupParagraphs(words, { gapSeconds: 10, softMaxWords: 100, hardMaxWords: 2 });
    expect(ps.map((p) => p.endIndex - p.startIndex)).toEqual([2, 2, 1]);
  });

  it("reports paragraph start and end times", () => {
    const [p] = groupParagraphs([w("a", 1, 2), w("b", 2, 3)]);
    expect(p).toMatchObject({ start: 1, end: 3 });
  });
});
