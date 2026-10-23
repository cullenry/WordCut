"use client";

import { useMemo, type ReactNode } from "react";
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
  const { undo, redo, toggleSelection } = useEditorStore.getState();

  const range = useMemo(() => selectionRange(selection, wordIndex), [selection, wordIndex]);
  const restoring = useMemo(() => allDeleted(words, deleted, range), [words, deleted, range]);

  return (
    <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
      <ToolButton label="Undo" shortcut={`${MOD}Z`} onClick={undo} disabled={!canUndo}>
        <path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a4 4 0 0 1 0 8H8" />
      </ToolButton>
      <ToolButton label="Redo" shortcut={`${MOD}Shift+Z`} onClick={redo} disabled={!canRedo}>
        <path d="m10.5 3.5 3 3-3 3M13.5 6.5h-7a4 4 0 0 0 0 8H8" />
      </ToolButton>
      <div className="mx-1.5 h-4 w-px bg-border" />
      <button
        onClick={toggleSelection}
        disabled={!range}
        title={range ? undefined : "Select words in the transcript to cut them"}
        className="press flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-panel-2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {restoring ? "Restore" : "Delete"}
        <kbd className="rounded border border-border px-1 font-sans text-[10px] text-muted">⌫</kbd>
      </button>
      {deleted.size > 0 && (
        <span className="ml-auto text-xs tabular-nums text-muted">
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
      className="press grid h-7 w-7 place-items-center rounded-md text-fg hover:bg-panel-2 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
