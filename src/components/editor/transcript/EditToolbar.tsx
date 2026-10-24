"use client";

import { useMemo, type ReactNode } from "react";
import { planClip } from "@/lib/clips/range";
import { MIN_CLIP_DURATION } from "@/lib/clips/types";
import { allDeleted } from "@/lib/edl/edits";
import { formatDuration } from "@/lib/format";
import { buildWordIndex, selectionRange } from "@/lib/transcript/selection";
import type { Transcript } from "@/lib/transcript/types";
import { useEditorStore } from "@/store/editor-store";

// Only rendered once a video is open, so this never runs on the server.
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** Undo, redo and cut, plus how much has been cut. */
export function EditToolbar({ transcript }: { transcript: Transcript }) {
  const { words } = transcript;
  const wordIndex = useMemo(() => buildWordIndex(words), [words]);
  const selection = useEditorStore((s) => s.selection);
  const deleted = useEditorStore((s) => s.deleted);
  const canUndo = useEditorStore((s) => s.history.past.length > 0);
  const canRedo = useEditorStore((s) => s.history.future.length > 0);
  const removed = useEditorStore((s) => (s.edl ? s.edl.sourceDuration - s.edl.duration : 0));
  const reviewing = useEditorStore((s) => s.cleanup !== null);
  const edl = useEditorStore((s) => s.edl);
  const { undo, redo, toggleSelection, openCleanup, closeCleanup, makeClip } = useEditorStore.getState();

  const range = useMemo(() => selectionRange(selection, wordIndex), [selection, wordIndex]);
  // What a clip from the selection would hold, after the cuts. Nothing left means no clip.
  const clipPlan = useMemo(() => (range && edl ? planClip(words, range, edl) : null), [words, range, edl]);
  const canClip = clipPlan !== null && clipPlan.duration >= MIN_CLIP_DURATION;
  const restoring = useMemo(() => allDeleted(words, deleted, range), [words, deleted, range]);

  return (
    <div className="flex items-center gap-1 border-b border-rule px-3 py-1.5">
      <ToolButton label="Undo" shortcut={`${MOD}Z`} onClick={undo} disabled={!canUndo}>
        <path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a4 4 0 0 1 0 8H8" />
      </ToolButton>
      <ToolButton label="Redo" shortcut={`${MOD}Shift+Z`} onClick={redo} disabled={!canRedo}>
        <path d="m10.5 3.5 3 3-3 3M13.5 6.5h-7a4 4 0 0 0 0 8H8" />
      </ToolButton>
      <div className="mx-1.5 h-4 w-px bg-rule" />
      <button
        onClick={toggleSelection}
        disabled={!range}
        title={range ? undefined : "Select words in the transcript to cut them"}
        className={`press flex items-center gap-2 rounded-full px-2.5 py-1 text-xs hover:bg-ink/[0.07] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${
          restoring ? "" : "text-cut-text"
        }`}
      >
        {restoring ? "Restore" : "Delete"}
        <kbd className="rounded-chip border border-rule px-1 font-label text-[10px] text-ink-2">⌫</kbd>
      </button>
      <button
        onClick={reviewing ? closeCleanup : openCleanup}
        aria-pressed={reviewing}
        title="Find fillers (um, uh) and long pauses, and review them before removing"
        className={`press flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs hover:bg-ink/[0.07] ${reviewing ? "bg-ink/10" : ""}`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.5 1.5M10.5 10.5 12 12M12 4l-1.5 1.5M5.5 10.5 4 12" />
        </svg>
        Clean up
      </button>
      <button
        onClick={makeClip}
        disabled={!canClip}
        title={
          !range
            ? "Select words in the transcript to make a clip"
            : canClip
              ? `Make a clip of ${formatDuration(clipPlan.duration)} from the selection`
              : "Everything in this selection is cut"
        }
        className="press flex items-center gap-2 rounded-full px-2.5 py-1 text-xs hover:bg-ink/[0.07] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
          <path d="M7 6.5 9.5 8 7 9.5Z" />
        </svg>
        Make clip
        <kbd className="rounded-chip border border-rule px-1 font-label text-[10px] text-ink-2">C</kbd>
      </button>
      {deleted.size > 0 && (
        <span className="ml-auto font-label text-[11px] text-ink-2">
          {deleted.size.toLocaleString()} {deleted.size === 1 ? "word" : "words"} cut · −{formatDuration(removed)}
        </span>
      )}
    </div>
  );
}

function ToolButton({
  label,
  shortcut,
  onClick,
  disabled,
  children,
}: {
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={`${label} (${shortcut})`}
      className="press grid h-7 w-7 place-items-center rounded-full text-ink hover:bg-ink/[0.07] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
