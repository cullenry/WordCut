import { describe, expect, it } from "vitest";
import { buildEdl, editedCuts, fromSpans, isIdentity, removedRanges, roundTime, type Edl } from "@/lib/edl/edl";
import type { Word } from "@/lib/transcript/types";

const w = (id: string, start: number, end: number): Word => ({ id, text: id, start, end, confidence: 1 });

// Pauses: a-b 0.1s, b-c 1.0s, c-d none (abutting), d-e 0.2s. Lead-in 1s, tail 1.5s.
const words = [w("a", 1, 1.5), w("b", 1.6, 2), w("c", 3, 3.4), w("d", 3.4, 3.8), w("e", 4, 4.5)];
const DURATION = 6;

const spans = (edl: Edl) => edl.ranges.map((r) => [r.start, r.end]);
const build = (...ids: string[]) => buildEdl(words, new Set(ids), DURATION);

describe("buildEdl", () => {
  it("keeps the whole source when nothing is deleted", () => {
    const edl = build();
    expect(edl.ranges).toEqual([{ start: 0, end: 6, offset: 0 }]);
    expect(edl.duration).toBe(6);
    expect(isIdentity(edl)).toBe(true);
  });

  it("keeps the whole source when there are no words", () => {
    expect(spans(buildEdl([], new Set(), 6))).toEqual([[0, 6]]);
  });

  it("splits the pause next to a deleted word, capping the kept side at the pad", () => {
    // b keeps min(1.0 / 2, 0.25) of its pause; c and d abut, so the cut is at their shared edge.
    const edl = build("c");
    expect(spans(edl)).toEqual([[0, 2.25], [3.4, 6]]);
    expect(edl.duration).toBe(4.85);
    expect(isIdentity(edl)).toBe(false);
  });

  it("keeps half of a short pause next to a deleted word", () => {
    // d-e pause is 0.2s: d keeps 0.1s of it.
    expect(spans(build("e"))).toEqual([[0, 3.9]]);
  });

  it("deleting the first word also trims the lead-in silence", () => {
    // a-b pause 0.1s: b keeps 0.05s before itself.
    expect(spans(build("a"))).toEqual([[1.55, 6]]);
  });

  it("deleting the last word also trims the tail silence", () => {
    const edl = build("e");
    expect(edl.ranges[edl.ranges.length - 1].end).toBe(3.9);
  });

  it("deleting everything leaves an empty EDL", () => {
    const edl = build("a", "b", "c", "d", "e");
    expect(edl.ranges).toEqual([]);
    expect(edl.duration).toBe(0);
    expect(isIdentity(edl)).toBe(false);
  });

  it("deleting adjacent words makes one cut, whatever order they were deleted in", () => {
    expect(spans(build("b", "c"))).toEqual([[0, 1.55], [3.4, 6]]);
    expect(build("c", "b")).toEqual(build("b", "c"));
  });

  it("separate deletions give separate cuts with correct offsets", () => {
    const edl = build("b", "d");
    expect(edl.ranges).toEqual([
      { start: 0, end: 1.55, offset: 0 },
      { start: 2.75, end: 3.4, offset: 1.55 },
      { start: 3.9, end: 6, offset: 2.2 },
    ]);
    expect(edl.duration).toBe(4.3);
  });

  it("restoring a word restores the original EDL", () => {
    const deleted = new Set(["b", "c"]);
    deleted.delete("c");
    expect(buildEdl(words, deleted, DURATION)).toEqual(build("b"));
    deleted.delete("b");
    expect(isIdentity(buildEdl(words, deleted, DURATION))).toBe(true);
  });

  it("never touches a pause between two kept words", () => {
    // b-c pause (2 to 3) is fully kept when only a is deleted.
    const [r] = build("a").ranges;
    expect(r.start).toBeLessThan(2);
    expect(r.end).toBe(6);
  });

  it("respects a custom pad", () => {
    expect(spans(buildEdl(words, new Set(["c"]), DURATION, { padSeconds: 0 }))).toEqual([[0, 2], [3.4, 6]]);
    expect(spans(buildEdl(words, new Set(["c"]), DURATION, { padSeconds: 1 }))).toEqual([[0, 2.5], [3.4, 6]]);
  });

  it("cuts at the midpoint of overlapping words", () => {
    const overlapping = [w("x", 1, 2), w("y", 1.5, 2.5)];
    expect(spans(buildEdl(overlapping, new Set(["y"]), 3))).toEqual([[0, 1.75]]);
  });

  it("produces ordered, non-overlapping ranges from badly timed words", () => {
    const messy = [w("p", 1, 3), w("q", 1.2, 1.4), w("r", 2, 2.5), w("s", 2.4, 9)];
    for (const del of [["q"], ["p", "r"], ["q", "s"], ["r"]]) {
      const edl = buildEdl(messy, new Set(del), 5);
      for (const r of edl.ranges) expect(r.end).toBeGreaterThan(r.start);
      for (let i = 1; i < edl.ranges.length; i++) expect(edl.ranges[i].start).toBeGreaterThan(edl.ranges[i - 1].end);
      expect(edl.ranges.every((r) => r.start >= 0 && r.end <= 5)).toBe(true);
    }
  });

  it("clamps words that run past the source duration", () => {
    expect(spans(buildEdl([w("a", 1, 2), w("b", 5, 7)], new Set(["a"]), 6))).toEqual([[4.75, 6]]);
  });

  it("handles a zero-length source", () => {
    expect(buildEdl(words, new Set(), 0).ranges).toEqual([]);
  });
});

describe("fromSpans", () => {
  it("sorts and merges overlapping and touching spans", () => {
    const edl = fromSpans([{ start: 5, end: 6 }, { start: 0, end: 2 }, { start: 1, end: 3 }, { start: 3, end: 4 }], 10);
    expect(edl.ranges).toEqual([
      { start: 0, end: 4, offset: 0 },
      { start: 5, end: 6, offset: 4 },
    ]);
    expect(edl.duration).toBe(5);
  });

  it("merges a span contained in another", () => {
    expect(spans(fromSpans([{ start: 0, end: 5 }, { start: 1, end: 2 }], 10))).toEqual([[0, 5]]);
  });

  it("clamps to the source and drops empty spans", () => {
    expect(spans(fromSpans([{ start: -1, end: 1 }, { start: 9, end: 12 }, { start: 4, end: 4 }], 10))).toEqual([
      [0, 1],
      [9, 10],
    ]);
  });

  it("drops sub-millisecond slivers and closes sub-millisecond gaps", () => {
    expect(spans(fromSpans([{ start: 1, end: 1.0004 }], 10))).toEqual([]);
    expect(spans(fromSpans([{ start: 0, end: 1 }, { start: 1.0004, end: 2 }], 10))).toEqual([[0, 2]]);
  });

  it("rounds away float noise in boundaries and offsets", () => {
    const edl = fromSpans(
      [
        { start: 0, end: 0.1 },
        { start: 0.2, end: 0.1 + 0.2 },
        { start: 0.7, end: 0.8 },
      ],
      1,
    );
    expect(edl.ranges[1].end).toBe(0.3);
    expect(edl.ranges[2].offset).toBe(0.2);
    expect(edl.duration).toBe(0.3);
  });
});

describe("removedRanges", () => {
  it("is the complement of the kept ranges", () => {
    const edl = fromSpans([{ start: 1, end: 2 }, { start: 3, end: 5 }], 10);
    expect(removedRanges(edl)).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 5, end: 10 },
    ]);
  });

  it("is empty with no cuts and everything when all is cut", () => {
    expect(removedRanges(build())).toEqual([]);
    expect(removedRanges(build("a", "b", "c", "d", "e"))).toEqual([{ start: 0, end: 6 }]);
  });
});

describe("editedCuts", () => {
  it("places each cut at its join on the edited timeline", () => {
    const edl = fromSpans([{ start: 1, end: 2 }, { start: 3, end: 5 }], 10);
    expect(editedCuts(edl)).toEqual([
      { at: 0, removed: 1 },
      { at: 1, removed: 1 },
      { at: 3, removed: 5 },
    ]);
  });

  it("is empty with no cuts, and one cut at 0 when everything is cut", () => {
    expect(editedCuts(build())).toEqual([]);
    expect(editedCuts(build("a", "b", "c", "d", "e"))).toEqual([{ at: 0, removed: 6 }]);
  });

  it("rounds the removed length", () => {
    expect(editedCuts(build("c"))).toEqual([{ at: 2.25, removed: 1.15 }]);
  });
});

describe("roundTime", () => {
  it("rounds to the microsecond", () => {
    expect(roundTime(0.1 + 0.2)).toBe(0.3);
    expect(roundTime(1.0000004)).toBe(1);
    expect(roundTime(1.0000006)).toBe(1.000001);
  });
});
