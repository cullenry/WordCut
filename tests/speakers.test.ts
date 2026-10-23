import { describe, expect, it } from "vitest";
import type { Paragraph } from "@/lib/transcript/paragraphs";
import { isMultiChunk, speakerMarks } from "@/lib/transcript/speakers";
import type { Word } from "@/lib/transcript/types";

const p = (speaker: number | undefined, chunk?: number): Paragraph => ({
  startIndex: 0,
  endIndex: 1,
  start: 0,
  end: 1,
  speaker,
  chunk,
});

const word = (chunk?: number): Word => ({ id: "w", text: "x", start: 0, end: 1, confidence: 1, chunk });

describe("speakerMarks", () => {
  it("marks only where the speaker changes", () => {
    const marks = speakerMarks([p(0, 0), p(0, 0), p(1, 0), p(1, 0), p(0, 0)], false);
    expect(marks).toEqual([
      null,
      null,
      { kind: "speaker", speaker: 1 },
      null,
      { kind: "speaker", speaker: 0 },
    ]);
  });

  it("never marks the first paragraph", () => expect(speakerMarks([p(2, 0)], false)).toEqual([null]));

  it("makes no identity claim for multi-chunk transcripts", () => {
    expect(speakerMarks([p(0, 0), p(1, 0)], true)).toEqual([null, { kind: "change" }]);
  });

  it("says nothing across a chunk boundary, where numbering may differ", () => {
    expect(speakerMarks([p(0, 0), p(1, 1)], true)).toEqual([null, null]);
  });

  it("says nothing when speakers are unknown", () => {
    expect(speakerMarks([p(undefined), p(1), p(undefined)], false)).toEqual([null, null, null]);
  });
});

describe("isMultiChunk", () => {
  it("is false for no words", () => expect(isMultiChunk({ words: [], duration: 5000 })).toBe(false));

  it("uses chunk indexes when present", () => {
    expect(isMultiChunk({ words: [word(0), word(0)], duration: 5000 })).toBe(false);
    expect(isMultiChunk({ words: [word(0), word(1)], duration: 60 })).toBe(true);
  });

  it("falls back to duration for transcripts saved without chunk info", () => {
    expect(isMultiChunk({ words: [word()], duration: 600 })).toBe(false);
    expect(isMultiChunk({ words: [word()], duration: 800 })).toBe(true);
  });
});
