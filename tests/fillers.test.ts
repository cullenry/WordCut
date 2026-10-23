import { describe, expect, it } from "vitest";
import { findFillers, isHesitation, normalizeWord } from "@/lib/transcript/fillers";
import { sayWords } from "./helpers";

const found = (texts: string[], opts?: { phrases?: boolean }, deleted: string[] = []) =>
  findFillers(sayWords(...texts), new Set(deleted), opts).map((f) => f.text);

describe("isHesitation", () => {
  it("matches hesitation sounds with punctuation, case and elongation", () => {
    for (const t of ["um", "Um,", "UH", "uh...", "umm", "ummmm", "uhm", "er", "err", "erm", "ah", "Ahh!", "hmm", "Hm", "hmmm", "mm", "mhm", "(um)", "—um"]) {
      expect(isHesitation(t), t).toBe(true);
    }
  });

  it("does not match real words that contain or resemble a filler", () => {
    for (const t of ["umbrella", "summer", "hummus", "herd", "error", "ahead", "her", "hum", "ham", "mom", "mum", "a", "I", "uhura", "terminal", "ahmed", "", "..."]) {
      expect(isHesitation(t), t).toBe(false);
    }
  });

  it("leaves uh-huh and mm-hmm alone, since they are answers", () => {
    expect(isHesitation("uh-huh")).toBe(false);
    expect(isHesitation("Mm-hmm.")).toBe(false);
  });
});

describe("normalizeWord", () => {
  it("lowercases, trims punctuation and straightens apostrophes", () => {
    expect(normalizeWord("“Don’t,”")).toBe("don't");
    expect(normalizeWord("...")).toBe("");
  });
});

describe("findFillers (hesitations)", () => {
  it("finds them anywhere, including the very first and last word", () => {
    const f = findFillers(sayWords("Um,", "so", "this", "works", "uh"), new Set());
    expect(f.map((m) => [m.text, m.startIndex])).toEqual([["Um,", 0], ["uh", 4]]);
  });

  it("reports consecutive fillers separately", () => {
    expect(found(["so", "um", "uh", "er", "yes"])).toEqual(["um", "uh", "er"]);
  });

  it("returns ids, times and a key from the first word", () => {
    const [f] = findFillers(sayWords("so", "um", "yes"), new Set());
    expect(f).toMatchObject({ key: "f:w1", kind: "hesitation", ids: ["w1"], startIndex: 1, endIndex: 1, start: 0.4, end: 0.7 });
  });

  it("ignores fillers inside longer words and already deleted ones", () => {
    expect(found(["an", "umbrella", "ahead", "of", "the", "herd"])).toEqual([]);
    expect(found(["so", "um", "uh"], undefined, ["w1"])).toEqual(["uh"]);
  });

  it("handles an empty transcript and a transcript that is only fillers", () => {
    expect(found([])).toEqual([]);
    expect(found(["um", "uh"])).toEqual(["um", "uh"]);
  });

  it("does not match phrases unless asked", () => {
    expect(found(["it", "was", "like", "you", "know", "fine"])).toEqual([]);
  });
});

describe("findFillers (phrases)", () => {
  const on = { phrases: true };

  it("matches single and multi-word phrases", () => {
    expect(found(["it", "was", "like", "you", "know", "I", "mean", "fine"], on)).toEqual(["like", "you know", "I mean"]);
  });

  it("is case and punctuation insensitive and keeps the original text", () => {
    expect(found(["Well,", "You", "know,", "okay"], on)).toEqual(["You know,"]);
  });

  it("records every word of a phrase", () => {
    const [f] = findFillers(sayWords("it", "you", "know", "ok"), new Set(), on);
    expect(f).toMatchObject({ kind: "phrase", ids: ["w1", "w2"], startIndex: 1, endIndex: 2, start: 0.4, end: 1.1 });
  });

  it("matches at the start and end of the transcript", () => {
    expect(found(["like", "so", "yes", "I", "mean"], on)).toEqual(["like", "I mean"]);
    expect(found(["you"], on)).toEqual([]);
    expect(found(["so", "I"], on)).toEqual([]);
  });

  it("skips a phrase when any of its words is already deleted", () => {
    expect(found(["a", "you", "know", "b"], on, ["w2"])).toEqual([]);
  });

  it("does not overlap a hesitation with a phrase", () => {
    expect(found(["you", "um", "know", "like", "uh"], on)).toEqual(["um", "like", "uh"]);
  });

  it("does not match half a phrase, so lone 'kind' and 'sort' are kept", () => {
    expect(found(["what", "kind", "of", "person", "a", "sort", "b"], on)).toEqual(["kind of"]);
  });

  it("does not match words that merely contain a phrase word", () => {
    expect(found(["likely", "unlike", "actuality", "basic"], on)).toEqual([]);
  });
});
