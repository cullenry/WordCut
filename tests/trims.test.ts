import { describe, expect, it } from "vitest";
import { applyTrims, invertOp, type EditOp } from "@/lib/edl/edits";
import { buildEdl } from "@/lib/edl/edl";
import { editedToSource, sourceToEdited } from "@/lib/edl/time";
import { sanitizeTrims, subtractSpans, trimSpans } from "@/lib/edl/trims";
import { makeWords } from "./helpers";

const words = makeWords([
  ["a", 1, 2],
  ["b", 4, 5], // pause 2 after a
  ["c", 5.1, 6],
  ["d", 9, 10], // pause 3 after c
]);

describe("trimSpans", () => {
  it("removes the middle of the pause, leaving `keep` split evenly", () => {
    expect(trimSpans(words, new Map([["w0", 0.4]]))).toEqual([{ start: 2.2, end: 3.8 }]);
  });

  it("returns spans in word order", () => {
    expect(trimSpans(words, new Map([["w2", 0.2], ["w0", 0.2]]))).toEqual([
      { start: 2.1, end: 3.9 },
      { start: 6.1, end: 8.9 },
    ]);
  });

  it("removes nothing when the pause is not longer than keep, for the last word, or with no trims", () => {
    expect(trimSpans(words, new Map([["w1", 0.3]]))).toEqual([]); // 0.1 pause
    expect(trimSpans(words, new Map([["w0", 2]]))).toEqual([]);
    expect(trimSpans(words, new Map([["w3", 0.3]]))).toEqual([]);
    expect(trimSpans(words, new Map())).toEqual([]);
  });

  it("keep 0 removes the whole pause", () => {
    expect(trimSpans(words, new Map([["w0", 0]]))).toEqual([{ start: 2, end: 4 }]);
  });
});

describe("subtractSpans", () => {
  const sub = (k: [number, number][], r: [number, number][]) =>
    subtractSpans(
      k.map(([start, end]) => ({ start, end })),
      r.map(([start, end]) => ({ start, end })),
    ).map((s) => [s.start, s.end]);

  it("splits, trims and drops", () => {
    expect(sub([[0, 10]], [[2, 3], [5, 6]])).toEqual([[0, 2], [3, 5], [6, 10]]);
    expect(sub([[0, 4], [6, 10]], [[3, 7]])).toEqual([[0, 3], [7, 10]]);
    expect(sub([[0, 4]], [[0, 4]])).toEqual([]);
    expect(sub([[0, 4]], [[5, 6]])).toEqual([[0, 4]]);
    expect(sub([[0, 4]], [])).toEqual([[0, 4]]);
  });

  it("handles a removed span that covers several kept spans", () => {
    expect(sub([[0, 1], [2, 3], [4, 5]], [[0.5, 4.5]])).toEqual([[0, 0.5], [4.5, 5]]);
  });
});

describe("buildEdl with trims", () => {
  it("shortens a pause between kept words and shifts everything after it", () => {
    const edl = buildEdl(words, new Set(), 12, { trims: new Map([["w0", 0.4]]) });
    expect(edl.ranges).toEqual([
      { start: 0, end: 2.2, offset: 0 },
      { start: 3.8, end: 12, offset: 2.2 },
    ]);
    expect(edl.duration).toBe(10.4);
  });

  it("is unchanged without trims", () => {
    expect(buildEdl(words, new Set(), 12, { trims: new Map() })).toEqual(buildEdl(words, new Set(), 12));
  });

  it("never clips a word, whatever the keep", () => {
    for (const keep of [0, 0.1, 0.5, 1.9]) {
      const edl = buildEdl(words, new Set(), 12, { trims: new Map([["w0", keep], ["w2", keep]]) });
      for (const w of words) {
        expect(edl.ranges.some((r) => r.start <= w.start && r.end >= w.end), `${w.id} keep ${keep}`).toBe(true);
      }
    }
  });

  it("composes with deletions: only the part the words keep is trimmed further", () => {
    // Deleting b: a is kept, so it keeps 0.25 after it (to 2.25) and b takes the rest.
    const cutOnly = buildEdl(words, new Set(["w1"]), 12);
    const both = buildEdl(words, new Set(["w1"]), 12, { trims: new Map([["w0", 0.1]]) });
    expect(cutOnly.ranges[0].end).toBe(2.25);
    expect(both.ranges[0].end).toBe(2.05);
    expect(both.duration).toBeLessThan(cutOnly.duration);
  });

  it("ignores a trim on a pause that sits entirely inside a deleted run", () => {
    const deleted = new Set(["w0", "w1"]);
    const edl = buildEdl(words, deleted, 12, { trims: new Map([["w0", 0.4]]) });
    expect(edl).toEqual(buildEdl(words, deleted, 12));
  });

  it("maps times across the trim in both directions", () => {
    const edl = buildEdl(words, new Set(), 12, { trims: new Map([["w0", 0.4]]) });
    expect(sourceToEdited(edl, 5)).toBeCloseTo(3.4); // end of b: 5 - 1.6
    expect(sourceToEdited(edl, 3)).toBeCloseTo(2.2); // inside the removed span: the resume point
    expect(editedToSource(edl, 3.4)).toBeCloseTo(5);
    expect(editedToSource(edl, 2.2)).toBeCloseTo(3.8);
  });

  it("does not mutate the trims or the words", () => {
    const trims = new Map([["w0", 0.4]]);
    const copy = structuredClone(words);
    buildEdl(words, new Set(), 12, { trims });
    expect([...trims]).toEqual([["w0", 0.4]]);
    expect(words).toEqual(copy);
  });
});

describe("trim ops", () => {
  const op: EditOp = {
    kind: "delete",
    ids: ["w1"],
    trims: [
      { afterId: "w0", before: null, after: 0.3 },
      { afterId: "w2", before: 0.8, after: 0.3 },
    ],
  };

  it("applies without mutating, and inverts back to the previous map exactly", () => {
    const before: ReadonlyMap<string, number> = new Map([["w2", 0.8], ["w9", 0.5]]);
    const after = applyTrims(before, op);
    expect([...after]).toEqual([["w2", 0.3], ["w9", 0.5], ["w0", 0.3]]);
    expect([...before]).toEqual([["w2", 0.8], ["w9", 0.5]]);
    expect(new Map(applyTrims(after, invertOp(op)))).toEqual(new Map(before));
  });

  it("an op without trims returns the same map", () => {
    const m = new Map([["w0", 0.3]]);
    expect(applyTrims(m, { kind: "delete", ids: ["w1"] })).toBe(m);
  });
});

describe("sanitizeTrims", () => {
  it("drops unknown ids, the last word, and bad values", () => {
    const m = sanitizeTrims(words, [
      { afterId: "w0", keep: 0.3 },
      { afterId: "nope", keep: 0.3 },
      { afterId: "w3", keep: 0.3 },
      { afterId: "w1", keep: NaN },
      { afterId: "w2", keep: -1 },
    ]);
    expect([...m]).toEqual([["w0", 0.3]]);
  });
});
