/** 9:16 portrait. */
export const CROP_ASPECT = 9 / 16;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clampOffset = (offset: number): number =>
  Number.isFinite(offset) ? Math.min(Math.max(offset, -1), 1) : 0;

/** Which way the crop can slide: x for a landscape source, y for one taller than 9:16. */
export type CropAxis = "x" | "y";

export function cropAxis(srcW: number, srcH: number): CropAxis {
  return srcW / srcH >= CROP_ASPECT ? "x" : "y";
}

/**
 * The 9:16 window to cut out of a source frame, in source pixels. It is as big
 * as it can be: the full height of a landscape source (full width of a taller one).
 * `offset` slides it along the slack axis, -1 to the start edge, 1 to the end edge.
 */
export function cropRect(srcW: number, srcH: number, offset = 0): CropRect {
  if (!(srcW > 0 && srcH > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const t = (clampOffset(offset) + 1) / 2;
  if (cropAxis(srcW, srcH) === "x") {
    const w = srcH * CROP_ASPECT;
    return { x: (srcW - w) * t, y: 0, w, h: srcH };
  }
  const h = srcW / CROP_ASPECT;
  return { x: 0, y: (srcH - h) * t, w: srcW, h };
}

/** The crop window as a fraction of the source along the slack axis (1 = no room to slide). */
export function cropFraction(srcW: number, srcH: number): number {
  if (!(srcW > 0 && srcH > 0)) return 1;
  const r = cropRect(srcW, srcH);
  return cropAxis(srcW, srcH) === "x" ? r.w / srcW : r.h / srcH;
}

/**
 * The offset that puts the window's centre at `position`, a 0..1 fraction of the
 * source along the slack axis. Clamped, so dragging past an edge pins to it.
 */
export function offsetForCentre(position: number, fraction: number): number {
  const slack = 1 - fraction;
  if (slack <= 0) return 0;
  return clampOffset(((position - fraction / 2) / slack) * 2 - 1);
}

/** Inverse of offsetForCentre: where the window's start edge is, as a 0..1 fraction of the source. */
export function windowStart(offset: number, fraction: number): number {
  return ((clampOffset(offset) + 1) / 2) * Math.max(0, 1 - fraction);
}
