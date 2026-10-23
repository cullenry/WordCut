/** Tick spacings in whole seconds, from a second up to an hour. */
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** The smallest tidy step that gives at most `maxTicks` labels over `duration` seconds. */
export function tickStep(duration: number, maxTicks: number): number {
  const want = duration / Math.max(1, maxTicks - 1);
  return STEPS.find((s) => s >= want) ?? Math.ceil(want / 3600) * 3600;
}

/**
 * Labelled tick positions for a timeline of `duration` seconds: whole seconds,
 * at multiples of a tidy step, so labels never repeat and each lands exactly on its second.
 * Always includes 0; includes no tick beyond the end.
 */
export function timelineTicks(duration: number, maxTicks: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const step = tickStep(duration, maxTicks);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);
  return ticks;
}
