"use client";

import { useRef } from "react";
import { formatTime } from "@/lib/format";
import { useEditorStore } from "@/store/editor-store";

export function Timeline() {
  const duration = useEditorStore((s) => s.source!.meta.duration);
  const currentTime = useEditorStore((s) => s.currentTime);
  const seek = useEditorStore((s) => s.seek);
  const trackRef = useRef<HTMLDivElement>(null);

  function seekFromPointer(clientX: number) {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    seek(ratio * duration);
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
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
        <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
