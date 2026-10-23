import type { CaptionPage, CaptionWord } from "./group";

/** Captions are laid out and drawn in a fixed 1080x1920 design space, whatever size the canvas is. */
export const DESIGN_W = 1080;
export const DESIGN_H = 1920;

export interface LaidWord {
  word: CaptionWord;
  /** The text as drawn (upper-cased for styles that want it). */
  text: string;
  /** Left edge from the start of its line, and width, at the unshrunk font size. */
  x: number;
  width: number;
}

export interface LaidLine {
  words: LaidWord[];
  width: number;
}

export interface PageLayout {
  lines: LaidLine[];
  /** 1, or less when the widest line had to shrink to fit `maxWidth`. */
  scale: number;
}

export interface LayoutOptions {
  uppercase: boolean;
  /** Width the widest line may take. */
  maxWidth: number;
  /** Width of a space at the unshrunk font size. */
  space: number;
}

/** Shrinking stops here, so an absurdly long word overflows rather than becoming unreadable. */
export const MIN_FIT_SCALE = 0.25;

/**
 * Positions the words of a page. `measure` gives the width of a string at the
 * unshrunk font size. The layout only depends on the page's words, never on which
 * one is active, so lines don't shift as the highlight moves. A line wider than
 * `maxWidth` shrinks the whole page by the same factor, which keeps lines matched.
 */
export function layoutPage(page: CaptionPage, measure: (text: string) => number, o: LayoutOptions): PageLayout {
  const lines: LaidLine[] = page.lines.map((line) => {
    let x = 0;
    const words = line.map((word, i) => {
      const text = o.uppercase ? word.text.toUpperCase() : word.text;
      const width = measure(text);
      if (i > 0) x += o.space;
      const laid = { word, text, x, width };
      x += width;
      return laid;
    });
    return { words, width: x };
  });
  const widest = Math.max(0, ...lines.map((l) => l.width));
  const scale = widest > o.maxWidth ? Math.max(MIN_FIT_SCALE, o.maxWidth / widest) : 1;
  return { lines, scale };
}

/** Top of a caption block of height `blockHeight`; top and bottom hold their edge so the block grows inward. */
export function blockTop(position: "top" | "middle" | "bottom", blockHeight: number): number {
  switch (position) {
    case "top":
      return DESIGN_H * 0.13;
    case "middle":
      return (DESIGN_H - blockHeight) / 2;
    case "bottom":
      return DESIGN_H * 0.8 - blockHeight;
  }
}
