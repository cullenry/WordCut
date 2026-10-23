import { roundTime, type Edl } from "./edl";

/**
 * Index of the kept range containing source time `t` (ranges are half-open),
 * or -1 if `t` falls in a cut or outside the source.
 */
export function rangeIndexAt(edl: Edl, t: number): number {
  const i = lastStartingAtOrBefore(edl, t);
  return i >= 0 && t < edl.ranges[i].end ? i : -1;
}

export function isKept(edl: Edl, t: number): boolean {
  return rangeIndexAt(edl, t) >= 0;
}

/**
 * Maps a source time onto the edited timeline. A time inside a cut maps to the
 * point where playback resumes after it (the next kept range's offset); a time
 * after the last kept range maps to the edited duration.
 */
export function sourceToEdited(edl: Edl, t: number): number {
  const i = lastStartingAtOrBefore(edl, t);
  if (i < 0) return 0;
  const r = edl.ranges[i];
  if (t < r.end) return roundTime(r.offset + (t - r.start));
  const next = edl.ranges[i + 1];
  return next ? next.offset : edl.duration;
}

/**
 * Maps an edited time back to source time; clamps to [0, duration]. A time on
 * a join belongs to the range that starts there; the edited end maps to the end
 * of the last kept range. An empty EDL maps everything to 0.
 */
export function editedToSource(edl: Edl, e: number): number {
  const { ranges } = edl;
  if (ranges.length === 0) return 0;
  const target = Math.min(Math.max(e, 0), edl.duration);
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid].offset <= target) lo = mid + 1;
    else hi = mid;
  }
  const r = ranges[Math.max(0, lo - 1)];
  return roundTime(Math.min(r.start + (target - r.offset), r.end));
}

/**
 * The nearest source time at or after `t` that will actually play: `t` itself
 * if kept, else the start of the next kept range, or null if nothing follows.
 */
export function snapToKept(edl: Edl, t: number): number | null {
  if (isKept(edl, t)) return t;
  const next = edl.ranges[lastStartingAtOrBefore(edl, t) + 1];
  return next ? next.start : null;
}

/**
 * What playback should do at source time `t`: keep going (null), jump to a
 * source time, or stop ("end"). The jump fires `lookahead` seconds before a cut,
 * because the playhead is only polled once a frame and a seek takes a moment;
 * the lookahead is capped at half the range so a short kept word still plays.
 */
export function playbackJump(edl: Edl, t: number, lookahead: number): number | "end" | null {
  const { ranges } = edl;
  const i = lastStartingAtOrBefore(edl, t);
  if (i >= 0 && t < ranges[i].end) {
    const r = ranges[i];
    const early = Math.min(Math.max(lookahead, 0), (r.end - r.start) / 2);
    if (t < r.end - early) return null;
    if (i + 1 < ranges.length) return ranges[i + 1].start;
    // Let the last range run into the natural end of the video if nothing is cut there.
    return r.end >= edl.sourceDuration ? null : "end";
  }
  const next = ranges[i + 1];
  return next ? next.start : "end";
}

/**
 * Source seconds of playback from `t` until playbackJump would fire: 0 if it
 * fires now, null if playback can run to the end of the video undisturbed.
 */
export function secondsUntilJump(edl: Edl, t: number, lookahead: number): number | null {
  if (playbackJump(edl, t, lookahead) !== null) return 0;
  const { ranges } = edl;
  const i = rangeIndexAt(edl, t);
  const r = ranges[i];
  if (i === ranges.length - 1 && r.end >= edl.sourceDuration) return null;
  const early = Math.min(Math.max(lookahead, 0), (r.end - r.start) / 2);
  return r.end - early - t;
}

/** Index of the last range starting at or before `t`, or -1. */
function lastStartingAtOrBefore(edl: Edl, t: number): number {
  const { ranges } = edl;
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid].start <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
