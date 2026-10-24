import { groupCaptionPages, type CaptionWord } from "./group";
import { DESIGN_H, DESIGN_W } from "./layout";
import { drawCaptions, type Ctx2D } from "./render";
import type { CaptionSettings } from "./types";

const SAMPLE: CaptionWord[] = [
  { id: "s0", text: "Say", start: 0, end: 0.3 },
  { id: "s1", text: "it", start: 0.3, end: 0.6 },
  { id: "s2", text: "out", start: 0.6, end: 0.9 },
  { id: "s3", text: "loud", start: 0.9, end: 1.3 },
];
const SAMPLE_PAGES = groupCaptionPages(SAMPLE, { maxWordsPerLine: 4, maxLines: 1 });
/** A moment when "it" is the spoken word and its pop has settled. */
const SAMPLE_TIME = 0.5;

/**
 * Draws a style swatch for the picker with the real caption painter, so the
 * card shows exactly how that style looks with the current colour.
 */
export function drawCaptionSample(
  ctx: Ctx2D,
  width: number,
  height: number,
  settings: CaptionSettings,
  fontFamily?: string,
): void {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#1e1b18");
  bg.addColorStop(1, "#34302a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const k = width / DESIGN_W;
  ctx.save();
  ctx.scale(k, k);
  // Put the middle of the design space (where "middle" captions sit) in the middle of the card.
  ctx.translate(0, height / k / 2 - DESIGN_H / 2);
  drawCaptions(ctx, SAMPLE_PAGES, SAMPLE_TIME, { ...settings, enabled: true, position: "middle", size: 1 }, fontFamily);
  ctx.restore();
}
