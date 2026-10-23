"use client";

import { useEffect, useRef, useState } from "react";
import { renderClipFrame } from "@/lib/captions/frame";
import type { CaptionPage } from "@/lib/captions/group";
import { captionPagesFor } from "@/lib/captions/words";
import { CROP_ASPECT } from "@/lib/clips/crop";
import type { Edl } from "@/lib/edl/edl";
import { sourceToEdited } from "@/lib/edl/time";
import type { Word } from "@/lib/transcript/types";
import { selectActiveClip, selectPlayEdl, useEditorStore } from "@/store/editor-store";
import { captionFontFamily, ensureCaptionFonts } from "./captionFont";

/** Export draws at this width; the preview never needs more pixels than it has on screen. */
const MAX_BACKING_WIDTH = 1080;

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
 * The live 9:16 preview of the selected clip. Every frame goes through
 * renderClipFrame, the same function the exporter will call, so the crop and the
 * captions here are exactly what ends up in the file.
 */
export function ClipStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const empty = useEditorStore((s) => (selectPlayEdl(s)?.duration ?? 0) === 0);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const playing = useEditorStore((s) => s.playing);

  // The largest 9:16 box that fits the pane.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.min(el.clientWidth, el.clientHeight * CROP_ASPECT);
      setBox({ w: Math.floor(w), h: Math.floor(w / CROP_ASPECT) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Size the backing store to the screen (so text is sharp), then draw whenever anything changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || box.w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.min(MAX_BACKING_WIDTH, Math.round(box.w * dpr));
    canvas.height = Math.round(canvas.width / CROP_ASPECT);

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
          cropOffset: clip.cropOffset,
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
  }, [box]);

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
          onClick={togglePlay}
          aria-label="9:16 preview of the selected clip"
          className="block cursor-pointer rounded-md bg-black"
          style={{ width: box.w, height: box.h }}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
            Everything in this clip is cut. Undo, or restore words in the transcript.
          </div>
        )}
      </div>
    </div>
  );
}
