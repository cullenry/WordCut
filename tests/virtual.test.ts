import { describe, expect, it } from "vitest";
import { buildOffsets, estimateParagraphHeight, rowAt, visibleRange } from "@/lib/transcript/virtual";

describe("buildOffsets", () => {
  it("accumulates row tops with the total last", () => {
    expect(Array.from(buildOffsets([10, 20, 30]))).toEqual([0, 10, 30, 60]);
  });
  it("handles no rows", () => expect(Array.from(buildOffsets([]))).toEqual([0]));
});

describe("rowAt", () => {
  const offsets = buildOffsets([10, 20, 30]);
  it("finds the row containing a position", () => {
    expect([0, 9.9, 10, 29.9, 30, 59.9].map((y) => rowAt(offsets, y))).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it("clamps outside the content", () => {
    expect(rowAt(offsets, -50)).toBe(0);
    expect(rowAt(offsets, 500)).toBe(2);
  });
});

describe("visibleRange", () => {
  const offsets = buildOffsets(Array.from({ length: 100 }, () => 100));

  it("covers the viewport plus overscan", () => {
    // viewport 1000..1500, overscan 200 => y from 800 to 1700
    expect(visibleRange(offsets, 1000, 500, 200)).toEqual({ start: 8, end: 18 });
  });

  it("clamps at both ends", () => {
    expect(visibleRange(offsets, 0, 300, 200)).toEqual({ start: 0, end: 6 });
    expect(visibleRange(offsets, 9900, 300, 200)).toEqual({ start: 97, end: 100 });
  });

  it("renders nothing for no rows", () => expect(visibleRange(buildOffsets([]), 0, 500)).toEqual({ start: 0, end: 0 }));

  it("renders a bounded window for a huge transcript", () => {
    const heights = Array.from({ length: 5000 }, () => 120);
    const { start, end } = visibleRange(buildOffsets(heights), 200_000, 800, 400);
    expect(end - start).toBeLessThan(20);
  });
});

describe("estimateParagraphHeight", () => {
  const base = { textWidth: 400, charWidth: 8, charsPerWord: 6, lineHeight: 28, extra: 20 };

  it("is one line for a short paragraph", () => expect(estimateParagraphHeight(3, base)).toBe(48));

  it("grows with word count", () => {
    expect(estimateParagraphHeight(100, base)).toBeGreaterThan(estimateParagraphHeight(10, base));
  });

  it("gets taller when the panel is narrower", () => {
    expect(estimateParagraphHeight(50, { ...base, textWidth: 200 })).toBeGreaterThan(
      estimateParagraphHeight(50, base),
    );
  });

  it("never returns less than one line", () => expect(estimateParagraphHeight(0, base)).toBe(48));
});
