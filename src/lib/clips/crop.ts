/**
 * A clip's crop: the window of the source frame that ends up in the clip. It is
 * stored without the source size, as a shape (aspect), a zoom and a position, so
 * every value of it is a window that fits inside any source. cropRect turns it into
 * source pixels; cropFromRect turns a window drawn by hand back into a crop.
 */

export type CropAspect = "9:16" | "1:1" | "4:5" | "16:9" | "original" | "free";

/** In the order the inspector shows them. */
export const CROP_ASPECTS: readonly CropAspect[] = ["9:16", "1:1", "4:5", "16:9", "original", "free"];

const PRESET_RATIOS: Record<Exclude<CropAspect, "original" | "free">, number> = {
  "9:16": 9 / 16,
  "1:1": 1,
  "4:5": 4 / 5,
  "16:9": 16 / 9,
};

export interface Crop {
  aspect: CropAspect;
  /** Width over height of a free-form window, in pixels. Only read when aspect is "free". */
  ratio: number;
  /** 1 = the largest window of this shape that fits the source, 2 = half as wide and half as tall. */
  zoom: number;
  /** Where the window sits in the room around it: -1 = left (top) edge, 0 = centre, 1 = right (bottom) edge. */
  x: number;
  y: number;
}

export const DEFAULT_CROP: Crop = { aspect: "9:16", ratio: 9 / 16, zoom: 1, x: 0, y: 0 };

export const MAX_ZOOM = 5;
/** A free window is kept between 1:5 and 5:1, so the output size stays sensible. */
export const MIN_RATIO = 1 / 5;
export const MAX_RATIO = 5;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export const clampOffset = (offset: number): number => (Number.isFinite(offset) ? clamp(offset, -1, 1) : 0);
export const clampZoom = (zoom: number): number => (Number.isFinite(zoom) ? clamp(zoom, 1, MAX_ZOOM) : 1);
const clampRatio = (ratio: number): number => (Number.isFinite(ratio) && ratio > 0 ? clamp(ratio, MIN_RATIO, MAX_RATIO) : 1);

const isAspect = (v: unknown): v is CropAspect => typeof v === "string" && (CROP_ASPECTS as readonly string[]).includes(v);

/** Turns anything (a saved crop, a patch) into a valid crop; missing or bad fields fall back to the default. */
export function normalizeCrop(raw: unknown): Crop {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
  return {
    aspect: isAspect(r.aspect) ? r.aspect : DEFAULT_CROP.aspect,
    ratio: clampRatio(num(r.ratio, DEFAULT_CROP.ratio)),
    zoom: clampZoom(num(r.zoom, 1)),
    x: clampOffset(num(r.x, 0)),
    y: clampOffset(num(r.y, 0)),
  };
}

/** The 9:16 crop of a project saved when the only control was a slider along the slack axis. */
export const cropFromOffset = (offset: number): Crop => ({ ...DEFAULT_CROP, x: clampOffset(offset), y: clampOffset(offset) });

export const sameCrop = (a: Crop, b: Crop): boolean =>
  a.aspect === b.aspect && a.ratio === b.ratio && a.zoom === b.zoom && a.x === b.x && a.y === b.y;

/** Width over height of the window, in pixels. 1 for a source with no size. */
export function cropRatio(crop: Crop, srcW: number, srcH: number): number {
  if (crop.aspect === "free") return clampRatio(crop.ratio);
  if (crop.aspect === "original") return srcW > 0 && srcH > 0 ? srcW / srcH : 1;
  return PRESET_RATIOS[crop.aspect];
}

/** The largest window of `ratio` that fits the source. */
function fitSize(srcW: number, srcH: number, ratio: number) {
  return srcW / srcH >= ratio ? { w: srcH * ratio, h: srcH } : { w: srcW, h: srcW / ratio };
}

/** Maps a -1..1 position onto the room left around the window, and back. */
const placeAt = (offset: number, slack: number) => (Math.max(0, slack) * (clampOffset(offset) + 1)) / 2;
const offsetOf = (pos: number, slack: number) => (slack > 1e-9 ? clampOffset((pos / slack) * 2 - 1) : 0);

/** The window to cut out of a source frame, in source pixels. Always inside the frame. */
export function cropRect(srcW: number, srcH: number, crop: Crop = DEFAULT_CROP): CropRect {
  if (!(srcW > 0 && srcH > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const fit = fitSize(srcW, srcH, cropRatio(crop, srcW, srcH));
  const zoom = clampZoom(crop.zoom);
  const w = fit.w / zoom;
  const h = fit.h / zoom;
  return { x: placeAt(crop.x, srcW - w), y: placeAt(crop.y, srcH - h), w, h };
}

/**
 * The crop that best matches a window in source pixels. With a fixed aspect the
 * width sets the size and the height follows; "free" takes its ratio from the window.
 */
export function cropFromRect(srcW: number, srcH: number, rect: CropRect, aspect: CropAspect): Crop {
  if (!(srcW > 0 && srcH > 0 && rect.w > 0 && rect.h > 0)) return { ...DEFAULT_CROP, aspect };
  const ratio = aspect === "free" ? clampRatio(rect.w / rect.h) : cropRatio({ ...DEFAULT_CROP, aspect }, srcW, srcH);
  const fit = fitSize(srcW, srcH, ratio);
  const zoom = clampZoom(fit.w / rect.w);
  const w = fit.w / zoom;
  const h = fit.h / zoom;
  // Place by the centre, so a window that had to change size stays where it was drawn.
  const x = rect.x + rect.w / 2 - w / 2;
  const y = rect.y + rect.h / 2 - h / 2;
  return { aspect, ratio, zoom, x: offsetOf(x, srcW - w), y: offsetOf(y, srcH - h) };
}

const centreOf = (r: CropRect) => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2 });

/** A window of size w × h centred on (cx, cy), pushed back inside the source if it hangs over an edge. */
function placed(srcW: number, srcH: number, cx: number, cy: number, w: number, h: number): CropRect {
  return { x: clamp(cx - w / 2, 0, Math.max(0, srcW - w)), y: clamp(cy - h / 2, 0, Math.max(0, srcH - h)), w, h };
}

/** `crop` with its window centred on (cx, cy), or as near as the edges allow. Only x and y change. */
function centredOn(srcW: number, srcH: number, crop: Crop, cx: number, cy: number): Crop {
  const r = cropRect(srcW, srcH, crop);
  const p = placed(srcW, srcH, cx, cy, r.w, r.h);
  return { ...crop, x: offsetOf(p.x, srcW - r.w), y: offsetOf(p.y, srcH - r.h) };
}

/** Slides the window by (dx, dy) source pixels from where `crop` puts it. Stops at the edges. */
export function panCrop(srcW: number, srcH: number, crop: Crop, dx: number, dy: number): Crop {
  if (!(srcW > 0 && srcH > 0)) return crop;
  const { cx, cy } = centreOf(cropRect(srcW, srcH, crop));
  return centredOn(srcW, srcH, crop, cx + dx, cy + dy);
}

/** Zooms around the window's centre (as far as the edges allow). */
export function zoomCrop(srcW: number, srcH: number, crop: Crop, zoom: number): Crop {
  if (!(srcW > 0 && srcH > 0)) return { ...crop, zoom: clampZoom(zoom) };
  const { cx, cy } = centreOf(cropRect(srcW, srcH, crop));
  return centredOn(srcW, srcH, { ...crop, zoom: clampZoom(zoom) }, cx, cy);
}

/**
 * Switches the window's shape. A preset starts again from the largest window of
 * that shape, centred where the old one was; "free" keeps the window as it is.
 */
export function setCropAspect(srcW: number, srcH: number, crop: Crop, aspect: CropAspect): Crop {
  if (aspect === crop.aspect) return crop;
  const r = cropRect(srcW, srcH, crop);
  if (aspect === "free") return { ...crop, aspect, ratio: r.w > 0 ? clampRatio(r.w / r.h) : crop.ratio };
  const { cx, cy } = centreOf(r);
  return centredOn(srcW, srcH, { ...crop, aspect, zoom: 1 }, cx, cy);
}

/** A grip on the window: a corner or an edge, by compass point. */
export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const CROP_HANDLES: readonly CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * Drags one grip of the window to (px, py) in source pixels, the opposite side
 * staying put. A fixed aspect is kept (an edge grip then grows the window about its
 * centre line); "free" lets each side move on its own. The window stays inside the
 * source and no smaller than MAX_ZOOM allows.
 */
export function resizeCrop(srcW: number, srcH: number, crop: Crop, handle: CropHandle, px: number, py: number): Crop {
  if (!(srcW > 0 && srcH > 0)) return crop;
  const r = cropRect(srcW, srcH, crop);
  const free = crop.aspect === "free";
  const ratio = cropRatio(crop, srcW, srcH);
  const e = handle.includes("e");
  const w = handle.includes("w");
  const n = handle.includes("n");
  const s = handle.includes("s");
  const right = r.x + r.w;
  const bottom = r.y + r.h;
  const { cx, cy } = centreOf(r);

  // The most each side can grow to: from the fixed edge to the frame, or twice the
  // distance from the centre line to the nearer edge when the window grows about it.
  const roomW = e ? srcW - r.x : w ? right : 2 * Math.min(cx, srcW - cx);
  const roomH = s ? srcH - r.y : n ? bottom : 2 * Math.min(cy, srcH - cy);
  const wantW = e ? px - r.x : w ? right - px : r.w;
  const wantH = s ? py - r.y : n ? bottom - py : r.h;

  let nw: number;
  let nh: number;
  if (free) {
    const minSide = Math.min(srcW, srcH) / MAX_ZOOM;
    nw = clamp(wantW, Math.min(minSide, roomW), roomW);
    nh = clamp(wantH, Math.min(minSide, roomH), roomH);
  } else {
    const fit = fitSize(srcW, srcH, ratio);
    // A corner follows whichever way the pointer went further; an edge sets its own side.
    const byEdge = (e || w) && (n || s) ? Math.max(wantW, wantH * ratio) : e || w ? wantW : wantH * ratio;
    nw = clamp(byEdge, fit.w / MAX_ZOOM, Math.min(roomW, roomH * ratio));
    nh = nw / ratio;
  }

  const x = e ? r.x : w ? right - nw : cx - nw / 2;
  const y = s ? r.y : n ? bottom - nh : cy - nh / 2;
  return { ...cropFromRect(srcW, srcH, { x, y, w: nw, h: nh }, crop.aspect), ...(free ? {} : { ratio: crop.ratio }) };
}

/** The aspect a crop's output has, for labels: "9:16", or "1.85:1" for a free window. */
export function cropAspectLabel(crop: Crop, srcW: number, srcH: number): string {
  if (crop.aspect !== "original" && crop.aspect !== "free") return crop.aspect;
  const r = cropRatio(crop, srcW, srcH);
  const known = Object.entries(PRESET_RATIOS).find(([, v]) => Math.abs(v - r) < 0.005);
  if (known) return known[0];
  return r >= 1 ? `${trim(r)}:1` : `1:${trim(1 / r)}`;
}

const trim = (v: number) => String(Math.round(v * 100) / 100);
