"use client";

import { useEffect } from "react";
import { outlineButton } from "@/components/ui/buttons";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
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
      <header className="flex items-center justify-between gap-4 border-b border-rule px-4 py-2">
        <Logo />
        <div className="flex min-w-0 items-center gap-4 text-xs text-ink-2">
          {source && (
            <>
              <span className="min-w-0 max-w-xs truncate text-ink">{source.file.name}</span>
              <span className="font-label text-[11px]">
                {source.meta.width}x{source.meta.height} · {formatTime(source.meta.duration)} ·{" "}
                {formatBytes(source.file.size)}
              </span>
              <button onClick={clearSource} className={`${outlineButton} shrink-0`}>
                Close video
              </button>
            </>
          )}
          <ThemeToggle fallback="dark" size="h-7 w-7" />
        </div>
      </header>
      <BrowserSupportBanner />

      {!source ? (
        <DropZone />
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
            <section className="min-h-0 border-b border-rule md:border-b-0 md:border-r">
              <VideoPreview />
            </section>
            <section className="min-h-0">
              <SidePanel />
            </section>
          </div>
          <footer className="border-t border-rule">
            <Timeline />
          </footer>
          <ExportDialog />
          <ExportPill />
        </>
      )}
    </div>
  );
}
