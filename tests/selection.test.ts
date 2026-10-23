import { describe, expect, it } from "vitest";
import {
  buildWordIndex,
  clipRange,
  collapsedSelection,
  extendSelection,
  rangeContains,
  rangeTimes,
  selectedIds,
  selectedText,
  selectionRange,
} from "@/lib/transcript/selection";
import type { Word } from "@/lib/transcript/types";

const words: Word[] = ["a", "b", "c", "d", "e"].map((text, i) => ({
  id: `id-${text}`,
  text,
  start: i,
  end: i + 0.5,
  confidence: 1,
}));
const index = buildWordIndex(words);

describe("selection model", () => {
  it("has no range without a selection", () => expect(selectionRange(null, index)).toBeNull());

  it("collapsed selection covers one word", () => {
    expect(selectionRange(collapsedSelection("id-c"), index)).toEqual({ start: 2, end: 2 });
  });

  it("orders the range when focus is before anchor", () => {
    expect(selectionRange({ anchor: "id-d", focus: "id-b" }, index)).toEqual({ start: 1, end: 3 });
  });

  it("returns null for unknown ids", () => {
    expect(selectionRange({ anchor: "nope", focus: "id-b" }, index)).toBeNull();
  });

  it("extends from the anchor, in either direction", () => {
    const sel = extendSelection(collapsedSelection("id-c"), "id-e");
    expect(selectionRange(sel, index)).toEqual({ start: 2, end: 4 });
    expect(selectionRange(extendSelection(sel, "id-a"), index)).toEqual({ start: 0, end: 2 });
  });

  it("starts a selection when extending from nothing", () => {
    expect(extendSelection(null, "id-b")).toEqual({ anchor: "id-b", focus: "id-b" });
  });

  it("checks containment inclusively", () => {
    const r = { start: 1, end: 3 };
    expect([0, 1, 3, 4].map((i) => rangeContains(r, i))).toEqual([false, true, true, false]);
    expect(rangeContains(null, 1)).toBe(false);
  });

  it("clips a range to a window", () => {
    const r = { start: 1, end: 4 };
    expect(clipRange(r, 0, 3)).toEqual({ start: 1, end: 2 });
    expect(clipRange(r, 3, 10)).toEqual({ start: 3, end: 4 });
    expect(clipRange(r, 5, 8)).toBeNull();
    expect(clipRange(r, 0, 1)).toBeNull();
    expect(clipRange(null, 0, 5)).toBeNull();
  });

  it("lists selected ids, text and times without touching the words", () => {
    const r = { start: 1, end: 3 };
    expect(selectedIds(words, r)).toEqual(["id-b", "id-c", "id-d"]);
    expect(selectedText(words, r)).toBe("b c d");
    expect(rangeTimes(words, r)).toEqual({ start: 1, end: 3.5 });
    expect(selectedIds(words, null)).toEqual([]);
    expect(rangeTimes(words, null)).toBeNull();
  });
});
