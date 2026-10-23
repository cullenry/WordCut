"use client";

import { useEffect } from "react";
import { Logo } from "@/components/ui/Logo";
import { sourceToEdited } from "@/lib/edl/time";
import { formatBytes, formatTime } from "@/lib/format";
import { flushPendingSave, selectPlayEdl, useEditorStore } from "@/store/editor-store";
import { BrowserSupportBanner } from "./BrowserSupportBanner";
import { DropZone } from "./DropZone";
import { ExportDialog } from "./export/ExportDialog";
import { ExportPill } from "./export/ExportPill";
import { Timeline } from "./Timeline";
import { SidePanel } from "./SidePanel";
import { VideoPreview } from "./VideoPreview";

const NON_TEXT_INPUTS = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "color", "file"]);

/** True where the browser's own undo and delete should win: text fields and editable content. */
function isTextEntry(t: HTMLElement): boolean {
  if (t.tagName === "INPUT") return !NON_TEXT_INPUTS.has((t as HTMLInputElement).type);
  return t.tagName === "TEXTAREA" || t.isContentEditable;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const state = useEditorStore.getState();
      if (!state.source) return;
      const mod = e.ctrlKey || e.metaKey;

      // A control that handled the key itself (a slider, a clip row) has the last word.
      if (e.defaultPrevented) return;

      // Editing works from anywhere except a text field, including after using the seek slider.
      if (!isTextEntry(t) && !e.altKey) {
        if (mod && e.code === "KeyZ") {
          e.preventDefault();
          if (e.shiftKey) state.redo();
          else state.undo();
          return;
        }
        if (mod && !e.shiftKey && e.code === "KeyY") {
          e.preventDefault();
          state.redo();
          return;
        }
        // The transcript selection only exists on screen in the transcript panel.
        if (!mod && !e.shiftKey && e.code === "KeyC" && state.panel === "transcript" && state.selection) {
          e.preventDefault();
          state.makeClip();
          return;
        }
        if (!mod && (e.code === "Delete" || e.code === "Backspace") && state.selection && state.panel === "transcript") {
          e.preventDefault();
          state.toggleSelection();
          return;
        }
      }

      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        state.togglePlay();
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        // In clip view this steps through the clip, not the whole video.
        const edl = selectPlayEdl(state);
        if (edl) state.seekPlayEdited(sourceToEdited(edl, state.currentTime) + (e.code === "ArrowLeft" ? -5 : 5));
      }
    };
    window.addEventListener("keydown", onKey);
    // IndexedDB writes are debounced; don't lose the last edit when the tab closes.
    window.addEventListener("pagehide", flushPendingSave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", flushPendingSave);
    };
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
      <BrowserSupportBanner />

      {!source ? (
        <DropZone />
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
            <section className="min-h-0 border-b border-border md:border-b-0 md:border-r">
              <VideoPreview />
            </section>
            <section className="min-h-0 bg-panel">
              <SidePanel />
            </section>
          </div>
          <footer className="border-t border-border bg-panel">
            <Timeline />
          </footer>
          <ExportDialog />
          <ExportPill />
        </>
      )}
    </div>
  );
}
