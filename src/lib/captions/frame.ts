import { cropRect, type Crop } from "@/lib/clips/crop";
import type { CaptionPage } from "./group";
import { paintCaptions, type Ctx2D } from "./render";
import type { CaptionSettings } from "./types";

export interface ClipFrame {
  /** A decoded video frame: an HTMLVideoElement in the preview, a VideoFrame or ImageBitmap in the export worker. */
  image: CanvasImageSource;
  /** Size of `image` in pixels. */
  imageWidth: number;
  imageHeight: number;
  /** The part of the frame to show (see Clip.crop). The canvas should have its aspect. */
  crop: Crop;
  pages: readonly CaptionPage[];
  /** Clip time of this frame, in seconds from the start of the edited clip. */
  time: number;
  settings: CaptionSettings;
  fontFamily?: string;
}

/**
 * Draws one finished frame: the cropped video, then the captions. The
 * preview calls this every frame and the export worker will call it once per
 * output frame, with the same inputs, so the two cannot drift apart.
 */
export function renderClipFrame(ctx: Ctx2D, width: number, height: number, f: ClipFrame): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  const crop = cropRect(f.imageWidth, f.imageHeight, f.crop);
  if (crop.w > 0 && crop.h > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(f.image, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  }
  paintCaptions(ctx, width, height, f.pages, f.time, f.settings, f.fontFamily);
}
