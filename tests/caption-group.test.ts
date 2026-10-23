import { describe, expect, it } from "vitest";
import {
  activeWordAt,
  groupCaptionPages,
  lastStartedIndex,
  pageIndexAt,
  type CaptionWord,
} from "@/lib/captions/group";
import { captionPagesFor, captionWordsFor } from "@/lib/captions/words";
import { clipEdl } from "@/lib/clips/range";
import { buildEdl } from "@/lib/edl/edl";
import { makeWords } from "./helpers";

/** Words spoken back to back: `dur` seconds each, `gap` seconds between them. */
const speak = (texts: string[], dur = 0.3, gap = 0.1, from = 0): CaptionWord[] =>
  texts.map((text, i) => ({ id: `w${i}`, text, start: from + i * (dur + gap), end: from + i * (dur + gap) + dur }));

const lineTexts = (page: { lines: CaptionWord[][] }) => page.lines.map((l) => l.map((w) => w.text).join(" "));

describe("groupCaptionPages", () => {
  it("returns nothing for no words", () => {
    expect(groupCaptionPages([])).toEqual([]);
  });

  it("puts a short phrase on one line of one page", () => {
    const pages = groupCaptionPages(speak(["this", "is", "short"]));
    expect(pages).toHaveLength(1);
    expect(lineTexts(pages[0])).toEqual(["this is short"]);
  });

  it("keeps lines to 4 words and pages to 2 lines", () => {
    const words = speak("one two three four five six seven eight nine ten eleven twelve".split(" "));
    const pages = groupCaptionPages(words);
    for (const p of pages) {
      expect(p.lines.length).toBeLessThanOrEqual(2);
      for (const l of p.lines) expect(l.length).toBeLessThanOrEqual(4);
    }
    expect(pages.flatMap((p) => p.words).map((w) => w.text)).toEqual(words.map((w) => w.text));
  });

  it("splits a run evenly so a fifth word does not sit alone", () => {
    const pages = groupCaptionPages(speak(["a", "b", "c", "d", "e"]));
    expect(lineTexts(pages[0])).toEqual(["a b c", "d e"]);
  });

  it("starts a new page at a long pause", () => {
    const words = [...speak(["hello", "there"]), ...speak(["again", "friend"], 0.3, 0.1, 3)];
    const pages = groupCaptionPages(words);
    expect(pages.map((p) => p.words.map((w) => w.text))).toEqual([
      ["hello", "there"],
      ["again", "friend"],
    ]);
  });

  it("starts a new page after the end of a sentence", () => {
    const pages = groupCaptionPages(speak(["Stop.", "Now", "go", "fast!", "Why?", "Because"]));
    expect(pages.map((p) => p.words.map((w) => w.text))).toEqual([["Stop."], ["Now", "go", "fast!"], ["Why?"], ["Because"]]);
  });

  it("does not break on a comma", () => {
    const pages = groupCaptionPages(speak(["well,", "okay", "then"]));
    expect(pages).toHaveLength(1);
  });

  it("breaks lines early on character count, so long words do not overflow", () => {
    const pages = groupCaptionPages(speak(["international", "cooperation", "agreements", "matter"]));
    for (const p of pages) for (const l of p.lines) expect(l.length === 1 || l.map((w) => w.text).join(" ").length <= 22).toBe(true);
    expect(pages.flatMap((p) => p.words)).toHaveLength(4);
  });

  it("gives a very long word its own line without losing or duplicating anything", () => {
    const long = "pneumonoultramicroscopicsilicovolcanoconiosis";
    const words = speak(["a", long, "b", "c"]);
    const pages = groupCaptionPages(words);
    expect(pages.flatMap((p) => p.lines.flat()).map((w) => w.text)).toEqual(["a", long, "b", "c"]);
    expect(pages.every((p) => p.lines.every((l) => l.length > 0))).toBe(true);
    expect(pages.some((p) => p.lines.some((l) => l.length === 1 && l[0].text === long))).toBe(true);
  });

  it("handles fast speech with no pauses: words abut, nothing is dropped", () => {
    const words = speak("we go fast and never stop talking about it at all today ok".split(" "), 0.18, 0);
    const pages = groupCaptionPages(words);
    expect(pages.flatMap((p) => p.words)).toHaveLength(words.length);
    for (let i = 1; i < pages.length; i++) expect(pages[i].start).toBeGreaterThanOrEqual(pages[i - 1].end);
    // continuous speech: each page lasts right up to the next one
    for (let i = 0; i + 1 < pages.length; i++) expect(pages[i].end).toBeCloseTo(pages[i + 1].start, 9);
  });

  it("makes a single-word page", () => {
    const pages = groupCaptionPages(speak(["Wow"]));
    expect(pages).toHaveLength(1);
    expect(pages[0].start).toBe(0);
    expect(pages[0].end).toBeCloseTo(0.3 + 0.35, 9);
  });

  it("holds a page after its last word, but not into the next page", () => {
    const apart = groupCaptionPages([...speak(["a", "b"]), ...speak(["c", "d"], 0.3, 0.1, 2)]);
    expect(apart[0].end).toBeCloseTo(0.7 + 0.35, 9); // 'b' ends at 0.7, then the hold
    // a sentence end splits the pages even without a pause; the first gives way when the next starts
    const close = groupCaptionPages([...speak(["a", "b."]), ...speak(["c", "d"], 0.3, 0.1, 0.9)]);
    expect(close).toHaveLength(2);
    expect(close[0].end).toBe(0.9);
  });

  it("respects custom limits", () => {
    const pages = groupCaptionPages(speak(["a", "b", "c", "d", "e", "f"]), { maxWordsPerLine: 3, maxLines: 1 });
    expect(pages.map((p) => p.words.length)).toEqual([3, 3]);
  });
});

describe("pageIndexAt / activeWordAt", () => {
  const pages = groupCaptionPages([...speak(["a", "b", "c"]), ...speak(["d", "e"], 0.3, 0.1, 3)]);

  it("finds the page on screen and none in a gap", () => {
    expect(pageIndexAt(pages, 0)).toBe(0);
    expect(pageIndexAt(pages, 1.1)).toBe(0); // still held after 'c' ends at 1.1
    expect(pageIndexAt(pages, 2)).toBe(-1);
    expect(pageIndexAt(pages, 3)).toBe(1);
    expect(pageIndexAt(pages, -1)).toBe(-1);
    expect(pageIndexAt(pages, 99)).toBe(-1);
  });

  it("highlights the last word that has started, switching exactly at its start", () => {
    const p = pages[0];
    expect(activeWordAt(p, 0)?.text).toBe("a");
    expect(activeWordAt(p, 0.3999)?.text).toBe("a");
    expect(activeWordAt(p, 0.4)?.text).toBe("b");
    expect(activeWordAt(p, 0.95)?.text).toBe("c");
  });

  it("keeps the word highlighted through the gap before the next one (no flicker)", () => {
    const p = pages[0];
    expect(activeWordAt(p, 0.35)?.text).toBe("a"); // a ended at 0.3
    expect(activeWordAt(p, 1.2)?.text).toBe("c"); // after the last word, while the page is held
  });

  it("is null before the first word", () => {
    expect(activeWordAt(pages[0], -0.1)).toBeNull();
  });

  it("with no pauses, always has an active word and it changes at each boundary", () => {
    const fast = groupCaptionPages(speak(["a", "b", "c", "d"], 0.2, 0));
    const p = fast[0];
    const seen: string[] = [];
    for (let t = 0; t < 0.8; t += 0.05) seen.push(activeWordAt(p, t)!.text);
    expect(seen.every(Boolean)).toBe(true);
    expect([...new Set(seen)]).toEqual(["a", "b", "c", "d"]);
  });

  it("a very long word stays active for its whole duration", () => {
    const p = groupCaptionPages([
      { id: "x", text: "Supercalifragilistic", start: 0, end: 4 },
      { id: "y", text: "next", start: 4.1, end: 4.4 },
    ])[0];
    for (const t of [0, 1, 2.5, 4.05]) expect(activeWordAt(p, t)?.id).toBe("x");
    expect(activeWordAt(p, 4.1)?.id).toBe("y");
  });

  it("lastStartedIndex is a plain binary search", () => {
    const items = [{ start: 0 }, { start: 1 }, { start: 1 }, { start: 2 }];
    expect([-1, 0, 0.5, 1, 1.9, 2, 9].map((t) => lastStartedIndex(items, t))).toEqual([-1, 0, 0, 2, 2, 3, 3]);
    expect(lastStartedIndex([], 1)).toBe(-1);
  });
});

describe("captions across cuts", () => {
  // "so [um] here is [the] point" with pauses of 0.2 s, 12 s source
  const words = makeWords([
    ["so", 1, 1.3],
    ["um", 1.5, 1.8],
    ["here", 2, 2.3],
    ["is", 2.5, 2.8],
    ["the", 3, 3.3],
    ["point", 3.5, 3.9],
  ]);
  const sourceDuration = 12;

  it("leaves out cut words and closes the gap they leave", () => {
    const deleted = new Set(["w1", "w4"]);
    const edl = buildEdl(words, deleted, sourceDuration);
    const clip = clipEdl(edl, 0.88, 4.02);
    const out = captionWordsFor(words, deleted, clip, 0.88, 4.02);
    expect(out.map((w) => w.text)).toEqual(["so", "here", "is", "point"]);
    // 'here' starts right after 'so' ends plus the short joined pause, not 0.7 s later
    expect(out[1].start - out[0].end).toBeLessThanOrEqual(0.5 + 1e-9);
    // monotonic in clip time
    for (let i = 1; i < out.length; i++) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].start);
  });

  it("groups words across a cut into one line", () => {
    const deleted = new Set(["w1"]);
    const edl = buildEdl(words, deleted, sourceDuration);
    const pages = captionPagesFor(words, deleted, clipEdl(edl, 0.88, 4.02), 0.88, 4.02);
    expect(pages).toHaveLength(1);
    expect(pages[0].words.map((w) => w.text)).toEqual(["so", "here", "is", "the", "point"]);
  });

  it("times captions to the clip, starting at 0", () => {
    const edl = buildEdl(words, new Set(), sourceDuration);
    const out = captionWordsFor(words, new Set(), clipEdl(edl, 1.88, 4.02), 1.88, 4.02);
    expect(out[0].text).toBe("here");
    expect(out[0].start).toBeCloseTo(0.12, 6); // 2.0 s in the source, in a clip that starts at 1.88
  });

  it("a clip that starts on a cut word shows nothing for it", () => {
    const deleted = new Set(["w0", "w1"]);
    const edl = buildEdl(words, deleted, sourceDuration);
    const clip = clipEdl(edl, 0.88, 4.02);
    const out = captionWordsFor(words, deleted, clip, 0.88, 4.02);
    expect(out.map((w) => w.text)).toEqual(["here", "is", "the", "point"]);
    expect(out[0].start).toBeLessThan(0.3); // the clip opens on the first kept word, not on the cut
  });

  it("a clip that ends on a cut word shows nothing for it", () => {
    const deleted = new Set(["w4", "w5"]);
    const edl = buildEdl(words, deleted, sourceDuration);
    const clip = clipEdl(edl, 0.88, 4.02);
    const out = captionWordsFor(words, deleted, clip, 0.88, 4.02);
    expect(out.map((w) => w.text)).toEqual(["so", "um", "here", "is"]);
    expect(out.at(-1)!.end).toBeLessThanOrEqual(clip.duration + 1e-9);
  });

  it("a one-word clip captions just that word", () => {
    const edl = buildEdl(words, new Set(), sourceDuration);
    const out = captionWordsFor(words, new Set(), clipEdl(edl, 1.98, 2.32), 1.98, 2.32);
    expect(out.map((w) => w.text)).toEqual(["here"]);
    expect(out[0].start).toBeCloseTo(0.02, 6);
  });

  it("has no captions when every word in the clip is cut", () => {
    const deleted = new Set(words.map((w) => w.id));
    const edl = buildEdl(words, deleted, sourceDuration);
    expect(captionPagesFor(words, deleted, clipEdl(edl, 0.88, 4.02), 0.88, 4.02)).toEqual([]);
  });

  it("ignores words outside the clip and blank words", () => {
    const withBlank = makeWords([
      ["before", 0, 0.3],
      [" ", 1, 1.1],
      ["in", 1.2, 1.5],
      ["after", 5, 5.3],
    ]);
    const edl = buildEdl(withBlank, new Set(), 8);
    expect(captionWordsFor(withBlank, new Set(), clipEdl(edl, 0.9, 2), 0.9, 2).map((w) => w.text)).toEqual(["in"]);
  });

  it("keeps words after a trimmed pause", () => {
    const w = makeWords([
      ["a", 1, 2],
      ["b", 4, 5],
    ]);
    const edl = buildEdl(w, new Set(), 12, { trims: new Map([["w0", 0.4]]) });
    const out = captionWordsFor(w, new Set(), clipEdl(edl, 0.5, 6), 0.5, 6);
    // 'a' ends at 1.5 in clip time; b starts after the 0.4 s that is left of the pause
    expect(out[1].start - out[0].end).toBeCloseTo(0.4, 6);
  });
});
