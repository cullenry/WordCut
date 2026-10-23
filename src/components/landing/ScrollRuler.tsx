"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { timecode } from "./lines";
import { usePageCuts } from "./pageCuts";

/** The page, read as a timeline, runs this long. Every word cut on it comes off the total. */
const PAGE_SECONDS = 150;

/**
 * A timeline ruler down the right edge. Scrolling moves its playhead and its
 * counter; every word cut on the page leaves a red notch at the point in the
 * scroll where that word sits in the middle of the screen.
 */
export function ScrollRuler() {
  const cuts = usePageCuts((s) => s.cuts);
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [height, setHeight] = useState(0);
  const [notches, setNotches] = useState<{ id: string; at: number }[]>([]);

  const total = useMemo(() => {
    let removed = 0;
    for (const c of cuts.values()) removed += c.seconds;
    return PAGE_SECONDS - removed;
  }, [cuts]);
  const totalRef = useRef(total);
  totalRef.current = total;

  // Where each cut falls on the ruler, recomputed when cuts change or the page reflows.
  useEffect(() => {
    const measure = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setHeight(trackRef.current?.clientHeight ?? 0);
      setNotches(
        [...cuts].map(([id, c]) => {
          const mid = c.el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2;
          return { id, at: Math.min(Math.max(mid / max, 0), 1) };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [cuts]);

  // The playhead follows the scroll directly, without re-rendering.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.min(Math.max(window.scrollY / max, 0), 1);
      const h = trackRef.current?.clientHeight ?? 0;
      if (headRef.current) headRef.current.style.transform = `translateY(${p * h}px)`;
      if (chipRef.current) chipRef.current.style.transform = `translateY(${p * h}px)`;
      if (timeRef.current) timeRef.current.textContent = timecode(p * totalRef.current);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [total]);

  const frame = "pointer-events-none fixed bottom-10 right-4 top-24 z-40 hidden w-14 lg:block";
  return (
    <>
      {/* Ticks and playhead invert against whatever scrolls behind them. Blending needs its own fixed layer. */}
      <div ref={trackRef} aria-hidden className={`${frame} text-white mix-blend-difference`}>
        <div className="absolute inset-y-0 right-0 w-px bg-current opacity-70" />
        <div className="ruler-ticks absolute inset-y-0 right-0 w-2 opacity-60" />
        <div className="ruler-ticks-major absolute inset-y-0 right-0 w-3.5 opacity-90" />
        <div ref={headRef} className="absolute inset-x-0 top-0">
          <div className="absolute right-0 h-px w-6 -translate-y-1/2 bg-current" />
        </div>
      </div>
      {/* The cut notches stay red, and the readouts sit on paper chips so they read over anything. */}
      <div aria-hidden className={frame}>
        <span className="absolute -bottom-6 right-0 rounded-[3px] bg-paper px-1 font-label text-[10px] tabular-nums text-ink-2">
          {timecode(total)}
        </span>
        <div ref={chipRef} className="absolute inset-x-0 top-0">
          <span
            ref={timeRef}
            className="absolute right-7 -translate-y-1/2 rounded-[3px] border border-rule bg-paper px-1 font-label text-[11px] font-medium tabular-nums text-ink"
          />
        </div>
        {notches.map((n) => (
          <span
            key={n.id}
            className="ruler-notch absolute right-0 h-0.5 w-4 -translate-y-1/2 bg-cut"
            style={{ top: n.at * height }}
          />
        ))}
      </div>
    </>
  );
}
