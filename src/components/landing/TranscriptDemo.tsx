"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildEdl } from "@/lib/edl/edl";
import { sourceToEdited } from "@/lib/edl/time";
import { formatDuration } from "@/lib/format";
import { findFillers } from "@/lib/transcript/fillers";
import type { Word } from "@/lib/transcript/types";

/** A short clip's transcript, timed like a real one. */
const LINE: [string, number, number][] = [
  ["So,", 0.2, 0.42],
  ["um,", 0.55, 0.95],
  ["here's", 1.2, 1.48],
  ["the", 1.5, 1.6],
  ["trick.", 1.62, 1.98],
  ["You", 2.4, 2.55],
  ["record", 2.58, 2.95],
  ["way", 2.98, 3.15],
  ["more", 3.18, 3.4],
  ["than", 3.42, 3.52],
  ["you", 3.54, 3.64],
  ["need,", 3.66, 3.98],
  ["uh,", 4.3, 4.8],
  ["then", 5.05, 5.24],
  ["you", 5.26, 5.36],
  ["delete", 5.4, 5.78],
  ["the", 5.8, 5.88],
  ["words", 5.9, 6.22],
  ["you", 6.24, 6.32],
  ["don't", 6.34, 6.58],
  ["want.", 6.6, 7.05],
];
const DURATION = 7.4;
const WORDS: Word[] = LINE.map(([text, start, end], i) => ({ id: `w${i}`, text, start, end, confidence: 1 }));
const NONE: ReadonlySet<string> = new Set();

/** The page's one orchestrated moment: shortly after load, the fillers are struck out, one by one. */
const AUTOPLAY_DELAY = 900;
const AUTOPLAY_STEP = 550;

/**
 * A live miniature of the editor. Clicking a word cuts it, using the same EDL
 * code the editor uses, and the edited timeline closes up around the gap.
 */
export function TranscriptDemo() {
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(NONE);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const edl = useMemo(() => buildEdl(WORDS, deleted, DURATION), [deleted]);
  const fillers = useMemo(() => findFillers(WORDS, deleted), [deleted]);

  const stopAutoplay = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timers.current = findFillers(WORDS, NONE).map((f, i) =>
      setTimeout(
        () => setDeleted((d) => new Set([...d, ...f.ids])),
        AUTOPLAY_DELAY + i * AUTOPLAY_STEP,
      ),
    );
    return stopAutoplay;
  }, []);

  const toggle = (id: string) => {
    stopAutoplay();
    setDeleted((d) => {
      const next = new Set(d);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const saved = DURATION - edl.duration;

  return (
    <div className="rounded-2xl border border-border bg-panel shadow-[0_24px_80px_-32px_rgba(124,92,255,0.35)]">
      <div className="grid grid-cols-[2.75rem_1fr] gap-x-3 px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
        <span className="pt-1.5 text-xs tabular-nums text-muted">0:00</span>
        <p className="font-serif text-[1.3rem] leading-[1.75] text-fg sm:text-[1.45rem]">
          {WORDS.map((w, i) => (
            <span key={w.id}>
              <button
                type="button"
                aria-pressed={deleted.has(w.id)}
                title={deleted.has(w.id) ? "Cut. Click to restore." : "Click to cut"}
                onClick={() => toggle(w.id)}
                className="demo-word"
              >
                {w.text}
              </button>
              {i < WORDS.length - 1 && " "}
            </span>
          ))}
        </p>
      </div>

      <div className="border-t border-border px-5 py-5 sm:px-7">
        <Track label="Original" length={DURATION} edl={edl} deleted={deleted} edited={false} />
        <Track label="Edited" length={edl.duration} edl={edl} deleted={deleted} edited />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={fillers.length === 0}
            onClick={() => {
              stopAutoplay();
              setDeleted((d) => new Set([...d, ...fillers.flatMap((f) => f.ids)]));
            }}
            className="press rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-sm hover:border-accent/50 disabled:pointer-events-none disabled:opacity-40"
          >
            Remove fillers
          </button>
          <button
            type="button"
            disabled={deleted.size === 0}
            onClick={() => {
              stopAutoplay();
              setDeleted(NONE);
            }}
            className="press rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          >
            Restore all
          </button>
          <p className="ml-auto text-sm text-muted" aria-live="polite">
            {saved > 0.05 ? (
              <>
                <span className="tabular-nums text-fg">{formatDuration(saved)}</span> cut
              </>
            ) : (
              "Click any word to cut it"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * One tick per word, sized by how long it is spoken. On the edited track the
 * kept words slide left to where they now play, and cut words fade out in place.
 */
function Track({
  label,
  length,
  edl,
  deleted,
  edited,
}: {
  label: string;
  length: number;
  edl: ReturnType<typeof buildEdl>;
  deleted: ReadonlySet<string>;
  edited: boolean;
}) {
  return (
    <div className="grid grid-cols-[4.25rem_1fr_3rem] items-center gap-3 py-1.5 text-xs">
      <span className="text-muted">{label}</span>
      <div className="relative h-3" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {WORDS.map((w) => {
          const cut = deleted.has(w.id);
          const span = w.end - w.start;
          const at = edited ? sourceToEdited(edl, w.start) : w.start;
          return (
            <span
              key={w.id}
              className={`demo-tick ${cut ? (edited ? "is-gone" : "is-cut") : ""}`}
              style={{
                width: `${(span / DURATION) * 100}%`,
                transform: `translateX(${(at / span) * 100}%)`,
              }}
            />
          );
        })}
      </div>
      <span className="text-right tabular-nums text-muted">{formatDuration(length)}</span>
    </div>
  );
}
