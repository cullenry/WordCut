"use client";

import { useEffect } from "react";
import { Logo } from "@/components/ui/Logo";
import { formatBytes, formatTime } from "@/lib/format";
import { useEditorStore } from "@/store/editor-store";
import { DropZone } from "./DropZone";
import { Timeline } from "./Timeline";
import { TranscriptPanel } from "./TranscriptPanel";
import { VideoPreview } from "./VideoPreview";

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      const { togglePlay, seek, currentTime, source } = useEditorStore.getState();
      if (!source) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") seek(currentTime - 5);
      else if (e.code === "ArrowRight") seek(currentTime + 5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function Editor() {
  const source = useEditorStore((s) => s.source);
  const clearSource = useEditorStore((s) => s.clearSource);
  useShortcuts();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-2.5">
        <Logo />
        {source && (
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="max-w-xs truncate text-fg">{source.file.name}</span>
            <span>
              {source.meta.width}x{source.meta.height} · {formatTime(source.meta.duration)} ·{" "}
              {formatBytes(source.file.size)}
            </span>
            <button
              onClick={clearSource}
              className="rounded-md border border-border px-2.5 py-1 hover:bg-panel-2"
            >
              Close video
            </button>
          </div>
        )}
      </header>

      {!source ? (
        <DropZone />
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
            <section className="min-h-0 border-b border-border md:border-b-0 md:border-r">
              <VideoPreview />
            </section>
            <section className="min-h-0 bg-panel">
              <TranscriptPanel />
            </section>
          </div>
          <footer className="border-t border-border bg-panel">
            <Timeline />
          </footer>
        </>
      )}
    </div>
  );
}
