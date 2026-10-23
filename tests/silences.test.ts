import { describe, expect, it } from "vitest";
import { findSilences, MIN_THRESHOLD, resolveSilenceOptions } from "@/lib/transcript/silences";
import { makeWords } from "./helpers";

const none = new Set<string>();
const noTrims = new Map<string, number>();

// pauses: a-b 0.1, b-c 1.5, c-d 0.5, d-e 3.0
const words = makeWords([
  ["a", 0, 1],
  ["b", 1.1, 2],
  ["c", 3.5, 4],
  ["d", 4.5, 5],
  ["e", 8, 9],
]);

describe("findSilences", () => {
  it("finds pauses at least as long as the threshold (default 1s)", () => {
    const found = findSilences(words, none, noTrims);
    expect(found.map((s) => [s.afterId, s.pause])).toEqual([["w1", 1.5], ["w3", 3]]);
  });

  it("shortens a pause to `keep`, cutting the middle so neither word is touched", () => {
    const [s] = findSilences(words, none, noTrims, { keep: 0.3 });
    expect(s).toMatchObject({ key: "s:w1", start: 2, end: 3.5, keep: 0.3, previousKeep: null });
    expect(s.removed).toBeCloseTo(1.2);
    expect(s.cutStart).toBeCloseTo(2.15);
    expect(s.cutEnd).toBeCloseTo(3.35);
  });

  it("includes a pause exactly equal to the threshold", () => {
    const w = makeWords([["a", 0, 1], ["b", 2, 3]]);
    expect(findSilences(w, none, noTrims, { threshold: 1 })).toHaveLength(1);
  });

  it("a lower threshold finds more, a higher one fewer", () => {
    expect(findSilences(words, none, noTrims, { threshold: 0.5 }).map((s) => s.afterId)).toEqual(["w1", "w2", "w3"]);
    expect(findSilences(words, none, noTrims, { threshold: 2 }).map((s) => s.afterId)).toEqual(["w3"]);
  });

  it("finds nothing when the threshold is higher than every pause", () => {
    expect(findSilences(words, none, noTrims, { threshold: 3.01 })).toEqual([]);
    expect(findSilences(words, none, noTrims, { threshold: 1e9 })).toEqual([]);
  });

  it("floors a very low, zero, negative or NaN threshold so ordinary gaps are never trimmed", () => {
    const tight = makeWords([["a", 0, 1], ["b", 1.1, 2], ["c", 2.2, 3]]);
    for (const threshold of [0.01, 0, -5]) expect(findSilences(tight, none, noTrims, { threshold })).toEqual([]);
    expect(resolveSilenceOptions({ threshold: 0 }).threshold).toBe(MIN_THRESHOLD);
    expect(resolveSilenceOptions({ threshold: NaN })).toEqual({ threshold: 1, keep: 0.3 });
  });

  it("at the lowest threshold finds a 0.5s pause but not a 0.3s one", () => {
    const w = makeWords([["a", 0, 1], ["b", 1.5, 2], ["c", 2.3, 3]]);
    expect(findSilences(w, none, noTrims, { threshold: 0.3 }).map((s) => s.afterId)).toEqual(["w0"]);
  });

  it("keeps at most the threshold and never a negative amount", () => {
    expect(resolveSilenceOptions({ threshold: 0.3, keep: 2 }).keep).toBe(0.3);
    expect(resolveSilenceOptions({ keep: -1 }).keep).toBe(0);
    const [s] = findSilences(words, none, noTrims, { keep: 0 });
    expect(s.removed).toBe(1.5);
    expect([s.cutStart, s.cutEnd]).toEqual([2, 3.5]);
  });

  it("finds nothing for no words, one word, or touching/overlapping words", () => {
    expect(findSilences([], none, noTrims)).toEqual([]);
    expect(findSilences(makeWords([["a", 0, 1]]), none, noTrims)).toEqual([]);
    expect(findSilences(makeWords([["a", 0, 1], ["b", 0.9, 2]]), none, noTrims)).toEqual([]);
  });

  it("ignores the lead-in before the first word and the tail after the last", () => {
    expect(findSilences(makeWords([["a", 10, 11], ["b", 11.1, 12]]), none, noTrims)).toEqual([]);
  });

  it("skips a pause next to a deleted word, which the pad rule already shortens", () => {
    expect(findSilences(words, new Set(["w2"]), noTrims).map((s) => s.afterId)).toEqual(["w3"]);
    expect(findSilences(words, new Set(["w1"]), noTrims).map((s) => s.afterId)).toEqual(["w3"]);
  });

  it("measures an existing trim at its shortened length", () => {
    expect(findSilences(words, none, new Map([["w1", 0.3]])).map((s) => s.afterId)).toEqual(["w3"]);
    const [s] = findSilences(words, none, new Map([["w1", 0.8]]), { threshold: 0.5, keep: 0.2 });
    expect(s).toMatchObject({ afterId: "w1", pause: 0.8, previousKeep: 0.8, keep: 0.2 });
  });
});
