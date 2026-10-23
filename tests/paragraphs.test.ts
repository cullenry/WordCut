import { describe, expect, it } from "vitest";
import { groupParagraphs, isSentenceEnd, paragraphIndexOfWord } from "@/lib/transcript/paragraphs";
import type { Word } from "@/lib/transcript/types";

let n = 0;
const w = (text: string, start: number, end: number, extra: Partial<Word> = {}): Word => ({
  id: `w${n++}`,
  text,
  start,
  end,
  confidence: 1,
  ...extra,
});

/** Back-to-back words, one second apart, from plain text. */
const run = (text: string, extra: Partial<Word> = {}, from = 0) =>
  text.split(" ").map((t, i) => w(t, from + i, from + i + 0.5, extra));

const spans = (words: Word[], opts?: Parameters<typeof groupParagraphs>[1]) =>
  groupParagraphs(words, opts).map((p) => [p.startIndex, p.endIndex]);

describe("isSentenceEnd", () => {
  it.each(["done.", "really?", "wow!", 'said "go."', "end.)", "so…"])("%s ends a sentence", (t) =>
    expect(isSentenceEnd(t)).toBe(true),
  );
  it.each(["and", "well,", "Mr.", "Dr.", "J.", "e.g.", "3,5"])("%s does not", (t) =>
    expect(isSentenceEnd(t)).toBe(false),
  );
});

describe("groupParagraphs", () => {
  it("returns nothing for no words", () => expect(groupParagraphs([])).toEqual([]));

  it("breaks on long pauses, even mid-sentence", () => {
    const words = [w("a", 0, 1), w("b", 1.1, 2), w("c", 5, 6)];
    expect(spans(words)).toEqual([
      [0, 2],
      [2, 3],
    ]);
  });

  it("breaks on a speaker change only at a sentence end", () => {
    const words = [
      ...run("hello there.", { speaker: 0 }),
      ...run("hi back.", { speaker: 1 }, 2),
    ];
    expect(spans(words)).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it("ignores a speaker change in the middle of a sentence", () => {
    const words = [...run("so I think", { speaker: 0 }), ...run("yes that all works.", { speaker: 1 }, 3)];
    const ps = groupParagraphs(words);
    expect(ps).toHaveLength(1);
    expect(ps[0].speaker).toBe(1);
  });

  it("holds a long run until the next sentence end after the soft limit", () => {
    const words = run("one two three four five six. seven eight");
    expect(spans(words, { softMaxWords: 4 })).toEqual([
      [0, 6],
      [6, 8],
    ]);
  });

  it("never breaks mid-sentence at the soft limit", () => {
    const words = run("a b c d e f g h i j.");
    expect(spans(words, { softMaxWords: 3 })).toEqual([[0, 10]]);
  });

  it("falls back to a clause end for very long unpunctuated runs", () => {
    const words = run("a b c d e, f g h i j k l");
    expect(spans(words, { hardMaxWords: 4 })).toEqual([
      [0, 5],
      [5, 12],
    ]);
  });

  it("finally cuts anywhere at twice the hard limit", () => {
    const words = run("a b c d e f g");
    expect(spans(words, { hardMaxWords: 2 })).toEqual([
      [0, 4],
      [4, 7],
    ]);
  });

  it("never spans chunks", () => {
    const words = [...run("a b", { chunk: 0 }), ...run("c d", { chunk: 1 }, 2)];
    expect(spans(words)).toEqual([
      [0, 2],
      [2, 4],
    ]);
    expect(groupParagraphs(words)[1].chunk).toBe(1);
  });

  it("reports start and end times", () => {
    const [p] = groupParagraphs([w("a", 1, 2), w("b", 2, 3)]);
    expect(p).toMatchObject({ start: 1, end: 3 });
  });

  it("uses the most common speaker", () => {
    const words = [w("a", 0, 1, { speaker: 1 }), w("b", 1, 2, { speaker: 0 }), w("c.", 2, 3, { speaker: 0 })];
    expect(groupParagraphs(words)[0].speaker).toBe(0);
  });
});

describe("paragraphIndexOfWord", () => {
  const ps = groupParagraphs([w("a.", 0, 1), w("b", 5, 6), w("c", 6, 7)]);

  it("finds the containing paragraph", () => {
    expect([0, 1, 2].map((i) => paragraphIndexOfWord(ps, i))).toEqual([0, 1, 1]);
  });

  it("returns -1 when out of range", () => {
    expect(paragraphIndexOfWord(ps, 3)).toBe(-1);
    expect(paragraphIndexOfWord(ps, -1)).toBe(-1);
    expect(paragraphIndexOfWord([], 0)).toBe(-1);
  });
});
