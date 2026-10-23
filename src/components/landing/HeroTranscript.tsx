"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { isHesitation } from "@/lib/transcript/fillers";
import { CutWord } from "./CutWord";
import { HERO_LINE } from "./lines";

const FILLERS = HERO_LINE.flatMap(([text], i) => (isHesitation(text) ? [i] : []));
const SAVED = FILLERS.reduce((sum, i) => sum + HERO_LINE[i][2] - HERO_LINE[i][1], 0);
/** Scrolling this far, or pointing at the transcript, cuts the fillers. */
const SCROLL_TRIGGER = 24;
const STEP_MS = 360;

/** The hero's transcript line. The fillers cut themselves, one after the other, once the visitor scrolls or points at it. */
export function HeroTranscript() {
  const [cut, setCut] = useState(0);
  const timers = useRef<number[]>([]);
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    timers.current = FILLERS.map((_, i) => window.setTimeout(() => setCut(i + 1), i * STEP_MS));
  };
  const startRef = useRef(start);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > SCROLL_TRIGGER) startRef.current();
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const done = cut === FILLERS.length;

  return (
    <figure onPointerEnter={start} onPointerDown={start} className="border-t border-ink">
      <figcaption className="flex items-center justify-between gap-4 py-3 font-label text-xs uppercase tracking-[0.12em] text-ink-2">
        <span>Transcript</span>
        <span>interview.mp4</span>
      </figcaption>
      <div className="grid grid-cols-[3rem_1fr] gap-x-4 border-t border-rule pt-5 sm:grid-cols-[3.5rem_1fr]">
        <span className="pt-2 font-label text-xs tabular-nums text-ink-2">0:00</span>
        <p className="text-[clamp(1.45rem,2.5vw,2.05rem)] font-medium leading-[1.45] tracking-[-0.015em]">
          {HERO_LINE.map(([text, start, end], i) => {
            const filler = FILLERS.indexOf(i);
            const last = i === HERO_LINE.length - 1;
            return filler < 0 ? (
              <span key={i}>{last ? text : `${text} `}</span>
            ) : (
              <CutWord
                key={i}
                text={text}
                space={!last}
                cut={filler < cut}
                pageCut={{ id: `hero-${i}`, seconds: end - start }}
              />
            );
          })}
        </p>
        <p className="col-start-2 mt-5 font-label text-xs text-ink-2" aria-live="polite">
          {done ? (
            <>
              <span className="text-cut">{FILLERS.length} fillers cut.</span> {formatDuration(SAVED)} shorter, and nobody heard a
              thing.
            </>
          ) : (
            "Scroll down, or point at the transcript."
          )}
        </p>
      </div>
    </figure>
  );
}
