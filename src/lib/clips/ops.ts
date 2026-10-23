import { normalizeCaptions } from "@/lib/captions/types";
import { clampOffset } from "./crop";
import type { Word } from "@/lib/transcript/types";
import { MAX_CLIP_NAME, newClip, type Clip, type ClipPatch } from "./types";

/**
 * One undoable change to the clip list. Each op carries what its inverse needs,
 * so undo never reads the current state (the same idea as EditOp for cuts).
 */
export type ClipOp =
  | { kind: "clip-insert"; clip: Clip; index: number }
  | { kind: "clip-remove"; clip: Clip; index: number }
  | { kind: "clip-rename"; id: string; before: string; after: string }
  | { kind: "clip-move"; id: string; from: number; to: number }
  | { kind: "clip-edit"; id: string; before: ClipPatch; after: ClipPatch };

const CLIP_KINDS: ReadonlySet<string> = new Set(["clip-insert", "clip-remove", "clip-rename", "clip-move", "clip-edit"]);

/** True for entries of the shared undo history that belong to clips rather than cuts. */
export const isClipOp = (entry: { kind: string }): entry is ClipOp => CLIP_KINDS.has(entry.kind);

/** Returns a new array; the input is never mutated. */
export function applyClipOp(clips: readonly Clip[], op: ClipOp): Clip[] {
  switch (op.kind) {
    case "clip-insert": {
      const next = clips.filter((c) => c.id !== op.clip.id);
      next.splice(Math.min(Math.max(op.index, 0), next.length), 0, op.clip);
      return next;
    }
    case "clip-remove":
      return clips.filter((c) => c.id !== op.clip.id);
    case "clip-rename":
      return clips.map((c) => (c.id === op.id ? { ...c, name: op.after } : c));
    case "clip-move": {
      const from = clips.findIndex((c) => c.id === op.id);
      if (from < 0) return [...clips];
      const next = [...clips];
      const [moved] = next.splice(from, 1);
      next.splice(Math.min(Math.max(op.to, 0), next.length), 0, moved);
      return next;
    }
    case "clip-edit":
      return clips.map((c) => (c.id === op.id ? patchClip(c, op.after) : c));
  }
}

export function invertClipOp(op: ClipOp): ClipOp {
  switch (op.kind) {
    case "clip-insert":
      return { ...op, kind: "clip-remove" };
    case "clip-remove":
      return { ...op, kind: "clip-insert" };
    case "clip-rename":
      return { ...op, before: op.after, after: op.before };
    case "clip-move":
      return { ...op, from: op.to, to: op.from };
    case "clip-edit":
      return { ...op, before: op.after, after: op.before };
  }
}

export function patchClip(clip: Clip, patch: ClipPatch): Clip {
  return {
    ...clip,
    cropOffset: patch.cropOffset === undefined ? clip.cropOffset : clampOffset(patch.cropOffset),
    captions: patch.captions ? normalizeCaptions({ ...clip.captions, ...patch.captions }) : clip.captions,
  };
}

/** The undoable edit that turns `clip` into `clip + patch`, or null if nothing would change. */
export function editOp(clip: Clip, patch: ClipPatch): ClipOp | null {
  const next = patchClip(clip, patch);
  const before: ClipPatch = {};
  const after: ClipPatch = {};
  if (next.cropOffset !== clip.cropOffset) {
    before.cropOffset = clip.cropOffset;
    after.cropOffset = next.cropOffset;
  }
  for (const key of Object.keys(clip.captions) as (keyof Clip["captions"])[]) {
    if (next.captions[key] === clip.captions[key]) continue;
    (before.captions ??= {})[key] = clip.captions[key] as never;
    (after.captions ??= {})[key] = next.captions[key] as never;
  }
  return before.cropOffset === undefined && !before.captions ? null : { kind: "clip-edit", id: clip.id, before, after };
}

const keysOf = (p: ClipPatch): string =>
  [...(p.cropOffset === undefined ? [] : ["cropOffset"]), ...Object.keys(p.captions ?? {}).map((k) => `captions.${k}`)]
    .sort()
    .join(",");

/**
 * Folds two consecutive edits of the same fields on the same clip into one, keeping
 * the first `before` and the last `after`. A slider drag then undoes in one step.
 * Null when they should stay separate.
 */
export function mergeClipEdits(prev: ClipOp, next: ClipOp): ClipOp | null {
  if (prev.kind !== "clip-edit" || next.kind !== "clip-edit" || prev.id !== next.id) return null;
  if (keysOf(prev.before) !== keysOf(next.after)) return null;
  return { kind: "clip-edit", id: prev.id, before: prev.before, after: next.after };
}

/** The next free id: one more than the highest `clip-N` in use. */
export function nextClipId(clips: readonly Pick<Clip, "id">[]): string {
  let max = 0;
  for (const c of clips) {
    const n = /^clip-(\d+)$/.exec(c.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `clip-${max + 1}`;
}

const NAME_WORDS = 5;
const NAME_CHARS = 36;

/** A first name for a clip: its opening words, or "Clip N" if it has none. */
export function defaultClipName(words: readonly Word[], clips: readonly Clip[]): string {
  const text = words
    .slice(0, NAME_WORDS)
    .map((w) => w.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[\s,;:—-]+$/u, "");
  if (!text) return `Clip ${clips.length + 1}`;
  return text.length > NAME_CHARS ? `${text.slice(0, NAME_CHARS - 1).trimEnd()}…` : text;
}

/** Trims a typed name; null if it is empty (the rename is then ignored). */
export function cleanClipName(name: string): string | null {
  const t = name.replace(/\s+/g, " ").trim().slice(0, MAX_CLIP_NAME);
  return t || null;
}

/**
 * Turns saved clips back into valid ones: bad fields are repaired or dropped,
 * ranges are clamped to the source, and ids are made unique.
 */
export function sanitizeClips(saved: unknown, sourceDuration: number): Clip[] {
  if (!Array.isArray(saved)) return [];
  const out: Clip[] = [];
  const seen = new Set<string>();
  for (const raw of saved) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.start !== "number" || typeof r.end !== "number") continue;
    const start = Math.max(0, r.start);
    const end = Math.min(sourceDuration, r.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    let id = typeof r.id === "string" && r.id ? r.id : "";
    if (!id || seen.has(id)) id = nextClipId([...seen].map((s) => ({ id: s })));
    seen.add(id);
    const name = typeof r.name === "string" ? cleanClipName(r.name) : null;
    out.push({
      ...newClip({ id, name: name ?? `Clip ${out.length + 1}`, start, end }),
      cropOffset: typeof r.cropOffset === "number" ? clampOffset(r.cropOffset) : 0,
      captions: normalizeCaptions(r.captions),
    });
  }
  return out;
}
