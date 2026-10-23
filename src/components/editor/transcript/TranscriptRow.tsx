"use client";

import { memo } from "react";
import { formatTime } from "@/lib/format";
import type { Paragraph } from "@/lib/transcript/paragraphs";
import type { SpeakerMark } from "@/lib/transcript/speakers";
import type { Word } from "@/lib/transcript/types";

interface RowProps {
  paragraph: Paragraph;
  index: number;
  top: number;
  words: Word[];
  mark: SpeakerMark;
  /** Index of the word currently being spoken, or -1 if it is not in this row. */
  active: number;
  /** Selected word-index range within this row, or -1/-1. */
  selStart: number;
  selEnd: number;
  observe: (el: HTMLElement | null) => void | (() => void);
  onSeek: (time: number) => void;
}

/**
 * One paragraph. Memoised on primitives so that moving the highlight or
 * extending a selection re-renders only the rows it touches.
 */
export const TranscriptRow = memo(function TranscriptRow({
  paragraph: p,
  index,
  top,
  words,
  mark,
  active,
  selStart,
  selEnd,
  observe,
  onSeek,
}: RowProps) {
  const last = p.endIndex - 1;
  const spans = [];
  for (let i = p.startIndex; i <= last; i++) {
    const selected = i >= selStart && i <= selEnd;
    const cls =
      i === active
        ? "bg-accent text-white"
        : selected
          ? "bg-accent/30"
          : "[@media(hover:hover)]:hover:bg-white/10";
    spans.push(
      <span key={words[i].id}>
        <span data-i={i} className={`cursor-pointer rounded-[3px] ${cls}`}>
          {words[i].text}
        </span>
        {i < last && <span className={selected && i < selEnd ? "bg-accent/30" : undefined}> </span>}
      </span>,
    );
  }

  return (
    <div
      ref={observe}
      data-row={index}
      className="absolute inset-x-0 grid grid-cols-[3.5rem_1fr] gap-3 px-5 pb-5"
      style={{ top }}
    >
      <button
        onClick={() => onSeek(p.start)}
        className="self-start pt-0.5 text-left text-xs tabular-nums text-muted hover:text-fg"
        tabIndex={-1}
      >
        {formatTime(p.start)}
      </button>
      <div>
        {mark && (
          <div
            className={`mb-1 select-none text-xs font-medium ${mark.kind === "speaker" ? "text-accent-2" : "text-muted"}`}
            title={
              mark.kind === "change"
                ? "Speaker labels aren't matched across the parts of a long video, so only the change is shown."
                : undefined
            }
          >
            {mark.kind === "speaker" ? `Speaker ${mark.speaker + 1}` : "Speaker change"}
          </div>
        )}
        <p className="select-none text-[15px] leading-7">{spans}</p>
      </div>
    </div>
  );
});
