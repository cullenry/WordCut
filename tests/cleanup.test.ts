import { describe, expect, it } from "vitest";
import { applyOp, applyTrims, invertOp } from "@/lib/edl/edits";
import { buildEdl } from "@/lib/edl/edl";
import { cleanupOp, countPlan, defaultCleanupSettings, planCleanup } from "@/lib/transcript/cleanup";
import { makeWords } from "./helpers";

const none = new Set<string>();
const noTrims = new Map<string, number>();
const settings = defaultCleanupSettings();

// Starts with a filler, then a 2s pause; "uh" "er" back to back; another 2s pause; ends with a filler.
const words = makeWords([
  ["Um,", 0, 0.3],
  ["so", 2.3, 2.6],
  ["uh", 2.7, 2.9],
  ["er", 3, 3.2],
  ["it", 3.3, 3.5],
  ["was", 5.5, 5.8],
  ["like", 5.9, 6.1],
  ["fine", 6.2, 6.6],
  ["um", 6.7, 7],
]);

describe("planCleanup", () => {
  it("finds hesitations, ticked by default", () => {
    const plan = planCleanup(words, none, noTrims, settings, new Set());
    expect(plan.fillers.map((f) => [f.text, f.included])).toEqual([
      ["Um,", true],
      ["uh", true],
      ["er", true],
      ["um", true],
    ]);
  });

  it("leaves phrases off unless the setting is on", () => {
    expect(planCleanup(words, none, noTrims, settings, new Set()).fillers.some((f) => f.text === "like")).toBe(false);
    const plan = planCleanup(words, none, noTrims, { ...settings, phrases: true }, new Set());
    expect(plan.fillers.some((f) => f.text === "like" && f.kind === "phrase")).toBe(true);
  });

  it("finds pauses between kept words only", () => {
    const plan = planCleanup(words, none, noTrims, settings, new Set());
    // 0.3 -> 2.3 sits next to the filler "Um," so it is skipped; 3.5 -> 5.5 is 2s.
    expect(plan.silences.map((s) => [s.afterId, s.pause])).toEqual([["w4", 2]]);
  });

  it("never lists a pause beside a filler, ticked or not, so unticking can't change the list", () => {
    const ticked = planCleanup(words, none, noTrims, settings, new Set());
    const unticked = planCleanup(words, none, noTrims, settings, new Set(["f:w0", "f:w8"]));
    expect(unticked.silences.map((s) => s.key)).toEqual(ticked.silences.map((s) => s.key));
    expect(unticked.fillers.map((f) => f.included)).toEqual([false, true, true, false]);
  });

  it("keeps unticked items out of the counts and the op", () => {
    const plan = planCleanup(words, none, noTrims, settings, new Set(["f:w2", "s:w4"]));
    expect(countPlan(plan)).toEqual({ fillers: 3, fillerWords: 3, silences: 0 });
    expect(cleanupOp(plan)).toEqual({ kind: "delete", ids: ["w0", "w3", "w8"] });
  });

  it("is empty for a transcript with nothing to clean, and the op is null", () => {
    const clean = makeWords([["hello", 0, 1], ["world", 1.2, 2]]);
    const plan = planCleanup(clean, none, noTrims, settings, new Set());
    expect(plan).toEqual({ fillers: [], silences: [] });
    expect(cleanupOp(plan)).toBeNull();
    expect(cleanupOp(planCleanup([], none, noTrims, settings, new Set()))).toBeNull();
  });

  it("has a null op when everything is unticked", () => {
    const all = planCleanup(words, none, noTrims, settings, new Set());
    const keys = new Set([...all.fillers, ...all.silences].map((i) => i.key));
    const plan = planCleanup(words, none, noTrims, settings, keys);
    expect(countPlan(plan)).toEqual({ fillers: 0, fillerWords: 0, silences: 0 });
    expect(cleanupOp(plan)).toBeNull();
  });

  it("does not re-suggest what is already deleted or trimmed", () => {
    const plan = planCleanup(words, new Set(["w0", "w2", "w3", "w8"]), new Map([["w4", 0.3]]), settings, new Set());
    expect(plan).toEqual({ fillers: [], silences: [] });
  });

  it("counts the words in a phrase", () => {
    const w = makeWords([["so", 0, 0.3], ["you", 0.4, 0.6], ["know", 0.7, 0.9], ["um", 1, 1.2]]);
    const plan = planCleanup(w, none, noTrims, { ...settings, phrases: true }, new Set());
    expect(countPlan(plan)).toEqual({ fillers: 2, fillerWords: 3, silences: 0 });
  });
});

describe("cleanupOp", () => {
  it("is one op covering fillers and pauses, undone by its inverse", () => {
    const plan = planCleanup(words, none, noTrims, settings, new Set());
    const op = cleanupOp(plan)!;
    expect(op.ids).toEqual(["w0", "w2", "w3", "w8"]);
    expect(op.trims).toEqual([{ afterId: "w4", before: null, after: 0.3 }]);

    const deleted = applyOp(none, op);
    const trims = applyTrims(noTrims, op);
    expect([...deleted]).toEqual(["w0", "w2", "w3", "w8"]);
    expect([...trims]).toEqual([["w4", 0.3]]);

    const inv = invertOp(op);
    expect([...applyOp(deleted, inv)]).toEqual([]);
    expect([...applyTrims(trims, inv)]).toEqual([]);
  });

  it("builds an EDL without the fillers or the long pause, and with every other word intact", () => {
    const op = cleanupOp(planCleanup(words, none, noTrims, settings, new Set()))!;
    const before = buildEdl(words, none, 8);
    const after = buildEdl(words, applyOp(none, op), 8, { trims: applyTrims(noTrims, op) });
    expect(after.duration).toBeLessThan(before.duration - 3);
    for (const id of ["w1", "w4", "w5", "w6", "w7"]) {
      const w = words.find((x) => x.id === id)!;
      expect(after.ranges.some((r) => r.start <= w.start && r.end >= w.end), id).toBe(true);
    }
  });

  it("works when the only fillers are the first and the last word", () => {
    const edge = makeWords([["uh", 0, 0.3], ["hello", 0.4, 1], ["um", 1.1, 1.4]]);
    const op = cleanupOp(planCleanup(edge, none, noTrims, settings, new Set()))!;
    expect(op.ids).toEqual(["w0", "w2"]);
    const edl = buildEdl(edge, applyOp(none, op), 2, { trims: applyTrims(noTrims, op) });
    expect(edl.ranges).toHaveLength(1);
    expect(edl.ranges[0].start).toBeLessThanOrEqual(0.4);
    expect(edl.ranges[0].end).toBeGreaterThanOrEqual(1);
    expect(edl.ranges[0].start).toBeGreaterThan(0.3);
  });

  it("works when every word is a filler", () => {
    const all = makeWords([["um", 0, 0.3], ["uh", 0.4, 0.7]]);
    const op = cleanupOp(planCleanup(all, none, noTrims, settings, new Set()))!;
    expect(buildEdl(all, applyOp(none, op), 1).ranges).toEqual([]);
  });

  it("a second cleanup at a shorter keep replaces the trim and still undoes cleanly", () => {
    const w = makeWords([["a", 0, 1], ["b", 4, 5]]);
    const first = cleanupOp(planCleanup(w, none, noTrims, { ...settings, keep: 0.8 }, new Set()))!;
    const trims1 = applyTrims(noTrims, first);
    const second = cleanupOp(planCleanup(w, none, trims1, { ...settings, threshold: 0.5, keep: 0.2 }, new Set()))!;
    expect(second.trims).toEqual([{ afterId: "w0", before: 0.8, after: 0.2 }]);
    const trims2 = applyTrims(trims1, second);
    expect([...trims2]).toEqual([["w0", 0.2]]);
    expect([...applyTrims(trims2, invertOp(second))]).toEqual([["w0", 0.8]]);
  });
});
