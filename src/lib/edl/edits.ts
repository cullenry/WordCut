import type { WordRange } from "@/lib/transcript/selection";
import type { Word } from "@/lib/transcript/types";

/**
 * One undoable change to the deleted-word set. `ids` lists only the words whose
 * state actually changed, so applying the inverse restores the exact prior set.
 */
export interface EditOp {
  kind: "delete" | "restore";
  ids: readonly string[];
}

/** The op that deletes every not-yet-deleted word in `ids`, or null if there is none. */
export function deleteOp(deleted: ReadonlySet<string>, ids: readonly string[]): EditOp | null {
  const changed = ids.filter((id) => !deleted.has(id));
  return changed.length ? { kind: "delete", ids: changed } : null;
}

/** The op that restores every deleted word in `ids`, or null if there is none. */
export function restoreOp(deleted: ReadonlySet<string>, ids: readonly string[]): EditOp | null {
  const changed = ids.filter((id) => deleted.has(id));
  return changed.length ? { kind: "restore", ids: changed } : null;
}

/** Returns a new set; the input is never mutated. */
export function applyOp(deleted: ReadonlySet<string>, op: EditOp): ReadonlySet<string> {
  const next = new Set(deleted);
  if (op.kind === "delete") for (const id of op.ids) next.add(id);
  else for (const id of op.ids) next.delete(id);
  return next;
}

export function invertOp(op: EditOp): EditOp {
  return { kind: op.kind === "delete" ? "restore" : "delete", ids: op.ids };
}

/** True when every word in the (non-empty) range is deleted. */
export function allDeleted(words: readonly Word[], deleted: ReadonlySet<string>, range: WordRange | null): boolean {
  if (!range) return false;
  for (let i = range.start; i <= range.end; i++) if (!deleted.has(words[i].id)) return false;
  return true;
}

/** The run of consecutive deleted words around index `i`, or null if word `i` is kept. */
export function deletedRunAt(words: readonly Word[], deleted: ReadonlySet<string>, i: number): WordRange | null {
  if (!words[i] || !deleted.has(words[i].id)) return null;
  let start = i;
  let end = i;
  while (start > 0 && deleted.has(words[start - 1].id)) start--;
  while (end < words.length - 1 && deleted.has(words[end + 1].id)) end++;
  return { start, end };
}

/** Keeps only ids that exist in the transcript, so stale saved edits can't leak in. */
export function sanitizeDeleted(words: readonly Word[], ids: Iterable<string>): ReadonlySet<string> {
  const known = new Set(words.map((w) => w.id));
  const out = new Set<string>();
  for (const id of ids) if (known.has(id)) out.add(id);
  return out;
}
