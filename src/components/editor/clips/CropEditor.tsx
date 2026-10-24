"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CROP_ASPECTS,
  CROP_HANDLES,
  MAX_ZOOM,
  cropRatio,
  cropRect,
  panCrop,
  resizeCrop,
  setCropAspect,
  zoomCrop,
  type Crop,
  type CropAspect,
  type CropHandle,
} from "@/lib/clips/crop";
import type { Clip } from "@/lib/clips/types";
import { outputSize } from "@/lib/media/export/plan";
import { useEditorStore } from "@/store/editor-store";

const ASPECT_LABELS: Record<CropAspect, { name: string; hint: string }> = {
  "9:16": { name: "9:16", hint: "Portrait: TikTok, Reels, Shorts" },
  "1:1": { name: "1:1", hint: "Square" },
  "4:5": { name: "4:5", hint: "Portrait feed post" },
  "16:9": { name: "16:9", hint: "Landscape: YouTube" },
  original: { name: "Original", hint: "The source's own shape" },
  free: { name: "Free", hint: "Drag the corners to any shape" },
};

/** The frame view is never taller than this, so a portrait source doesn't push the captions off the panel. */
const MAX_FRAME_HEIGHT = 220;

/**
 * CapCut-style crop for the selected clip: pick a shape, then drag the window over
 * the source frame (or drag the preview itself), pull its corners and edges to
 * resize, and zoom. Every change is live in the preview and one undo step per gesture.
 */
export function CropEditor({ clip }: { clip: Clip }) {
  const meta = useEditorStore((s) => s.source!.meta);
  const editClip = useEditorStore((s) => s.editClip);
  const { width: srcW, height: srcH } = meta;
  const crop = clip.crop;
  const set = (next: Crop) => editClip(clip.id, { crop: next });
  const rect = cropRect(srcW, srcH, crop);
  const out = outputSize(cropRatio(crop, srcW, srcH), "1080");
  const reset = { ...crop, zoom: 1, x: 0, y: 0 };
  const isReset = crop.zoom === 1 && crop.x === 0 && crop.y === 0;
  // Fewer source pixels than the 1080p export draws: it will be enlarged.
  const upscaled = rect.w > 0 && rect.w < out.width * 0.75;

  return (
    <div className="mt-3 space-y-3">
      <div role="radiogroup" aria-label="Crop shape" className="grid grid-cols-6 gap-1">
        {CROP_ASPECTS.map((a) => {
          const on = a === crop.aspect;
          return (
            <button
              key={a}
              role="radio"
              aria-checked={on}
              title={ASPECT_LABELS[a].hint}
              onClick={() => set(setCropAspect(srcW, srcH, crop, a))}
              className={`press flex flex-col items-center gap-1 rounded-field py-1.5 text-[10px] leading-none ${
                on ? "bg-ink/10 text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              <AspectIcon aspect={a} srcW={srcW} srcH={srcH} />
              {ASPECT_LABELS[a].name}
            </button>
          );
        })}
      </div>

      <CropFrame crop={crop} srcW={srcW} srcH={srcH} onChange={set} onReset={() => set(reset)} />

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-2">
          <span>Zoom</span>
          <span className="font-label text-[11px] text-ink">{(Math.round(crop.zoom * 10) / 10).toFixed(1)}×</span>
        </div>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          onChange={(e) => set(zoomCrop(srcW, srcH, crop, Number(e.target.value)))}
          aria-label="Crop zoom"
          className="h-1 w-full accent-ink"
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-ink-2">
        <span className="font-label" title="Source pixels kept, and the 1080p export size">
          {Math.round(rect.w)} × {Math.round(rect.h)} → {out.width} × {out.height}
          {upscaled && <span className="ml-1.5 text-cut-text">enlarged</span>}
        </span>
        <button
          onClick={() => set(reset)}
          disabled={isReset}
          className="press font-label text-ink/80 hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:text-ink/80"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/** The shape of an aspect, drawn in a 16-pixel square. */
function AspectIcon({ aspect, srcW, srcH }: { aspect: CropAspect; srcW: number; srcH: number }) {
  if (aspect === "free") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" aria-hidden>
        <path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5" />
      </svg>
    );
  }
  const r = cropRatio({ aspect, ratio: 1, zoom: 1, x: 0, y: 0 }, srcW, srcH);
  const w = r >= 1 ? 13 : 13 * r;
  const h = r >= 1 ? 13 / r : 13;
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden>
      <rect x={8 - w / 2} y={8 - h / 2} width={w} height={h} rx={1.2} />
    </svg>
  );
}

interface Drag {
  handle: CropHandle | null;
  /** Pointer at the start, in source pixels. */
  x: number;
  y: number;
  /** How far the pointer was from the grip it took, so the grip doesn't jump under it. */
  gx: number;
  gy: number;
  crop: Crop;
}

/**
 * The whole source frame with the crop window over it; what is cut away is dimmed.
 * Drag inside the window to move it, press outside to centre it there, pull a corner
 * or edge to resize. Arrow keys move it, + and - zoom, double-click resets.
 */
function CropFrame({
  crop,
  srcW,
  srcH,
  onChange,
  onReset,
}: {
  crop: Crop;
  srcW: number;
  srcH: number;
  onChange: (c: Crop) => void;
  onReset: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState<"move" | "resize" | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const srcRatio = srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.min(el.clientWidth, MAX_FRAME_HEIGHT * srcRatio);
      setSize({ w: Math.floor(w), h: Math.floor(w / srcRatio) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [srcRatio]);

  useSourceFrame(canvasRef, size.w, size.h);

  const r = cropRect(srcW, srcH, crop);
  const pct = (v: number, of: number) => `${(of > 0 ? v / of : 0) * 100}%`;

  const toSource = (clientX: number, clientY: number) => {
    const b = frameRef.current!.getBoundingClientRect();
    return { x: ((clientX - b.left) / b.width) * srcW, y: ((clientY - b.top) / b.height) * srcH };
  };

  const end = () => {
    drag.current = null;
    setActive(null);
  };

  return (
    <div ref={wrapRef} className="grid place-items-center">
      <div
        ref={frameRef}
        tabIndex={0}
        role="group"
        aria-label="Crop window. Drag to move, pull the corners to resize. Arrow keys move, plus and minus zoom."
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = toSource(e.clientX, e.clientY);
          const handle = ((e.target as HTMLElement).closest("[data-handle]") as HTMLElement | null)?.dataset.handle as
            | CropHandle
            | undefined;
          let start = crop;
          let gx = 0;
          let gy = 0;
          if (handle) {
            const g = gripAt(cropRect(srcW, srcH, crop), handle);
            gx = g.x - p.x;
            gy = g.y - p.y;
          } else {
            const inside = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
            // Pressing outside the window brings it there, then the drag carries on from it.
            if (!inside) {
              start = panCrop(srcW, srcH, crop, p.x - (r.x + r.w / 2), p.y - (r.y + r.h / 2));
              onChange(start);
            }
          }
          drag.current = { handle: handle ?? null, x: p.x, y: p.y, gx, gy, crop: start };
          setActive(handle ? "resize" : "move");
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || e.buttons !== 1) return;
          const p = toSource(e.clientX, e.clientY);
          onChange(
            d.handle
              ? resizeCrop(srcW, srcH, d.crop, d.handle, p.x + d.gx, p.y + d.gy)
              : panCrop(srcW, srcH, d.crop, p.x - d.x, p.y - d.y),
          );
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={onReset}
        onKeyDown={(e) => {
          const step = (e.shiftKey ? 0.1 : 0.02) * Math.max(srcW, srcH);
          const move: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          let next: Crop | null = null;
          if (move[e.key]) next = panCrop(srcW, srcH, crop, ...move[e.key]);
          else if (e.key === "+" || e.key === "=") next = zoomCrop(srcW, srcH, crop, crop.zoom * 1.1);
          else if (e.key === "-" || e.key === "_") next = zoomCrop(srcW, srcH, crop, crop.zoom / 1.1);
          else if (e.key === "0" || e.key === "Home") {
            e.preventDefault();
            onReset();
            return;
          }
          if (!next) return;
          e.preventDefault();
          onChange(next);
        }}
        className="relative touch-none select-none overflow-hidden rounded-field bg-black outline-none focus-visible:ring-2 focus-visible:ring-ink/50"
        style={{ width: size.w, height: size.h, cursor: active === "move" ? "grabbing" : "default" }}
      >
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        <div
          className={`absolute ${active === "move" ? "" : "cursor-move"}`}
          style={{
            left: pct(r.x, srcW),
            top: pct(r.y, srcH),
            width: pct(r.w, srcW),
            height: pct(r.h, srcH),
            // Dims everything outside the window; the frame clips the spread.
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.58)",
            outline: "1.5px solid rgb(255 255 255 / 0.95)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-150"
            style={{ opacity: active ? 1 : 0, transitionTimingFunction: "var(--ease-out)" }}
          >
            {[1, 2].map((i) => (
              <span key={`v${i}`} className="absolute inset-y-0 w-px bg-white/45" style={{ left: `${(i * 100) / 3}%` }} />
            ))}
            {[1, 2].map((i) => (
              <span key={`h${i}`} className="absolute inset-x-0 h-px bg-white/45" style={{ top: `${(i * 100) / 3}%` }} />
            ))}
          </div>
          {CROP_HANDLES.map((h) => (
            <Grip key={h} handle={h} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Where a grip sits on a window, in source pixels. */
function gripAt(r: { x: number; y: number; w: number; h: number }, h: CropHandle) {
  return {
    x: h.includes("w") ? r.x : h.includes("e") ? r.x + r.w : r.x + r.w / 2,
    y: h.includes("n") ? r.y : h.includes("s") ? r.y + r.h : r.y + r.h / 2,
  };
}

const CURSORS: Record<CropHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

/** A corner bracket or an edge bar, with a hit area bigger than what it draws. */
function Grip({ handle }: { handle: CropHandle }) {
  const corner = handle.length === 2;
  const HIT = 22;
  const pos: CSSProperties = {
    width: corner || handle === "n" || handle === "s" ? HIT : HIT / 2,
    height: corner || handle === "e" || handle === "w" ? HIT : HIT / 2,
    cursor: CURSORS[handle],
  };
  const g = gripAt({ x: 0, y: 0, w: 100, h: 100 }, handle);
  pos.left = `calc(${g.x}% - ${Number(pos.width) / 2}px)`;
  pos.top = `calc(${g.y}% - ${Number(pos.height) / 2}px)`;

  // Drawn in the hit box's own coordinates: an L for a corner, a short bar for an edge.
  const W = Number(pos.width);
  const H = Number(pos.height);
  const L = 9;
  const cx = W / 2;
  const cy = H / 2;
  const d = corner
    ? `M${cx + (handle.includes("w") ? L : -L)} ${cy}H${cx}V${cy + (handle.includes("n") ? L : -L)}`
    : handle === "n" || handle === "s"
      ? `M${cx - 6} ${cy}H${cx + 6}`
      : `M${cx} ${cy - 6}V${cy + 6}`;

  return (
    <div data-handle={handle} className="absolute" style={pos}>
      <svg width={W} height={H} className="pointer-events-none block overflow-visible" aria-hidden>
        <path
          d={d}
          fill="none"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 1.5px rgb(0 0 0 / 0.6))" }}
        />
      </svg>
    </div>
  );
}

/** Keeps a canvas showing the video's current frame: on every store change, after seeks, and each frame while playing. */
function useSourceFrame(ref: React.RefObject<HTMLCanvasElement | null>, w: number, h: number) {
  const playing = useEditorStore((s) => s.playing);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    let raf = 0;
    const draw = () => {
      raf = 0;
      const video = useEditorStore.getState().video;
      if (!video || video.readyState < 2) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        // A frame that isn't decoded yet; the next one will do.
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };

    if (playing) raf = requestAnimationFrame(loop);
    else draw();
    const unsubscribe = useEditorStore.subscribe(schedule);
    const video = useEditorStore.getState().video;
    video?.addEventListener("seeked", schedule);
    video?.addEventListener("loadeddata", schedule);
    return () => {
      unsubscribe();
      video?.removeEventListener("seeked", schedule);
      video?.removeEventListener("loadeddata", schedule);
      cancelAnimationFrame(raf);
    };
  }, [ref, w, h, playing]);
}
