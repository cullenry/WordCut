"use client";

import { useEffect, useRef, useState } from "react";
import { renderClipFrame } from "@/lib/captions/frame";
import type { CaptionPage } from "@/lib/captions/group";
import { captionPagesFor } from "@/lib/captions/words";
import { cropRatio, cropRect, panCrop, type Crop } from "@/lib/clips/crop";
import type { Edl } from "@/lib/edl/edl";
import { sourceToEdited } from "@/lib/edl/time";
import { outputSize } from "@/lib/media/export/plan";
import type { Word } from "@/lib/transcript/types";
import { selectActiveClip, selectPlayEdl, useEditorStore } from "@/store/editor-store";
import { captionFontFamily, ensureCaptionFonts } from "./captionFont";

/** A press that moves less than this is a click (play or pause), not a drag of the crop. */
const DRAG_SLOP = 4;

let pageCache: {
  words: readonly Word[];
  deleted: ReadonlySet<string>;
  edl: Edl;
  start: number;
  end: number;
  pages: CaptionPage[];
} | null = null;

/** Caption pages only change with the words, the cuts or the clip range, not with crop or style. */
function pagesFor(words: readonly Word[], deleted: ReadonlySet<string>, edl: Edl, start: number, end: number) {
  const c = pageCache;
  if (c && c.words === words && c.deleted === deleted && c.edl === edl && c.start === start && c.end === end) return c.pages;
  const pages = captionPagesFor(words, deleted, edl, start, end);
  pageCache = { words, deleted, edl, start, end, pages };
  return pages;
}

/**
 * The live preview of the selected clip, in the crop's shape. Every frame goes
 * through renderClipFrame, the same function the exporter will call, so the crop and
 * the captions here are exactly what ends up in the file. Dragging the picture moves
 * the crop over the source; a click plays or pauses.
 */
export function ClipStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const empty = useEditorStore((s) => (selectPlayEdl(s)?.duration ?? 0) === 0);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const playing = useEditorStore((s) => s.playing);
  const ratio = useEditorStore((s) => {
    const clip = selectActiveClip(s);
    return clip && s.source ? cropRatio(clip.crop, s.source.meta.width, s.source.meta.height) : 9 / 16;
  });
  const drag = useRef<{ x: number; y: number; crop: Crop; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  // The largest box of the crop's shape that fits the pane.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.min(el.clientWidth, el.clientHeight * ratio);
      setBox({ w: Math.floor(w), h: Math.floor(w / ratio) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);

  // Size the backing store to the screen (so text is sharp), then draw whenever anything changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || box.w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Never more pixels than the export draws, nor than the screen shows.
    canvas.width = Math.min(outputSize(ratio, "1080").width, Math.round(box.w * dpr));
    canvas.height = Math.max(1, Math.round(canvas.width / ratio));

    const family = captionFontFamily();
    let raf = 0;
    const draw = () => {
      raf = 0;
      const s = useEditorStore.getState();
      const clip = selectActiveClip(s);
      const edl = selectPlayEdl(s);
      const video = s.video;
      if (!clip || !edl || !video || !s.transcript) return;
      const pages = pagesFor(s.transcript.words, s.deleted, edl, clip.start, clip.end);
      try {
        renderClipFrame(ctx, canvas.width, canvas.height, {
          image: video,
          imageWidth: video.videoWidth,
          imageHeight: video.videoHeight,
          crop: clip.crop,
          pages,
          time: sourceToEdited(edl, video.currentTime),
          settings: clip.captions,
          fontFamily: family,
        });
      } catch {
        // A frame that isn't decoded yet; the next one will do.
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    drawRef.current = draw;
    draw();
    void ensureCaptionFonts(family).then(schedule);
    const unsubscribe = useEditorStore.subscribe(schedule);
    // A paused video fires no events when a frame finishes decoding after a seek.
    const video = useEditorStore.getState().video;
    video?.addEventListener("seeked", schedule);
    video?.addEventListener("loadeddata", schedule);
    return () => {
      drawRef.current = null;
      unsubscribe();
      video?.removeEventListener("seeked", schedule);
      video?.removeEventListener("loadeddata", schedule);
      cancelAnimationFrame(raf);
    };
  }, [box, ratio]);

  // While playing, draw in step with the video rather than waiting on store updates.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      drawRef.current?.();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <div ref={wrapRef} className="absolute inset-2 grid place-items-center">
      <div className="relative" style={{ width: box.w, height: box.h }}>
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            const s = useEditorStore.getState();
            const clip = selectActiveClip(s);
            if (e.button !== 0 || !clip) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, crop: clip.crop, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            const s = useEditorStore.getState();
            const clip = selectActiveClip(s);
            if (!d || !clip || !s.source || box.w === 0) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
            if (!d.moved) setDragging(true);
            d.moved = true;
            const { width, height } = s.source.meta;
            // Source pixels per screen pixel; dragging the picture right moves the window left.
            const k = cropRect(width, height, d.crop).w / box.w;
            s.editClip(clip.id, { crop: panCrop(width, height, d.crop, -dx * k, -dy * k) });
          }}
          onPointerUp={() => {
            if (drag.current && !drag.current.moved) togglePlay();
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          aria-label="Preview of the selected clip. Click to play or pause, drag to move the crop."
          className={`block touch-none rounded-md bg-black ${dragging ? "cursor-grabbing" : "cursor-pointer"}`}
          style={{ width: box.w, height: box.h }}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/70">
            Everything in this clip is cut. Undo, or restore words in the transcript.
          </div>
        )}
      </div>
    </div>
  );
}
