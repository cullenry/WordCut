"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { editedCuts } from "@/lib/edl/edl";
import { sourceToEdited } from "@/lib/edl/time";
import { formatDuration, formatTime } from "@/lib/format";
import { timelineTicks } from "@/lib/timeline";
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

  const clips = useEditorStore((s) => s.clips);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  // Each clip as a band on the edited timeline; its ends may sit inside cuts, which maps to the join.
  const bands = useMemo(
    () => clips.map((c) => ({ id: c.id, name: c.name, from: sourceToEdited(edl, c.start), to: sourceToEdited(edl, c.end) })),
    [clips, edl],
  );

  const duration = edl.duration;
  const edited = sourceToEdited(edl, currentTime);

  // One label per ~64px of track, on whole seconds.
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [duration === 0]);
  const ticks = useMemo(() => timelineTicks(duration, Math.max(2, Math.floor(width / 64))), [duration, width]);

  function seekFromPointer(clientX: number) {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    seekEdited(ratio * duration);
  }

  if (duration === 0 && edl.sourceDuration > 0) {
    return (
      <div className="px-4 py-3">
        <div className="grid h-[4.75rem] place-items-center rounded-field border border-dashed border-ink/25 text-xs text-ink-2">
          Everything is cut. Undo or click a struck-through word to bring it back.
        </div>
      </div>
    );
  }

  const pct = duration > 0 ? (edited / duration) * 100 : 0;

  return (
    <div className="px-4 py-3">
      <div className="relative mb-1 h-3 font-label text-[10px] text-ink-2" aria-hidden>
        {ticks.map((t) => {
          const at = (t / duration) * 100;
          // Keep the first and last labels inside the track instead of centring them on the edge.
          const shift = at < 3 ? "0%" : at > 97 ? "-100%" : "-50%";
          return (
            <span key={t} className="absolute top-0 leading-3" style={{ left: `${at}%`, transform: `translateX(${shift})` }}>
              {formatTime(t)}
            </span>
          );
        })}
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
        className="relative h-14 cursor-pointer touch-none overflow-hidden rounded-field border border-rule"
      >
        <div className="absolute inset-y-0 left-0 bg-ink/[0.07]" style={{ width: `${pct}%` }} />
        {marks.map((m, i) => (
          <div
            key={i}
            title={`Cut ${formatDuration(m.removed)}`}
            className="absolute inset-y-0 w-2 -translate-x-1/2"
            style={{ left: `${(m.at / duration) * 100}%` }}
          >
            <div className="absolute inset-y-2 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-cut" />
          </div>
        ))}
        {review.map((m) => (
          <div
            key={m.key}
            title={m.label}
            className={`pointer-events-none absolute min-w-[3px] ${
              m.kind === "silence"
                ? `inset-y-0 border-x ${m.included ? "border-mark bg-mark/35" : "border-mark/40 bg-mark/10"}`
                : `bottom-0 h-1/3 ${m.included ? "bg-mark" : "bg-mark/30"}`
            }`}
            style={{ left: `${(m.from / duration) * 100}%`, width: `${((m.to - m.from) / duration) * 100}%` }}
          />
        ))}
        {bands.map((b) => (
          <div
            key={b.id}
            title={b.name}
            className={`pointer-events-none absolute bottom-0 h-1 min-w-[3px] ${b.id === selectedClipId ? "bg-ink" : "bg-ink/35"}`}
            style={{ left: `${(b.from / duration) * 100}%`, width: `${((b.to - b.from) / duration) * 100}%` }}
          />
        ))}
        <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
