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
  /** Cut word ids; a new set on every edit, so rows re-render when cuts change. */
  deleted: ReadonlySet<string>;
  /** Fillers listed by an open cleanup review (word id -> will be removed), or null. */
  review: ReadonlyMap<string, boolean> | null;
  /** Paragraph start on the edited timeline. */
  time: number;
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
 * extending a selection re-renders only the rows it touches. Each run of cut
 * words is one <del>, so hovering any part of it shows what a click restores.
 */
export const TranscriptRow = memo(function TranscriptRow({
  paragraph: p,
  index,
  top,
  words,
  deleted,
  review,
  time,
  mark,
  active,
  selStart,
  selEnd,
  observe,
  onSeek,
}: RowProps) {
  const last = p.endIndex - 1;
  const isSelected = (i: number) => i >= selStart && i <= selEnd;
  // The space after word i, highlighted when the selection continues past it.
  const space = (i: number) =>
    i < last && (
      <span key={`${words[i].id}-sp`} className={isSelected(i) && i < selEnd ? "bg-accent/30" : undefined}>
        {" "}
      </span>
    );

  const spans = [];
  let allCut = true;
  for (let i = p.startIndex; i <= last; ) {
    if (deleted.has(words[i].id)) {
      let end = i;
      while (end < last && deleted.has(words[end + 1].id)) end++;
      const run = [];
      for (let k = i; k <= end; k++) {
        run.push(
          <span key={words[k].id} data-i={k} className={`rounded-[3px] ${isSelected(k) ? "bg-accent/30" : ""}`}>
            {words[k].text}
          </span>,
          k < end && space(k),
        );
      }
      spans.push(
        <del key={`${words[i].id}-cut`} title="Cut. Click to restore." className="cut">
          {run}
        </del>,
        space(end),
      );
      i = end + 1;
      continue;
    }
    allCut = false;
    const cls =
      i === active
        ? "bg-accent text-white"
        : isSelected(i)
          ? "bg-accent/30"
          : review?.has(words[i].id)
            ? review.get(words[i].id)
              ? "bg-amber-400/25 text-amber-100"
              : "underline decoration-amber-400/60 decoration-dotted underline-offset-4"
            : "[@media(hover:hover)]:hover:bg-white/10";
    spans.push(
      <span key={words[i].id} data-i={i} className={`cursor-pointer rounded-[3px] ${cls}`}>
        {words[i].text}
      </span>,
      space(i),
    );
    i++;
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
        className={`self-start pt-0.5 text-left text-xs tabular-nums text-muted hover:text-fg ${allCut ? "opacity-40" : ""}`}
        tabIndex={-1}
      >
        {formatTime(time)}
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
