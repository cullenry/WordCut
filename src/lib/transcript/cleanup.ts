import type { EditOp } from "@/lib/edl/edits";
import type { TrimMap } from "@/lib/edl/trims";
import { findFillers, type FillerMatch } from "./fillers";
import { findSilences, resolveSilenceOptions, type SilenceMatch } from "./silences";
import type { Word } from "./types";

export interface CleanupSettings {
  /** Also suggest "like", "you know", "I mean" and similar. */
  phrases: boolean;
  threshold: number;
  keep: number;
}

export type PlannedFiller = FillerMatch & { included: boolean };
export type PlannedSilence = SilenceMatch & { included: boolean };

export interface CleanupPlan {
  fillers: PlannedFiller[];
  silences: PlannedSilence[];
}

export const defaultCleanupSettings = (): CleanupSettings => ({ phrases: false, ...resolveSilenceOptions() });

/**
 * Everything a cleanup would do, each item ticked unless its key is in `excluded`.
 * Pauses are found as if every filler found were gone, whether ticked or not.
 * A pause beside a filler is shortened by the EDL's pause rule once the filler
 * is cut, so it is never listed, and unticking a filler can't make new items
 * appear or move in the list.
 */
export function planCleanup(
  words: readonly Word[],
  deleted: ReadonlySet<string>,
  trims: TrimMap,
  settings: CleanupSettings,
  excluded: ReadonlySet<string>,
): CleanupPlan {
  const fillers = findFillers(words, deleted, { phrases: settings.phrases }).map((f) => ({
    ...f,
    included: !excluded.has(f.key),
  }));
  const afterFillers = new Set(deleted);
  for (const f of fillers) for (const id of f.ids) afterFillers.add(id);

  const silences = findSilences(words, afterFillers, trims, settings).map((s) => ({
    ...s,
    included: !excluded.has(s.key),
  }));
  return { fillers, silences };
}

export interface CleanupCounts {
  fillers: number;
  /** Words those fillers span (a phrase is several). */
  fillerWords: number;
  silences: number;
}

export function countPlan(plan: CleanupPlan): CleanupCounts {
  const fillers = plan.fillers.filter((f) => f.included);
  return {
    fillers: fillers.length,
    fillerWords: fillers.reduce((n, f) => n + f.ids.length, 0),
    silences: plan.silences.filter((s) => s.included).length,
  };
}

/**
 * The single undoable op for the ticked items, or null if nothing is ticked.
 * Fillers become deleted ids; pauses become trims carrying their previous value.
 */
export function cleanupOp(plan: CleanupPlan): EditOp | null {
  const ids = plan.fillers.filter((f) => f.included).flatMap((f) => f.ids);
  const trims = plan.silences
    .filter((s) => s.included)
    .map((s) => ({ afterId: s.afterId, before: s.previousKeep, after: s.keep }));
  if (ids.length === 0 && trims.length === 0) return null;
  return { kind: "delete", ids, ...(trims.length > 0 && { trims }) };
}
