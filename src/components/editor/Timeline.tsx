"use client";

import { useMemo, useRef } from "react";
import { editedCuts } from "@/lib/edl/edl";
import { sourceToEdited } from "@/lib/edl/time";
import { formatDuration, formatTime } from "@/lib/format";
import { useEditorStore } from "@/store/editor-store";

/** The edited video laid end to end; each cut is a gap in the track. */
export function Timeline() {
  const edl = useEditorStore((s) => s.edl)!;
  const currentTime = useEditorStore((s) => s.currentTime);
  const seekEdited = useEditorStore((s) => s.seekEdited);
  const trackRef = useRef<HTMLDivElement>(null);
  const marks = useMemo(() => editedCuts(edl), [edl]);
  const cleanup = useEditorStore((s) => s.cleanup);
  // Where the open cleanup review would act, on the edited timeline.
  const review = useMemo(() => {
    if (!cleanup) return [];
    return [
      ...cleanup.plan.silences.map((s) => ({
        kind: "silence" as const,
        key: s.key,
        included: s.included,
        from: sourceToEdited(edl, s.cutStart),
        to: sourceToEdited(edl, s.cutEnd),
        label: `Pause ${formatDuration(s.pause)} \u2192 ${formatDuration(s.keep)}`,
      })),
      ...cleanup.plan.fillers.map((f) => ({
        kind: "filler" as const,
        key: f.key,
        included: f.included,
        from: sourceToEdited(edl, f.start),
        to: sourceToEdited(edl, f.end),
        label: f.text,
      })),
    ];
  }, [cleanup, edl]);

  const duration = edl.duration;
  const edited = sourceToEdited(edl, currentTime);

  function seekFromPointer(clientX: number) {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    seekEdited(ratio * duration);
  }

  if (duration === 0 && edl.sourceDuration > 0) {
    return (
      <div className="px-4 py-3">
        <div className="grid h-[4.75rem] place-items-center rounded-lg border border-dashed border-border text-xs text-muted">
          Everything is cut. Undo or click a struck-through word to bring it back.
        </div>
      </div>
    );
  }

  const pct = duration > 0 ? (edited / duration) * 100 : 0;
  const ticks = 10;

  return (
    <div className="px-4 py-3">
      <div className="mb-1 flex justify-between text-[10px] tabular-nums text-muted">
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <span key={i}>{formatTime((duration * i) / ticks)}</span>
        ))}
      </div>
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromPointer(e.clientX);
        }}
        className="relative h-14 cursor-pointer touch-none overflow-hidden rounded-lg border border-border bg-panel-2"
      >
        <div className="absolute inset-y-0 left-0 bg-accent/20" style={{ width: `${pct}%` }} />
        {marks.map((m, i) => (
          <div
            key={i}
            title={`Cut ${formatDuration(m.removed)}`}
            className="absolute inset-y-0 w-2 -translate-x-1/2"
            style={{ left: `${(m.at / duration) * 100}%` }}
          >
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-bg" />
            <div className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-b-full bg-red-400/80" />
          </div>
        ))}
        {review.map((m) => (
          <div
            key={m.key}
            title={m.label}
            className={`pointer-events-none absolute min-w-[3px] ${
              m.kind === "silence"
                ? `inset-y-0 border-x ${m.included ? "border-amber-400 bg-amber-400/35" : "border-amber-400/40 bg-amber-400/10"}`
                : `bottom-0 h-1/3 ${m.included ? "bg-amber-300" : "bg-amber-300/30"}`
            }`}
            style={{ left: `${(m.from / duration) * 100}%`, width: `${((m.to - m.from) / duration) * 100}%` }}
          />
        ))}
        <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
