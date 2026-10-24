"use client";

import { useMemo, useState } from "react";
import { buildEdl, editedCuts } from "@/lib/edl/edl";
import { sourceToEdited } from "@/lib/edl/time";
import { formatDuration } from "@/lib/format";
import { findFillers, normalizeWord } from "@/lib/transcript/fillers";
import { CutWord } from "./CutWord";
import { DEMO_DURATION, DEMO_LINE, timecode, toWords } from "./lines";
import { Scene } from "./Scene";

/** What the demo's screen shows: the drawn placeholder frame, or a real screen recording from public/. */
export type DemoMediaOption = { kind: "placeholder" } | { kind: "video" | "image"; src: string; alt: string };

const WORDS = toWords(DEMO_LINE, "d");
const NONE: ReadonlySet<string> = new Set();

/**
 * A live mini-editor. Clicking a word cuts it with the editor's own EDL code:
 * the text closes up, the timeline track shortens and the duration counts down.
 * Clicking the red notch a cut leaves brings the word back.
 */
export function PlayableDemo({ media }: { media: DemoMediaOption }) {
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(NONE);
  const edl = useMemo(() => buildEdl(WORDS, deleted, DEMO_DURATION), [deleted]);
  const fillers = useMemo(() => findFillers(WORDS, deleted, { phrases: true }), [deleted]);
  // The editor's detector stops at "you know"; spoken as "You know what," the "what" is filler too.
  const fillerIds = useMemo(
    () =>
      fillers.flatMap((f) => {
        const next = WORDS[f.endIndex + 1];
        const what = f.text.toLowerCase() === "you know" && next && !deleted.has(next.id) && normalizeWord(next.text) === "what";
        return what ? [...f.ids, next.id] : f.ids;
      }),
    [fillers, deleted],
  );
  const notches = useMemo(() => editedCuts(edl), [edl]);
  const removed = DEMO_DURATION - edl.duration;

  // A run of cut words closes up to one notch, so restoring any of it restores the run, as in the editor.
  const toggle = (index: number) =>
    setDeleted((d) => {
      const next = new Set(d);
      if (!d.has(WORDS[index].id)) return next.add(WORDS[index].id);
      for (let i = index; i >= 0 && d.has(WORDS[i].id); i--) next.delete(WORDS[i].id);
      for (let i = index + 1; i < WORDS.length && d.has(WORDS[i].id); i++) next.delete(WORDS[i].id);
      return next;
    });

  return (
    <div className="rounded-3xl bg-paper-2">
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="p-3 sm:p-5">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#0f0e17]">
            {media.kind === "video" ? (
              <video src={media.src} className="h-full w-full object-cover" autoPlay muted loop playsInline aria-label={media.alt} />
            ) : media.kind === "image" ? (
              // A plain img, so an animated GIF isn't re-encoded by next/image.
              <img src={media.src} alt={media.alt} className="h-full w-full object-cover" />
            ) : (
              <Scene className="h-full w-full" slice />
            )}
            <span className="absolute bottom-2 left-2 rounded-[3px] bg-black/55 px-1.5 py-0.5 font-label text-[11px] tabular-nums text-white">
              {timecode(edl.duration)}
            </span>
          </div>
          <p className="mt-3 flex justify-between font-label text-[11px] uppercase tracking-[0.12em] text-ink-2">
            <span>take-02.mp4</span>
            <span>1920x1080</span>
          </p>
        </div>

        <div className="px-5 pb-5 sm:px-8 sm:pb-8 lg:p-10 lg:pl-5">
          <p
            aria-label="Transcript. Each word is a button: press it to cut the word, press it again to restore it."
            className="text-[1.35rem] font-medium leading-[1.6] tracking-[-0.01em] sm:text-[1.6rem]"
          >
            {WORDS.map((w, i) => (
              <CutWord
                key={w.id}
                text={w.text}
                space={i < WORDS.length - 1}
                cut={deleted.has(w.id)}
                onToggle={() => toggle(i)}
              />
            ))}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-5 pb-5 sm:px-8 sm:pb-7 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex items-baseline gap-3 lg:w-48" aria-live="polite">
          <span className="font-label text-4xl tabular-nums tracking-[-0.02em]">{timecode(edl.duration)}</span>
          <span data-shown={removed > 0} className="pd-fade font-label text-sm tabular-nums text-cut">
            −{formatDuration(removed)}
          </span>
        </div>

        {/* The lane is the original take; the track inside it shrinks to the edited length. */}
        <div className="relative h-11 w-full min-w-0 lg:w-auto lg:flex-1" aria-hidden>
          <div data-shown={removed > 0} className="pd-fade absolute inset-0 rounded-lg bg-ink/[0.05]" />
          <div
            className="pd-track absolute inset-y-0 left-0 rounded-lg bg-ink/[0.09]"
            style={{ width: `${(edl.duration / DEMO_DURATION) * 100}%` }}
          />
          <div className="absolute inset-0 overflow-hidden rounded-lg">
            {WORDS.map((w) => {
              const span = w.end - w.start;
              const gone = deleted.has(w.id);
              const h = 30 + Math.min(w.text.length, 8) * 4;
              return (
                <span
                  key={w.id}
                  data-cut={gone}
                  className="pd-seg"
                  style={{
                    top: `${50 - h / 2}%`,
                    bottom: `${50 - h / 2}%`,
                    width: `${(span / DEMO_DURATION) * 100}%`,
                    transform: `translateX(${((gone ? w.start : sourceToEdited(edl, w.start)) / span) * 100}%)`,
                  }}
                />
              );
            })}
            {notches.map((m, i) => (
              <span
                key={i}
                className="pd-notch absolute inset-0"
                style={{ transform: `translateX(${(m.at / DEMO_DURATION) * 100}%)` }}
              >
                <span className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-cut" />
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={fillers.length === 0}
            onClick={() => setDeleted((d) => new Set([...d, ...fillerIds]))}
            className="press flex-1 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-cut disabled:pointer-events-none disabled:opacity-35 lg:flex-none"
          >
            Cut the fillers
          </button>
          <button
            type="button"
            disabled={deleted.size === 0}
            onClick={() => setDeleted(NONE)}
            className="press flex-1 rounded-full bg-ink/[0.07] px-4 py-2 text-sm font-medium transition-colors hover:bg-ink/[0.12] disabled:pointer-events-none disabled:opacity-35 lg:flex-none"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
