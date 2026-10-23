import { describe, expect, it } from "vitest";
import {
  allDeleted,
  applyOp,
  deleteOp,
  deletedRunAt,
  invertOp,
  restoreOp,
  sanitizeDeleted,
} from "@/lib/edl/edits";
import { emptyHistory, pushHistory, redoHistory, undoHistory } from "@/lib/edl/history";
import type { Word } from "@/lib/transcript/types";

const words: Word[] = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, text: id, start: i, end: i + 0.5, confidence: 1 }));

describe("edit ops", () => {
  it("delete lists only words not already deleted", () => {
    expect(deleteOp(new Set(["b"]), ["a", "b", "c"])).toEqual({ kind: "delete", ids: ["a", "c"] });
    expect(deleteOp(new Set(["a"]), ["a"])).toBeNull();
    expect(deleteOp(new Set(), [])).toBeNull();
  });

  it("restore lists only words that are deleted", () => {
    expect(restoreOp(new Set(["b", "d"]), ["a", "b", "c", "d"])).toEqual({ kind: "restore", ids: ["b", "d"] });
    expect(restoreOp(new Set(), ["a"])).toBeNull();
  });

  it("applies without mutating the input set", () => {
    const before = new Set(["a"]);
    const after = applyOp(before, { kind: "delete", ids: ["b"] });
    expect([...after].sort()).toEqual(["a", "b"]);
    expect([...before]).toEqual(["a"]);
    expect([...applyOp(after, { kind: "restore", ids: ["a"] })]).toEqual(["b"]);
  });

  it("the inverse undoes exactly the change", () => {
    const start = new Set(["b"]);
    const op = deleteOp(start, ["a", "b", "c"])!;
    const undone = applyOp(applyOp(start, op), invertOp(op));
    expect([...undone]).toEqual(["b"]);
    expect(invertOp(invertOp(op))).toEqual(op);
  });
});

describe("allDeleted", () => {
  it("is true only when every word in the range is deleted", () => {
    const deleted = new Set(["b", "c"]);
    expect(allDeleted(words, deleted, { start: 1, end: 2 })).toBe(true);
    expect(allDeleted(words, deleted, { start: 1, end: 3 })).toBe(false);
    expect(allDeleted(words, deleted, null)).toBe(false);
  });
});

describe("deletedRunAt", () => {
  const deleted = new Set(["a", "b", "d"]);

  it("finds the consecutive deleted run, including at the transcript edges", () => {
    expect(deletedRunAt(words, deleted, 1)).toEqual({ start: 0, end: 1 });
    expect(deletedRunAt(words, deleted, 0)).toEqual({ start: 0, end: 1 });
    expect(deletedRunAt(words, deleted, 3)).toEqual({ start: 3, end: 3 });
    expect(deletedRunAt(words, new Set(["d", "e"]), 4)).toEqual({ start: 3, end: 4 });
  });

  it("is null for a kept or unknown word", () => {
    expect(deletedRunAt(words, deleted, 2)).toBeNull();
    expect(deletedRunAt(words, deleted, 9)).toBeNull();
  });
});

describe("sanitizeDeleted", () => {
  it("drops ids that are not in the transcript", () => {
    expect([...sanitizeDeleted(words, ["a", "zz", "c"])]).toEqual(["a", "c"]);
  });
});

describe("history", () => {
  it("undoes and redoes in order", () => {
    let h = pushHistory(pushHistory(emptyHistory<number>(), 1), 2);
    const u1 = undoHistory(h)!;
    expect(u1.entry).toBe(2);
    const u2 = undoHistory(u1.history)!;
    expect(u2.entry).toBe(1);
    expect(undoHistory(u2.history)).toBeNull();
    const r1 = redoHistory(u2.history)!;
    expect(r1.entry).toBe(1);
    h = r1.history;
    expect(h).toEqual({ past: [1], future: [2] });
  });

  it("a new entry clears the redo stack", () => {
    const undone = undoHistory(pushHistory(emptyHistory<number>(), 1))!.history;
    const h = pushHistory(undone, 5);
    expect(h).toEqual({ past: [5], future: [] });
    expect(redoHistory(h)).toBeNull();
  });

  it("drops the oldest entries past the limit", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 5; i++) h = pushHistory(h, i, 3);
    expect(h.past).toEqual([2, 3, 4]);
  });

  it("never mutates the previous history", () => {
    const h = pushHistory(emptyHistory<number>(), 1);
    pushHistory(h, 2);
    undoHistory(h);
    expect(h).toEqual({ past: [1], future: [] });
  });
});
