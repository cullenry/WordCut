import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTIONS, normalizeCaptions, readableOn } from "@/lib/captions/types";
import {
  applyClipOp,
  cleanClipName,
  defaultClipName,
  editOp,
  invertClipOp,
  isClipOp,
  mergeClipEdits,
  nextClipId,
  patchClip,
  sanitizeClips,
  type ClipOp,
} from "@/lib/clips/ops";
import { newClip, type Clip } from "@/lib/clips/types";
import { sayWords } from "./helpers";

const clip = (id: string, start = 0, end = 5): Clip => newClip({ id, name: id, start, end });
const ids = (clips: readonly Clip[]) => clips.map((c) => c.id);

describe("applyClipOp / invertClipOp", () => {
  const base = [clip("clip-1"), clip("clip-2"), clip("clip-3")];

  function roundTrip(op: ClipOp) {
    const after = applyClipOp(base, op);
    expect(applyClipOp(after, invertClipOp(op))).toEqual(base);
    return after;
  }

  it("inserts at an index and undoes", () => {
    const after = roundTrip({ kind: "clip-insert", clip: clip("clip-4"), index: 1 });
    expect(ids(after)).toEqual(["clip-1", "clip-4", "clip-2", "clip-3"]);
  });

  it("removes and undoes back to the same place", () => {
    const after = roundTrip({ kind: "clip-remove", clip: base[1], index: 1 });
    expect(ids(after)).toEqual(["clip-1", "clip-3"]);
  });

  it("renames and undoes", () => {
    const after = roundTrip({ kind: "clip-rename", id: "clip-2", before: "clip-2", after: "Hook" });
    expect(after[1].name).toBe("Hook");
  });

  it("moves and undoes, both directions", () => {
    expect(ids(roundTrip({ kind: "clip-move", id: "clip-1", from: 0, to: 2 }))).toEqual(["clip-2", "clip-3", "clip-1"]);
    expect(ids(roundTrip({ kind: "clip-move", id: "clip-3", from: 2, to: 0 }))).toEqual(["clip-3", "clip-1", "clip-2"]);
  });

  it("edits crop and captions and undoes", () => {
    const op = editOp(base[0], { cropOffset: 0.4, captions: { style: "boxed", size: 1.3 } })!;
    const after = applyClipOp(base, op);
    expect(after[0].cropOffset).toBe(0.4);
    expect(after[0].captions).toMatchObject({ style: "boxed", size: 1.3 });
    expect(applyClipOp(after, invertClipOp(op))).toEqual(base);
  });

  it("never mutates its input", () => {
    const copy = structuredClone(base);
    applyClipOp(base, { kind: "clip-move", id: "clip-1", from: 0, to: 2 });
    applyClipOp(base, { kind: "clip-rename", id: "clip-1", before: "x", after: "y" });
    expect(base).toEqual(copy);
  });

  it("tells clip ops from cut ops", () => {
    expect(isClipOp({ kind: "clip-move" })).toBe(true);
    expect(isClipOp({ kind: "delete" })).toBe(false);
    expect(isClipOp({ kind: "restore" })).toBe(false);
  });
});

describe("editOp / patchClip", () => {
  it("records only what changed, with the old values", () => {
    const op = editOp(clip("a"), { cropOffset: 0, captions: { style: "minimal", position: "bottom" } })!;
    expect(op).toEqual({
      kind: "clip-edit",
      id: "a",
      before: { captions: { style: "bold" } },
      after: { captions: { style: "minimal" } },
    });
  });

  it("is null when nothing changes", () => {
    expect(editOp(clip("a"), { cropOffset: 0 })).toBeNull();
    expect(editOp(clip("a"), { captions: { size: 1 } })).toBeNull();
  });

  it("clamps the crop offset and repairs bad caption values", () => {
    const c = patchClip(clip("a"), { cropOffset: 3, captions: { color: "nope", size: 99 } });
    expect(c.cropOffset).toBe(1);
    expect(c.captions.color).toBe(DEFAULT_CAPTIONS.color);
    expect(c.captions.size).toBe(1.6);
  });

  it("an edit that is clamped back to the old value is not an edit", () => {
    const c = { ...clip("a"), cropOffset: 1 };
    expect(editOp(c, { cropOffset: 5 })).toBeNull();
  });
});

describe("mergeClipEdits", () => {
  const a = clip("a");
  const first = editOp(a, { cropOffset: 0.2 })!;
  const second = editOp({ ...a, cropOffset: 0.2 }, { cropOffset: 0.6 })!;

  it("folds a drag into one step: first before, last after", () => {
    const merged = mergeClipEdits(first, second)!;
    expect(merged).toEqual({ kind: "clip-edit", id: "a", before: { cropOffset: 0 }, after: { cropOffset: 0.6 } });
    const undone = applyClipOp(applyClipOp([a], merged), invertClipOp(merged));
    expect(undone).toEqual([a]);
  });

  it("keeps different fields, or different clips, as separate steps", () => {
    const size = editOp(a, { captions: { size: 1.2 } })!;
    expect(mergeClipEdits(first, size)).toBeNull();
    expect(mergeClipEdits(first, { ...second, id: "b" } as ClipOp)).toBeNull();
    expect(mergeClipEdits({ kind: "clip-move", id: "a", from: 0, to: 1 }, second)).toBeNull();
  });
});

describe("ids and names", () => {
  it("picks the next free id", () => {
    expect(nextClipId([])).toBe("clip-1");
    expect(nextClipId([{ id: "clip-1" }, { id: "clip-7" }, { id: "weird" }])).toBe("clip-8");
  });

  it("names a clip from its opening words", () => {
    expect(defaultClipName(sayWords("So", "here's", "the", "thing", "about", "this"), [])).toBe("So here's the thing about");
    expect(defaultClipName(sayWords("“Well,", "okay,"), [])).toBe("Well, okay");
  });

  it("shortens a long name and falls back to Clip N", () => {
    const long = defaultClipName(sayWords("Internationalization", "considerations", "matter", "quite", "greatly"), []);
    expect(long.length).toBeLessThanOrEqual(36);
    expect(long.endsWith("…")).toBe(true);
    expect(defaultClipName([], [clip("a"), clip("b")])).toBe("Clip 3");
  });

  it("cleans a typed name", () => {
    expect(cleanClipName("  My   clip \n")).toBe("My clip");
    expect(cleanClipName("   ")).toBeNull();
    expect(cleanClipName("x".repeat(200))!.length).toBe(80);
  });
});

describe("sanitizeClips", () => {
  it("keeps good clips and fills missing fields", () => {
    const out = sanitizeClips([{ id: "clip-1", name: "A", start: 1, end: 3 }], 10);
    expect(out).toEqual([{ id: "clip-1", name: "A", start: 1, end: 3, cropOffset: 0, captions: DEFAULT_CAPTIONS }]);
  });

  it("drops clips with nonsense ranges and clamps to the source", () => {
    const out = sanitizeClips(
      [
        { id: "a", name: "ok", start: -5, end: 99 },
        { id: "b", name: "backwards", start: 4, end: 2 },
        { id: "c", name: "nan", start: NaN, end: 2 },
        { id: "d", name: "beyond", start: 20, end: 30 },
        null,
        "junk",
      ],
      10,
    );
    expect(out.map((c) => [c.id, c.start, c.end])).toEqual([["a", 0, 10]]);
  });

  it("makes ids unique and repairs bad settings", () => {
    const out = sanitizeClips(
      [
        { id: "x", name: "one", start: 0, end: 1, cropOffset: 9, captions: { style: "neon", color: "#abc", size: "big" } },
        { id: "x", name: "", start: 1, end: 2 },
      ],
      10,
    );
    expect(new Set(ids(out)).size).toBe(2);
    expect(out[0].cropOffset).toBe(1);
    expect(out[0].captions).toEqual({ ...DEFAULT_CAPTIONS, color: "#ABC" });
    expect(out[1].name).toBe("Clip 2");
  });

  it("returns [] for anything that is not a list", () => {
    expect(sanitizeClips(undefined, 10)).toEqual([]);
    expect(sanitizeClips({}, 10)).toEqual([]);
  });
});

describe("caption settings", () => {
  it("normalizes junk to defaults", () => {
    expect(normalizeCaptions(null)).toEqual(DEFAULT_CAPTIONS);
    expect(normalizeCaptions({ position: "left", enabled: "yes" })).toEqual(DEFAULT_CAPTIONS);
  });

  it("picks readable text for a highlight colour", () => {
    expect(readableOn("#FFD60A")).toBe("#000000");
    expect(readableOn("#1d1d80")).toBe("#ffffff");
    expect(readableOn("garbage")).toBe("#ffffff");
  });
});
