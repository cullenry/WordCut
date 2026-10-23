import { activeWordAt, pageIndexAt, type CaptionPage } from "./group";
import { blockTop, DESIGN_H, DESIGN_W, layoutPage, type LaidLine, type LaidWord } from "./layout";
import { readableOn, type CaptionSettings, type CaptionStyleId } from "./types";

/**
 * The one caption painter. The live 9:16 preview and the export worker both call
 * drawCaptions, so what you see is what you export. It only needs the Canvas 2D
 * API, which a main-thread canvas and an OffscreenCanvas in a worker both have.
 */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const DEFAULT_FONT_FAMILY = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

interface StyleSpec {
  /** Font size in design pixels at size 1. */
  fontPx: number;
  weight: number;
  uppercase: boolean;
  /** Line pitch as a multiple of the font size (non-boxed styles). */
  lineHeight: number;
  /** Widest a line may be, in design pixels. */
  maxWidth: number;
}

export const STYLE_SPECS: Record<CaptionStyleId, StyleSpec> = {
  bold: { fontPx: 92, weight: 900, uppercase: true, lineHeight: 1.14, maxWidth: 940 },
  minimal: { fontPx: 58, weight: 600, uppercase: false, lineHeight: 1.28, maxWidth: 900 },
  boxed: { fontPx: 58, weight: 700, uppercase: false, lineHeight: 1, maxWidth: 860 },
};

/** Boxed style metrics, design pixels at scale 1. */
const BOX = { padX: 28, padY: 16, gap: 10, radius: 16, wordInset: 6, wordPadX: 8 };

/** How long the bold style's pop on a newly spoken word lasts, and how much it overshoots. */
const POP_SECONDS = 0.12;
const POP_AMOUNT = 0.12;

/** Scale of the active word `elapsed` seconds after it started: a quick pop that settles at 1. */
export function popScale(elapsed: number): number {
  if (!(elapsed >= 0) || elapsed >= POP_SECONDS) return 1;
  const k = 1 - elapsed / POP_SECONDS;
  return 1 + POP_AMOUNT * k * k;
}

const fontOf = (spec: StyleSpec, px: number, family: string) => `${spec.weight} ${px}px ${family}`;

/**
 * The CSS font a style draws its words in (before any shrink to fit), and the text
 * transform it applies. Used to load the font and to check two contexts measure alike.
 */
export function captionFont(settings: Pick<CaptionSettings, "style" | "size">, family: string = DEFAULT_FONT_FAMILY) {
  const spec = STYLE_SPECS[settings.style];
  return { font: fontOf(spec, spec.fontPx * settings.size, family), uppercase: spec.uppercase };
}

// Text measuring is the slow part of a frame, and the same few words repeat for many frames.
const widths = new Map<string, number>();
const MAX_CACHED_WIDTHS = 4000;

function measureWith(ctx: Ctx2D, font: string): (text: string) => number {
  return (text) => {
    const key = `${font}|${text}`;
    let w = widths.get(key);
    if (w === undefined) {
      if (widths.size >= MAX_CACHED_WIDTHS) widths.clear();
      ctx.font = font;
      w = ctx.measureText(text).width;
      widths.set(key, w);
    }
    return w;
  };
}

/**
 * Draws the captions for clip time `t` in the 1080x1920 design space: the caller
 * scales the context so that space fills the canvas (see paintCaptions). Draws
 * nothing when captions are off or no page is on screen.
 */
export function drawCaptions(
  ctx: Ctx2D,
  pages: readonly CaptionPage[],
  t: number,
  settings: CaptionSettings,
  fontFamily: string = DEFAULT_FONT_FAMILY,
): void {
  if (!settings.enabled) return;
  const pageIndex = pageIndexAt(pages, t);
  if (pageIndex < 0) return;
  const page = pages[pageIndex];
  const active = activeWordAt(page, t);

  const spec = STYLE_SPECS[settings.style];
  const boxed = settings.style === "boxed";
  const px = spec.fontPx * settings.size;
  const measure = measureWith(ctx, fontOf(spec, px, fontFamily));
  const maxWidth = boxed ? spec.maxWidth - 2 * BOX.padX : spec.maxWidth;
  const layout = layoutPage(page, measure, { uppercase: spec.uppercase, maxWidth, space: measure(" ") || px * 0.28 });

  const s = layout.scale;
  const fs = px * s;
  const boxH = fs + 2 * BOX.padY * s;
  const step = boxed ? boxH + BOX.gap * s : fs * spec.lineHeight;
  const blockH = layout.lines.length * step - (boxed ? BOX.gap * s : 0);
  let top = blockTop(settings.position, blockH);

  ctx.save();
  ctx.font = fontOf(spec, fs, fontFamily);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (const line of layout.lines) {
    const lineW = line.width * s;
    const x0 = (DESIGN_W - lineW) / 2;
    const cy = top + (boxed ? boxH / 2 : step / 2);
    if (boxed) drawBox(ctx, line, x0, cy, boxH, s);
    for (const lw of line.words) {
      const isActive = lw.word === active;
      const wx = x0 + lw.x * s;
      const ww = lw.width * s;
      if (settings.style === "bold") drawBold(ctx, lw, wx, ww, cy, fs, isActive, settings.color, t);
      else if (settings.style === "minimal") drawMinimal(ctx, lw, wx, cy, fs, isActive, settings.color);
      else drawBoxedWord(ctx, lw, wx, ww, cy, fs, boxH, s, isActive, settings.color);
    }
    top += step;
  }
  ctx.restore();
}

function drawBold(
  ctx: Ctx2D,
  lw: LaidWord,
  wx: number,
  ww: number,
  cy: number,
  fs: number,
  active: boolean,
  color: string,
  t: number,
) {
  const k = active ? popScale(t - lw.word.start) : 1;
  ctx.save();
  ctx.translate(wx + ww / 2, cy);
  ctx.scale(k, k);
  ctx.miterLimit = 2;
  ctx.lineWidth = fs * 0.2;
  ctx.strokeStyle = "#000000";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = fs * 0.1;
  ctx.shadowOffsetY = fs * 0.05;
  ctx.strokeText(lw.text, -ww / 2, 0);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = active ? color : "#ffffff";
  ctx.fillText(lw.text, -ww / 2, 0);
  ctx.restore();
}

function drawMinimal(ctx: Ctx2D, lw: LaidWord, wx: number, cy: number, fs: number, active: boolean, color: string) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = fs * 0.14;
  ctx.shadowOffsetY = fs * 0.04;
  ctx.fillStyle = active ? color : "rgba(255, 255, 255, 0.9)";
  ctx.fillText(lw.text, wx, cy);
  ctx.restore();
}

function drawBox(ctx: Ctx2D, line: LaidLine, x0: number, cy: number, boxH: number, s: number) {
  ctx.fillStyle = "rgba(14, 14, 20, 0.84)";
  roundRect(ctx, x0 - BOX.padX * s, cy - boxH / 2, line.width * s + 2 * BOX.padX * s, boxH, BOX.radius * s);
  ctx.fill();
}

function drawBoxedWord(
  ctx: Ctx2D,
  lw: LaidWord,
  wx: number,
  ww: number,
  cy: number,
  fs: number,
  boxH: number,
  s: number,
  active: boolean,
  color: string,
) {
  if (active) {
    const inset = BOX.wordInset * s;
    ctx.fillStyle = color;
    roundRect(ctx, wx - BOX.wordPadX * s, cy - boxH / 2 + inset, ww + 2 * BOX.wordPadX * s, boxH - 2 * inset, (BOX.radius - 4) * s);
    ctx.fill();
  }
  ctx.fillStyle = active ? readableOn(color) : "#ffffff";
  ctx.fillText(lw.text, wx, cy);
}

/** A rounded-rectangle path built from arcs, so it works wherever Canvas 2D does. */
function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Draws captions onto a canvas of any size by mapping the design space onto it. */
export function paintCaptions(
  ctx: Ctx2D,
  width: number,
  height: number,
  pages: readonly CaptionPage[],
  t: number,
  settings: CaptionSettings,
  fontFamily?: string,
): void {
  ctx.save();
  ctx.scale(width / DESIGN_W, height / DESIGN_H);
  drawCaptions(ctx, pages, t, settings, fontFamily);
  ctx.restore();
}
