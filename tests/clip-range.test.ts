import { describe, expect, it } from "vitest";
import { clipEdl, clipFromWordRange, wordsInRange } from "@/lib/clips/range";
import { buildEdl, fromSpans } from "@/lib/edl/edl";
import { editedToSource, playbackJump, sourceToEdited } from "@/lib/edl/time";
import { makeWords } from "./helpers";

// Kept 1-2, 3-5 and 7-8 of a 10 s source: edited offsets 0, 1, 3.
const edl = fromSpans(
  [
    { start: 1, end: 2 },
    { start: 3, end: 5 },
    { start: 7, end: 8 },
  ],
  10,
);

describe("clipEdl", () => {
  it("keeps only the kept ranges inside the clip, laid out from 0", () => {
    const c = clipEdl(edl, 1.5, 7.5);
    expect(c.ranges).toEqual([
      { start: 1.5, end: 2, offset: 0 },
      { start: 3, end: 5, offset: 0.5 },
      { start: 7, end: 7.5, offset: 2.5 },
    ]);
    expect(c.duration).toBe(3);
  });

  it("spans cuts: the clip duration is the edited duration, not end - start", () => {
    const c = clipEdl(edl, 0, 10);
    expect(c.duration).toBe(edl.duration);
    expect(clipEdl(edl, 1, 8).duration).toBe(4); // 7 s of source
  });

  it("starts on the next kept range when the clip starts inside a cut", () => {
    const c = clipEdl(edl, 2.4, 6);
    expect(c.ranges[0]).toEqual({ start: 3, end: 5, offset: 0 });
    expect(c.duration).toBe(2);
  });

  it("ends at the last kept range when the clip ends inside a cut", () => {
    const c = clipEdl(edl, 1, 6.5);
    expect(c.ranges.at(-1)).toMatchObject({ start: 3, end: 5 });
    expect(c.duration).toBe(3);
  });

  it("is empty when everything in the range is cut", () => {
    const c = clipEdl(edl, 5.2, 6.8);
    expect(c.ranges).toEqual([]);
    expect(c.duration).toBe(0);
  });

  it("is empty for a zero or backwards range", () => {
    expect(clipEdl(edl, 3, 3).duration).toBe(0);
    expect(clipEdl(edl, 4, 3).duration).toBe(0);
  });

  it("is a normal Edl: time mapping and playback work in clip time", () => {
    const c = clipEdl(edl, 1.5, 7.5);
    expect(sourceToEdited(c, 4)).toBe(1.5);
    expect(editedToSource(c, 1.5)).toBe(4);
    // at the end of the first piece, playback jumps over the cut to the second
    expect(playbackJump(c, 1.99, 0.03)).toBe(3);
    // at the end of the clip it stops, even though more video follows in the source
    expect(playbackJump(c, 7.49, 0.03)).toBe("end");
  });

  it("agrees with the full EDL for every kept time inside the clip", () => {
    const c = clipEdl(edl, 1.5, 7.5);
    const base = sourceToEdited(edl, 1.5);
    for (let t = 1.5; t < 2; t += 0.1) expect(sourceToEdited(c, t)).toBeCloseTo(sourceToEdited(edl, t) - base, 6);
    for (let t = 3; t < 5; t += 0.1) expect(sourceToEdited(c, t)).toBeCloseTo(sourceToEdited(edl, t) - base, 6);
  });

  it("follows trimmed pauses, because they are cuts in the EDL", () => {
    const words = makeWords([
      ["a", 1, 2],
      ["b", 4, 5],
    ]);
    const trimmed = buildEdl(words, new Set(), 12, { trims: new Map([["w0", 0.4]]) });
    // the pause 2..4 is cut to 0.4 s: removed span [2.2, 3.8]
    expect(clipEdl(trimmed, 0.5, 6).duration).toBeCloseTo(5.5 - 1.6, 6);
  });

  it("clips a single-word range to just that word", () => {
    const words = makeWords([
      ["one", 1, 1.3],
      ["two", 1.5, 1.9],
      ["three", 2.1, 2.5],
    ]);
    const e = buildEdl(words, new Set(), 4);
    const { start, end } = clipFromWordRange(words, { start: 1, end: 1 }, 4);
    expect(clipEdl(e, start, end).duration).toBeCloseTo(end - start, 6);
    expect(end - start).toBeCloseTo(0.6, 6);
  });
});

describe("clipFromWordRange", () => {
  const words = makeWords([
    ["a", 1, 1.4],
    ["b", 1.5, 1.9],
    ["c", 3, 3.4],
    ["d", 3.45, 3.9],
  ]);

  it("pads each side, but never past half the pause to the neighbour", () => {
    // c: before is b (1.9 → 3: pause 1.1), after is d (pause 0.05)
    const r = clipFromWordRange(words, { start: 2, end: 2 }, 10, 0.12);
    expect(r.start).toBeCloseTo(2.88, 6);
    expect(r.end).toBeCloseTo(3.425, 6);
  });

  it("does not pad into overlapping or touching neighbours", () => {
    const overlapping = makeWords([
      ["a", 1, 2],
      ["b", 1.9, 2.5],
      ["c", 2.5, 3],
    ]);
    const r = clipFromWordRange(overlapping, { start: 1, end: 1 }, 10);
    expect(r.start).toBe(1.9);
    expect(r.end).toBe(2.5);
  });

  it("pads the very first and last word up to the file edges", () => {
    const edge = makeWords([
      ["a", 0.05, 0.4],
      ["b", 9.7, 9.95],
    ]);
    expect(clipFromWordRange(edge, { start: 0, end: 0 }, 10).start).toBe(0);
    expect(clipFromWordRange(edge, { start: 1, end: 1 }, 10).end).toBe(10);
  });

  it("spans several words", () => {
    const r = clipFromWordRange(words, { start: 0, end: 3 }, 10);
    expect(r.start).toBe(0.88);
    expect(r.end).toBe(4.02);
  });

  it("never includes a neighbouring word by midpoint", () => {
    const r = clipFromWordRange(words, { start: 1, end: 2 }, 10);
    expect(wordsInRange(words, r.start, r.end).map((w) => w.text)).toEqual(["b", "c"]);
  });
});

describe("wordsInRange", () => {
  const words = makeWords([
    ["a", 0, 1],
    ["b", 1, 2],
    ["c", 2, 3],
  ]);
  it("takes words whose midpoint is inside the range", () => {
    expect(wordsInRange(words, 0.9, 2.1).map((w) => w.text)).toEqual(["b"]);
    expect(wordsInRange(words, 0.4, 2.6).map((w) => w.text)).toEqual(["a", "b", "c"]);
    expect(wordsInRange(words, 5, 6)).toEqual([]);
  });
});
