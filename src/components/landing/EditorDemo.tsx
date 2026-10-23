"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { captionFontFamily, ensureCaptionFonts } from "@/components/editor/captionFont";
import { activeWordAt, pageIndexAt } from "@/lib/captions/group";
import { paintCaptions } from "@/lib/captions/render";
import { CAPTION_COLORS, DEFAULT_CAPTIONS } from "@/lib/captions/types";
import { captionPagesFor } from "@/lib/captions/words";
import { defaultClipName } from "@/lib/clips/ops";
import { clipEdl, clipFromWordRange } from "@/lib/clips/range";
import { APP_NAME } from "@/lib/config";
import { buildEdl, editedCuts } from "@/lib/edl/edl";
import { editedToSource, sourceToEdited } from "@/lib/edl/time";
import { formatDuration, formatTime } from "@/lib/format";
import { findFillers } from "@/lib/transcript/fillers";
import { HERO_DURATION, HERO_LINE, toWords } from "./lines";
import { Scene } from "./Scene";

const DURATION = HERO_DURATION;
const WORDS = toWords(HERO_LINE, "w");

// Everything the demo shows is computed by the editor's own code: the cuts, the
// edited length, the clip and its caption pages.
const FILLERS = findFillers(WORDS, new Set()).map((f) => WORDS.findIndex((w) => w.id === f.ids[0]));
const CUT = new Set(FILLERS.map((i) => WORDS[i].id));
const EDL = buildEdl(WORDS, CUT, DURATION);
const NOTCHES = editedCuts(EDL);
const SEL = { start: 5, end: WORDS.length - 1 };
const SEL_COUNT = SEL.end - SEL.start + 1;
const CLIP = clipFromWordRange(WORDS, SEL, DURATION);
const CLIP_EDL = clipEdl(EDL, CLIP.start, CLIP.end);
const PAGES = captionPagesFor(WORDS, CUT, CLIP_EDL, CLIP.start, CLIP.end);
const CLIP_NAME = defaultClipName(
  WORDS.slice(SEL.start, SEL.end + 1).filter((w) => !CUT.has(w.id)),
  [],
);
const CLIP_AT = sourceToEdited(EDL, CLIP.start);
const CLIP_CUT = CLIP.end - CLIP.start - CLIP_EDL.duration;
/** Playback stops on the last word, so its caption stays up through the pause. */
const PLAY_END = PAGES[PAGES.length - 1].words.at(-1)!.end;

/** The script, in ms from the start of a loop. */
const S = {
  type: 450,
  cursorIn: 2650,
  um: 2800,
  umClick: 3250,
  uh: 3600,
  uhClick: 4050,
  close: 4450,
  selFrom: 5250,
  sel: 5700,
  chip: 6550,
  toChip: 6800,
  chipClick: 7200,
  clip: 7300,
  cursorOut: 7600,
  play: 7750,
  out: 12700,
  reset: 12950,
  loop: 13200,
};
const TYPE_STEP = 95;
const SEL_STEP = 45;
const CLOSE_MS = 500;
const MOVE_MS = 420;
const CLICKS = [S.umClick, S.uhClick, S.chipClick];

/** With reduced motion, the demo is this one frame: mid-clip, on the word "words". */
const STILL_MS = S.play + (PAGES.flatMap((p) => p.words).find((w) => w.id === "w17")!.start + 0.2) * 1000;

interface Frame {
  /** Panels faded out between loops. */
  out: boolean;
  /** Transitions off while everything snaps back to the start. */
  reset: boolean;
  typed: number;
  caret: boolean;
  struck: number;
  closed: boolean;
  /** The edited length shown by the counter, to a tenth. */
  length: number;
  selected: number;
  chip: "hidden" | "shown" | "pressed";
  clip: boolean;
  playing: boolean;
  active: string | null;
  cursor: boolean;
  /** `target` or `target:edge`, a key into the measured targets. */
  cursorAt: string;
  cursorMs: number;
  pressed: boolean;
  clicks: number;
  ring: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const easeInOut = (p: number) => (p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2);
const clipTimeAt = (ms: number) => clamp((ms - S.play) / 1000, 0, PLAY_END);

function frameAt(ms: number): Frame {
  if (ms >= S.reset) return { ...frameAt(0), out: true, reset: true };
  const count = (from: number, step: number, max: number) => clamp(Math.floor((ms - from) / step) + 1, 0, max);
  const typed = count(S.type, TYPE_STEP, WORDS.length);
  const selected = count(S.sel, SEL_STEP, SEL_COUNT);
  const selEnd = S.sel + SEL_COUNT * SEL_STEP;
  const past = CLICKS.filter((c) => ms >= c);
  const clip = ms >= S.clip;
  const t = clipTimeAt(ms);
  const page = ms >= S.play ? pageIndexAt(PAGES, t) : -1;

  let cursorAt = "rest";
  let cursorMs = MOVE_MS;
  if (ms >= S.toChip) cursorAt = "chip";
  else if (ms >= S.sel) [cursorAt, cursorMs] = [`w${SEL.start + selected - 1}:end`, 60];
  else if (ms >= S.selFrom) cursorAt = `w${SEL.start}:start`;
  else if (ms >= S.uh) cursorAt = `w${FILLERS[1]}`;
  else if (ms >= S.um) cursorAt = `w${FILLERS[0]}`;

  return {
    out: ms >= S.out,
    reset: false,
    typed,
    caret: ms >= S.type - 250 && ms < S.type + WORDS.length * TYPE_STEP + 250,
    struck: [S.umClick, S.uhClick].filter((c) => ms >= c).length,
    closed: ms >= S.close,
    length: Math.round((DURATION - easeInOut(clamp((ms - S.close) / CLOSE_MS, 0, 1)) * (DURATION - EDL.duration)) * 10) / 10,
    selected,
    chip: clip || ms < S.chip ? "hidden" : ms >= S.chipClick - 60 ? "pressed" : "shown",
    clip,
    playing: ms >= S.play && t < PLAY_END,
    active: page >= 0 ? (activeWordAt(PAGES[page], t)?.id ?? null) : null,
    cursor: ms >= S.cursorIn && ms < S.cursorOut,
    cursorAt,
    cursorMs,
    pressed: CLICKS.some((c) => ms >= c - 70 && ms < c + 90) || (ms >= S.sel && ms < selEnd + 60),
    clicks: past.length,
    ring: past.length > 0 && ms - past[past.length - 1] < 450,
  };
}

const sameFrame = (a: Frame, b: Frame) => (Object.keys(a) as (keyof Frame)[]).every((k) => a[k] === b[k]);

/** Where the playhead sits on the edited timeline (0 to 1 of the original length), and the clip's seek bar. */
function playheadAt(ms: number) {
  if (ms < S.clip || ms >= S.reset) return { x: 0, seek: 0 };
  const t = clipTimeAt(ms);
  return { x: sourceToEdited(EDL, editedToSource(CLIP_EDL, t)) / DURATION, seek: t / CLIP_EDL.duration };
}
const STILL = frameAt(STILL_MS);
const STILL_HEAD = playheadAt(STILL_MS);

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}
const useReducedMotion = () =>
  useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);

/**
 * A scripted miniature of the editor for the landing page: the transcript
 * arrives, the fillers are cut, the timeline closes up, and a passage becomes a
 * captioned 9:16 clip. The captions are drawn by the real caption painter.
 * Loops while on screen; with reduced motion it is a single still frame.
 */
export function EditorDemo() {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(STILL);
  const [layout, setLayout] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targets = useRef(new Map<string, HTMLElement>());
  const msRef = useRef(STILL_MS);
  const drawn = useRef("");
  const family = useRef<string | null>(null);
  const placedLayout = useRef(layout);

  /** Draws everything that moves continuously: the playhead, the seek bar and the captions. */
  const paint = (ms: number) => {
    msRef.current = ms;
    const { x, seek } = playheadAt(ms);
    if (headRef.current) headRef.current.style.transform = `translateX(${x * 100}%)`;
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${x})`;
    if (seekRef.current) seekRef.current.style.transform = `scaleX(${seek})`;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const t = ms >= S.clip && ms < S.reset ? clipTimeAt(ms) : -1;
    const key = `${t}|${canvas.width}`;
    if (key === drawn.current) return;
    drawn.current = key;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    family.current ??= captionFontFamily();
    if (t >= 0) paintCaptions(ctx, canvas.width, canvas.height, PAGES, t, DEFAULT_CAPTIONS, family.current);
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;

  const show = (ms: number) => {
    const next = frameAt(ms);
    setFrame((f) => (sameFrame(f, next) ? f : next));
    paintRef.current(ms);
  };
  const showRef = useRef(show);
  showRef.current = show;

  // The loop runs only while the demo is on screen; rAF also stops in a hidden tab.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (reduced) {
      showRef.current(STILL_MS);
      return;
    }
    // Start from the hidden reset point, so the first pass begins with the editor appearing.
    let t = S.reset;
    let raf = 0;
    let last = 0;
    showRef.current(t);
    const tick = (now: number) => {
      t = (t + (last ? Math.min(now - last, 50) : 0)) % S.loop;
      last = now;
      showRef.current(t);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !raf) {
          last = 0;
          raf = requestAnimationFrame(tick);
        } else if (!entry.isIntersecting && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0.25 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // Keep the caption canvas sharp at whatever size the stage is, and redraw once the caption font is in.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!stage || !canvas || !root) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.min(1080, Math.round(stage.clientWidth * dpr));
      canvas.height = Math.round((canvas.width * 16) / 9);
      drawn.current = "";
      paintRef.current(msRef.current);
    });
    ro.observe(stage);
    const layoutRo = new ResizeObserver(() => setLayout((n) => n + 1));
    layoutRo.observe(root);
    void ensureCaptionFonts(captionFontFamily()).then(() => {
      drawn.current = "";
      paintRef.current(msRef.current);
    });
    return () => {
      ro.disconnect();
      layoutRo.disconnect();
    };
  }, []);

  // Move the cursor to its target. After a resize it jumps there instead of gliding.
  useLayoutEffect(() => {
    const el = cursorRef.current;
    const root = rootRef.current;
    const [key, edge] = frame.cursorAt.split(":");
    const target = targets.current.get(key);
    if (!el || !root || !target) return;
    const r = target.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    const x = edge === "start" ? r.left + 1 : edge === "end" ? r.right - 1 : r.left + r.width / 2;
    const y = r.top + r.height * 0.62;
    const instant = placedLayout.current !== layout;
    placedLayout.current = layout;
    el.style.setProperty("--ms", `${instant ? 0 : frame.cursorMs}ms`);
    el.style.transform = `translate(${x - o.left - root.clientLeft}px, ${y - o.top - root.clientTop}px)`;
  }, [frame.cursorAt, frame.cursorMs, layout]);

  const target = (key: string) => (el: HTMLElement | null) => {
    if (el) targets.current.set(key, el);
    else targets.current.delete(key);
  };

  const struck = new Set(FILLERS.slice(0, frame.struck));
  const selLast = SEL.start + frame.selected - 1;
  const isSelected = (i: number) => i >= SEL.start && i <= selLast;
  const removed = DURATION - EDL.duration;
  const clipFrom = sourceToEdited(EDL, CLIP.start);
  const clipSpan = sourceToEdited(EDL, CLIP.end) - clipFrom;

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label={`${APP_NAME} demo: the fillers "um" and "uh" are deleted from a transcript, the video shortens from ${formatDuration(DURATION)} to ${formatDuration(EDL.duration)}, and a highlighted passage becomes a vertical clip with word-by-word captions.`}
      data-out={frame.out || undefined}
      data-reset={frame.reset || undefined}
      className="ed-root relative flex select-none flex-col overflow-hidden rounded-2xl border border-border bg-bg text-fg shadow-[0_24px_80px_-32px_rgba(124,92,255,0.35)] md:aspect-[16/10] lg:aspect-video"
    >
      <div aria-hidden className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border bg-panel px-3 py-2 sm:px-4">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-accent text-[10px] font-bold text-white">
              {APP_NAME.charAt(0)}
            </span>
            {APP_NAME}
          </span>
          <span className="flex min-w-0 items-center gap-3 text-xs text-muted">
            <span className="truncate text-fg">interview.mp4</span>
            <span className="hidden sm:inline">1920x1080</span>
          </span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Video */}
          <div className="ed-panel flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
            <div className="relative aspect-[4/3] bg-black md:aspect-auto md:min-h-0 md:flex-1">
              <Scene className="ed-fade absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" shown={!frame.clip} />
              <div className="absolute inset-2 grid place-items-center">
                <div
                  ref={stageRef}
                  data-shown={frame.clip}
                  className="ed-stage relative aspect-[9/16] h-full overflow-hidden rounded-md bg-black"
                >
                  <Scene slice className="absolute inset-0 h-full w-full" />
                  <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-border bg-panel px-3 py-2 sm:px-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-white">
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
                  {frame.playing ? (
                    <path d="M3 2h2v8H3zM7 2h2v8H7z" />
                  ) : (
                    <path d="M3.5 1.8v8.4a.5.5 0 0 0 .76.43l6.9-4.2a.5.5 0 0 0 0-.86l-6.9-4.2a.5.5 0 0 0-.76.43Z" />
                  )}
                </svg>
              </span>
              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-panel-2">
                <div
                  ref={seekRef}
                  className="absolute inset-0 origin-left rounded-full bg-accent"
                  style={{ transform: `scaleX(${STILL_HEAD.seek})` }}
                />
              </div>
            </div>
          </div>

          {/* Transcript */}
          <div className="ed-panel flex min-h-0 flex-col bg-panel [--d:60ms]">
            <div className="flex items-center justify-between border-b border-border pr-4">
              <div className="flex px-2 text-sm font-medium">
                {/* Making the clip switches to the Clips tab, as it would after you pick one in the editor. */}
                <span className={`ed-tab relative px-2.5 py-2.5 ${frame.clip ? "text-muted" : ""}`}>
                  Transcript
                  <span data-shown={!frame.clip} className="ed-fade absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent" />
                </span>
                <span className={`ed-tab relative flex items-center gap-1.5 px-2.5 py-2.5 ${frame.clip ? "" : "text-muted"}`}>
                  Clips
                  {frame.clip && (
                    <span className="badge-pop rounded-full bg-accent/25 px-1.5 text-[11px] tabular-nums text-accent-2">1</span>
                  )}
                  <span data-shown={frame.clip} className="ed-fade absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent" />
                </span>
              </div>
              <span data-shown={!frame.clip} className="ed-fade text-xs text-muted">
                {WORDS.length} words
              </span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden pb-6">
              <div data-shown={!frame.clip} className="ed-fade grid grid-cols-[3.5rem_1fr] gap-3 px-5 pt-5">
                <span className="pt-0.5 text-xs tabular-nums text-muted">0:00</span>
                <div>
                  <p className="text-[15px] leading-7 lg:text-base lg:leading-8">
                    {frame.caret && frame.typed === 0 && <span className="ed-caret" />}
                    {WORDS.map((w, i) => (
                      <Fragment key={w.id}>
                        <span
                          ref={target(w.id)}
                          data-typed={i < frame.typed}
                          data-cut={struck.has(i)}
                          className={`ed-word rounded-[3px] ${
                            frame.active === w.id ? "bg-accent text-white" : isSelected(i) ? "bg-accent/30" : ""
                          }`}
                        >
                          {w.text}
                        </span>
                        {frame.caret && i === frame.typed - 1 && <span className="ed-caret" />}
                        {i < WORDS.length - 1 && (
                          <span className={isSelected(i) && i < selLast ? "bg-accent/30" : undefined}> </span>
                        )}
                      </Fragment>
                    ))}
                  </p>
                  <div className="mt-3">
                    <span
                      ref={target("chip")}
                      data-state={frame.chip}
                      className="ed-chip inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-panel-2 px-2.5 py-1.5 text-xs font-medium shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)]"
                    >
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
                        <path d="M7 6.5 9.5 8 7 9.5Z" />
                      </svg>
                      Make clip
                      <kbd className="rounded border border-border px-1 font-sans text-[10px] text-muted">C</kbd>
                    </span>
                  </div>
                </div>
              </div>
              <span ref={target("rest")} className="absolute bottom-6 right-10 h-px w-px" />
              <ClipsView shown={frame.clip} />
            </div>
          </div>
        </div>

        {/* Timeline: the lane is the original length; the track inside it shrinks to the edited length. */}
        <div className="ed-panel border-t border-border bg-panel px-3 py-2.5 [--d:120ms] sm:px-4 sm:py-3">
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <div className="relative mb-1 hidden h-3 text-[10px] tabular-nums text-muted sm:block">
                {[0, 2, 4, 6].map((s) => (
                  <span
                    key={s}
                    className="absolute top-0 leading-3"
                    style={{ left: `${(s / DURATION) * 100}%`, transform: s === 0 ? undefined : "translateX(-50%)" }}
                  >
                    {formatTime(s)}
                  </span>
                ))}
              </div>
              <div className="relative h-10 sm:h-12">
                <div data-shown={frame.closed} className="ed-fade absolute inset-0 rounded-lg border border-dashed border-border" />
                <div
                  className="ed-track absolute inset-y-0 left-0 overflow-hidden rounded-lg border border-border bg-panel-2"
                  style={{ width: `${((frame.closed ? EDL.duration : DURATION) / DURATION) * 100}%` }}
                />
                <div className="absolute inset-0 overflow-hidden rounded-lg">
                  <div
                    ref={fillRef}
                    className="absolute inset-0 origin-left bg-accent/20"
                    style={{ transform: `scaleX(${STILL_HEAD.x})` }}
                  />
                  {WORDS.map((w, i) => {
                    const span = w.end - w.start;
                    const at = frame.closed ? sourceToEdited(EDL, w.start) : w.start;
                    const h = 30 + Math.min(w.text.length, 7) * 3.5;
                    return (
                      <span
                        key={w.id}
                        data-cut={struck.has(i)}
                        data-gone={frame.closed && CUT.has(w.id)}
                        className="ed-seg"
                        style={{
                          top: `${50 - h / 2}%`,
                          bottom: `${50 - h / 2}%`,
                          width: `${(span / DURATION) * 100}%`,
                          transform: `translateX(${(at / span) * 100}%)`,
                        }}
                      />
                    );
                  })}
                  <div
                    data-shown={frame.clip}
                    className="ed-fade absolute bottom-0 left-0 h-1 bg-accent-2"
                    style={{ width: `${(clipSpan / DURATION) * 100}%`, transform: `translateX(${(clipFrom / clipSpan) * 100}%)` }}
                  />
                  {NOTCHES.map((m) => (
                    <div
                      key={m.at}
                      data-shown={frame.closed}
                      className="ed-fade absolute inset-0 [--d:320ms]"
                      style={{ transform: `translateX(${(m.at / DURATION) * 100}%)` }}
                    >
                      <div className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-bg" />
                      <div className="absolute left-0 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-b-full bg-red-400/80" />
                    </div>
                  ))}
                  <div ref={headRef} className="absolute inset-0" style={{ transform: `translateX(${STILL_HEAD.x * 100}%)` }}>
                    <div className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex w-12 flex-col items-end pb-0.5 sm:w-14 sm:pb-1">
              <span data-shown={frame.closed} className="ed-fade text-[11px] tabular-nums text-red-300/80 [--d:320ms]">
                −{formatDuration(removed)}
              </span>
              <span className="text-sm font-medium tabular-nums sm:text-base">{formatDuration(frame.length)}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={cursorRef}
        aria-hidden
        data-shown={frame.cursor}
        data-pressed={frame.pressed}
        className="ed-cursor"
      >
        {frame.ring && <span key={frame.clicks} className="ed-ring" />}
        <svg viewBox="0 0 16 20" className="ed-cursor-icon h-5 w-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <path
            d="M1.5 1.5v14.2l3.6-3.4 2.4 5.6 2.6-1.1-2.4-5.5h5Z"
            fill="#fff"
            stroke="#0b0b0f"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

/** The Clips tab with the new clip selected: its row, as the editor lists it, and the top of its caption settings. */
function ClipsView({ shown }: { shown: boolean }) {
  return (
    <div data-shown={shown} className="ed-fade absolute inset-0 flex flex-col">
      <div className="px-4 pb-1 pt-3 text-xs text-muted">1 clip</div>
      <div className="px-2 py-1">
        <div className="relative flex h-14 items-center gap-1 rounded-lg bg-panel-2 pr-1.5">
          <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
          <span className="grid h-full w-6 shrink-0 place-items-center text-muted">
            <svg viewBox="0 0 12 16" className="h-4 w-3" fill="currentColor">
              <circle cx="3.5" cy="3.5" r="1.2" />
              <circle cx="8.5" cy="3.5" r="1.2" />
              <circle cx="3.5" cy="8" r="1.2" />
              <circle cx="8.5" cy="8" r="1.2" />
              <circle cx="3.5" cy="12.5" r="1.2" />
              <circle cx="8.5" cy="12.5" r="1.2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{CLIP_NAME}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs tabular-nums text-muted">
              <span className="text-fg/80">{formatDuration(CLIP_EDL.duration)}</span>
              <span>·</span>
              <span>at {formatTime(CLIP_AT)}</span>
              {CLIP_CUT >= 0.05 && (
                <>
                  <span>·</span>
                  <span>−{formatDuration(CLIP_CUT)} cut</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-3 border-t border-border px-4 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Captions</span>
          <span className="flex h-5 w-9 items-center justify-end rounded-full bg-accent p-0.5">
            <span className="h-4 w-4 rounded-full bg-white" />
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-xs">
          {["Bold", "Clean", "Boxed"].map((name, i) => (
            <span
              key={name}
              className={`rounded-md border px-2 py-1.5 text-center ${i === 0 ? "border-accent bg-accent/15 text-fg" : "border-border text-muted"}`}
            >
              {name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {CAPTION_COLORS.map((c) => (
            <span
              key={c.value}
              className={`h-4 w-4 rounded-full ${c.value === DEFAULT_CAPTIONS.color ? "ring-2 ring-white/80 ring-offset-2 ring-offset-panel" : ""}`}
              style={{ background: c.value }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
