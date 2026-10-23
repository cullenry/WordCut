export interface EstimateOptions {
  /** Width available for text, in px. */
  textWidth: number;
  /** Average glyph width in px at the body font size. */
  charWidth?: number;
  /** Average characters per word, counting the space. */
  charsPerWord?: number;
  lineHeight?: number;
  /** Fixed height around the text (padding, speaker label). */
  extra?: number;
}

/** Rough height of a paragraph before it has been measured. */
export function estimateParagraphHeight(
  wordCount: number,
  { textWidth, charWidth = 8, charsPerWord = 6, lineHeight = 28, extra = 20 }: EstimateOptions,
): number {
  const charsPerLine = Math.max(10, Math.floor(textWidth / charWidth));
  const lines = Math.max(1, Math.ceil((wordCount * charsPerWord) / charsPerLine));
  return lines * lineHeight + extra;
}

/** Cumulative row tops: offsets[i] is the top of row i, offsets[n] the total height. */
export function buildOffsets(heights: ArrayLike<number>): Float64Array {
  const offsets = new Float64Array(heights.length + 1);
  for (let i = 0; i < heights.length; i++) offsets[i + 1] = offsets[i] + heights[i];
  return offsets;
}

/** Index of the row containing vertical position `y` (clamped to a valid row). */
export function rowAt(offsets: Float64Array, y: number): number {
  const n = offsets.length - 1;
  if (n <= 0) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Half-open row range [start, end) to render for the viewport, with overscan on both sides. */
export function visibleRange(
  offsets: Float64Array,
  scrollTop: number,
  viewportHeight: number,
  overscanPx = 400,
): { start: number; end: number } {
  const n = offsets.length - 1;
  if (n <= 0) return { start: 0, end: 0 };
  const start = rowAt(offsets, Math.max(0, scrollTop - overscanPx));
  const end = rowAt(offsets, scrollTop + viewportHeight + overscanPx) + 1;
  return { start, end: Math.min(n, end) };
}
