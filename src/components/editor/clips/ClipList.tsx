"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clipEdl } from "@/lib/clips/range";
import { MAX_CLIP_NAME, type Clip } from "@/lib/clips/types";
import { sourceToEdited } from "@/lib/edl/time";
import { formatDuration, formatTime } from "@/lib/format";
import { useEditorStore } from "@/store/editor-store";

const ROW_H = 56;
const GAP = 4;
const PITCH = ROW_H + GAP;

interface Drag {
  from: number;
  startY: number;
  dy: number;
  over: number;
}

/** The clips as a reorderable list: click to select, double-click or F2 to rename, drag the grip or Alt+Arrow to reorder. */
export function ClipList() {
  const clips = useEditorStore((s) => s.clips);
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const edl = useEditorStore((s) => s.edl)!;
  const { selectClip, deleteClip, moveClip } = useEditorStore.getState();
  const listRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // Each clip's edited length and where it sits on the edited timeline.
  const info = useMemo(
    () =>
      clips.map((c) => {
        const duration = clipEdl(edl, c.start, c.end).duration;
        return { duration, at: sourceToEdited(edl, c.start), cut: Math.max(0, c.end - c.start - duration) };
      }),
    [clips, edl],
  );

  const focusRow = (index: number) =>
    requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLElement>("[data-clip-row]")[index]?.focus());

  function onKeyDown(e: React.KeyboardEvent, clip: Clip, i: number) {
    if (renaming || e.ctrlKey || e.metaKey) return;
    if (e.code === "ArrowUp" || e.code === "ArrowDown") {
      const to = i + (e.code === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= clips.length) return;
      e.preventDefault();
      if (e.altKey) {
        moveClip(i, to);
        focusRow(to);
      } else {
        selectClip(clips[to].id);
        focusRow(to);
      }
    } else if (e.code === "Delete" || e.code === "Backspace") {
      e.preventDefault();
      deleteClip(clip.id);
      focusRow(Math.min(i, clips.length - 2));
    } else if (e.code === "F2") {
      e.preventDefault();
      setRenaming(clip.id);
    }
  }

  // --- Drag to reorder: rows slide aside as the grabbed one passes them; the move is one history step on release. ---
  function startDrag(e: React.PointerEvent, from: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    selectClip(clips[from].id);
    setDrag({ from, startY: e.clientY, dy: 0, over: from });
  }
  function moveDrag(e: React.PointerEvent) {
    setDrag((d) => {
      if (!d) return d;
      const dy = e.clientY - d.startY;
      const over = Math.min(clips.length - 1, Math.max(0, Math.round(d.from + dy / PITCH)));
      return { ...d, dy, over };
    });
  }
  function endDrag() {
    if (drag && drag.over !== drag.from) moveClip(drag.from, drag.over);
    setDrag(null);
  }

  const shiftOf = (i: number): number => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -PITCH;
    if (drag.from > drag.over && i >= drag.over && i < drag.from) return PITCH;
    return 0;
  };

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Clips"
      className="flex min-h-0 flex-col overflow-y-auto px-2 py-2"
      style={{ gap: GAP }}
    >
      {clips.map((clip, i) => {
        const selected = clip.id === selectedId;
        const dragging = drag?.from === i;
        const meta = info[i];
        return (
          <div
            key={clip.id}
            role="option"
            aria-selected={selected}
            data-clip-row
            tabIndex={selected || (!selectedId && i === 0) ? 0 : -1}
            onPointerDown={(e) => {
              if (e.button === 0 && !(e.target as HTMLElement).closest("[data-no-select]")) selectClip(clip.id);
            }}
            onKeyDown={(e) => onKeyDown(e, clip, i)}
            className={`group relative flex shrink-0 items-center gap-1 rounded-lg pr-1.5 outline-none focus-visible:ring-1 focus-visible:ring-accent-2 ${
              selected ? "bg-panel-2" : "hover:bg-panel-2/60"
            } ${dragging ? "z-10 shadow-lg shadow-black/50" : drag ? "clip-row-slide" : ""}`}
            style={{
              height: ROW_H,
              transform: `translateY(${dragging ? drag.dy : shiftOf(i)}px)`,
            }}
          >
            {selected && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
            <span
              data-no-select
              onPointerDown={(e) => startDrag(e, i)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => setDrag(null)}
              title="Drag to reorder (Alt+Up or Down)"
              className={`grid h-full w-6 shrink-0 touch-none place-items-center rounded-l-lg text-muted ${
                dragging ? "cursor-grabbing" : "cursor-grab hover:text-fg"
              }`}
            >
              <svg viewBox="0 0 12 16" className="h-4 w-3" fill="currentColor" aria-hidden>
                <circle cx="3.5" cy="3.5" r="1.2" />
                <circle cx="8.5" cy="3.5" r="1.2" />
                <circle cx="3.5" cy="8" r="1.2" />
                <circle cx="8.5" cy="8" r="1.2" />
                <circle cx="3.5" cy="12.5" r="1.2" />
                <circle cx="8.5" cy="12.5" r="1.2" />
              </svg>
            </span>

            <div className="min-w-0 flex-1">
              {renaming === clip.id ? (
                <RenameInput
                  clip={clip}
                  onDone={() => {
                    setRenaming(null);
                    focusRow(i);
                  }}
                />
              ) : (
                <div
                  onDoubleClick={() => setRenaming(clip.id)}
                  className="truncate text-sm font-medium"
                  title={clip.name}
                >
                  {clip.name}
                </div>
              )}
              <div className="mt-0.5 flex items-center gap-1.5 text-xs tabular-nums text-muted">
                {meta.duration === 0 ? (
                  <span className="text-amber-300">Everything is cut</span>
                ) : (
                  <>
                    <span className="text-fg/80">{formatDuration(meta.duration)}</span>
                    <span aria-hidden>·</span>
                    <span>at {formatTime(meta.at)}</span>
                    {meta.cut >= 0.05 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>−{formatDuration(meta.cut)} cut</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <div
              data-no-select
              className="flex shrink-0 items-center opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <RowButton label="Rename clip" onClick={() => setRenaming(clip.id)}>
                <path d="m10.5 3.5 2 2M3 13l.5-2.5 7-7 2 2-7 7L3 13Z" />
              </RowButton>
              <RowButton label="Delete clip" onClick={() => deleteClip(clip.id)}>
                <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />
              </RowButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      tabIndex={-1}
      className="press grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-fg"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function RenameInput({ clip, onDone }: { clip: Clip; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      defaultValue={clip.name}
      maxLength={MAX_CLIP_NAME}
      aria-label="Clip name"
      spellCheck={false}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.code === "Enter") e.currentTarget.blur();
        else if (e.code === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        if (!cancelled.current) useEditorStore.getState().renameClip(clip.id, e.currentTarget.value);
        onDone();
      }}
      className="w-full rounded border border-accent bg-bg px-1.5 py-0.5 text-sm font-medium outline-none"
    />
  );
}
