/** Undo/redo stacks of entries; the newest entry is last. Never mutated in place. */
export interface History<T> {
  past: readonly T[];
  future: readonly T[];
}

export const DEFAULT_HISTORY_LIMIT = 200;

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/** Records a new entry: clears the redo stack and drops the oldest entries past `limit`. */
export function pushHistory<T>(h: History<T>, entry: T, limit = DEFAULT_HISTORY_LIMIT): History<T> {
  const past = [...h.past, entry];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

/** Pops the newest entry onto the redo stack, or null if there is nothing to undo. */
export function undoHistory<T>(h: History<T>): { history: History<T>; entry: T } | null {
  if (h.past.length === 0) return null;
  const entry = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [...h.future, entry] }, entry };
}

/** Moves the most recently undone entry back onto the undo stack, or null if there is nothing to redo. */
export function redoHistory<T>(h: History<T>): { history: History<T>; entry: T } | null {
  if (h.future.length === 0) return null;
  const entry = h.future[h.future.length - 1];
  return { history: { past: [...h.past, entry], future: h.future.slice(0, -1) }, entry };
}
