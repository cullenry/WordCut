"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sourceToEdited } from "@/lib/edl/time";
import { findWordIndexAtTime } from "@/lib/transcript/lookup";
import { groupParagraphs, paragraphIndexOfWord } from "@/lib/transcript/paragraphs";
import {
  buildWordIndex,
  clipRange,
  collapsedSelection,
  extendSelection,
  selectedText,
  selectionRange,
} from "@/lib/transcript/selection";
import { isMultiChunk, speakerMarks } from "@/lib/transcript/speakers";
import type { Transcript } from "@/lib/transcript/types";
import { useEditorStore } from "@/store/editor-store";
import { TranscriptRow } from "./TranscriptRow";
import { useVirtualRows } from "./useVirtualRows";

/** Seeks land on frame boundaries, so count a time just before a word as inside it. */
const SEEK_TOLERANCE = 0.02;
/** The active word stays put while it is inside this band of the viewport (fractions of height). */
const BAND_TOP = 0.1;
const BAND_BOTTOM = 0.75;
/** Where the active word is placed when the view has to scroll. */
const SCROLL_TARGET = 0.3;
const EDGE_PX = 40;

const wordIndexOf = (target: EventTarget | null): number => {
  const el = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-i]");
  return el ? Number(el.dataset.i) : -1;
};

interface Drag {
  x: number;
  y: number;
}

/**
 * Virtualised, click-to-seek transcript. Words are never mutated; selection is
 * an anchor/focus pair of word ids in the store (native text selection is off).
 * Cut words stay in place, struck through; clicking one restores its run.
 */
export function TranscriptView({ transcript }: { transcript: Transcript }) {
  const { words } = transcript;
  const paragraphs = useMemo(() => groupParagraphs(words), [words]);
  const marks = useMemo(() => speakerMarks(paragraphs, isMultiChunk(transcript)), [paragraphs, transcript]);
  const wordIndex = useMemo(() => buildWordIndex(words), [words]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { range, version, offsets, totalHeight, observeRow, onScroll } = useVirtualRows(paragraphs, scrollRef);

  // Never highlight a cut word: just after a cut, the lookup can still land on it.
  const activeIndex = useEditorStore((s) => {
    const i = findWordIndexAtTime(words, s.currentTime, { toleranceSeconds: SEEK_TOLERANCE });
    return i >= 0 && s.deleted.has(words[i].id) ? -1 : i;
  });
  const playing = useEditorStore((s) => s.playing);
  const selection = useEditorStore((s) => s.selection);
  const deleted = useEditorStore((s) => s.deleted);
  const edl = useEditorStore((s) => s.edl);
  const selRange = useMemo(() => selectionRange(selection, wordIndex), [selection, wordIndex]);

  // --- Follow mode: auto-scroll with playback until the user scrolls away. ---
  const [following, setFollowing] = useState(true);
  const followRef = useRef(true);
  const setFollow = useCallback((on: boolean) => {
    followRef.current = on;
    setFollowing(on);
  }, []);
  const clickedRef = useRef(-1);

  useEffect(() => {
    if (playing) setFollow(true);
  }, [playing, setFollow]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || activeIndex < 0 || !followRef.current) return;
    // The word just clicked is already under the pointer; don't move it.
    if (activeIndex === clickedRef.current) return;
    clickedRef.current = -1;

    const viewport = el.clientHeight;
    const wordEl = el.querySelector<HTMLElement>(`[data-i="${activeIndex}"]`);
    if (!wordEl) {
      // Not rendered yet (far seek): jump near its paragraph, then refine once it renders.
      const row = paragraphIndexOfWord(paragraphs, activeIndex);
      if (row >= 0) el.scrollTop = offsets[row] - viewport * SCROLL_TARGET;
      return;
    }
    const box = el.getBoundingClientRect();
    const r = wordEl.getBoundingClientRect();
    if (r.top - box.top < viewport * BAND_TOP || r.bottom - box.top > viewport * BAND_BOTTOM) {
      el.scrollTop += r.top - box.top - viewport * SCROLL_TARGET;
    }
  }, [activeIndex, version, range, following, paragraphs, offsets]);

  // Manual scrolling (wheel, touch, scrollbar drag, scroll keys) switches follow off.
  // Scroll events themselves can't be used: our own scrolling fires them too.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const off = () => setFollow(false);
    const onPointerDown = (e: PointerEvent) => {
      if (e.target === el && e.offsetX >= el.clientWidth) off(); // scrollbar
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(e.code)) off();
    };
    el.addEventListener("wheel", off, { passive: true });
    el.addEventListener("touchmove", off, { passive: true });
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", off);
      el.removeEventListener("touchmove", off);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [setFollow]);

  // --- Pointer: click to seek, drag to select, shift-click to extend, click a cut word to restore. ---
  const dragRef = useRef<Drag | null>(null);
  const rafRef = useRef(0);
  /** A cut word pressed without shift: restored on release unless the press turns into a drag. */
  const restoreRef = useRef(-1);

  // On release, so a drag that starts on a cut word still selects instead.
  const releaseOn = useCallback(
    (i: number) => {
      const { selection: sel, restoreRunAt } = useEditorStore.getState();
      if (i >= 0 && sel?.anchor === words[i].id && sel.focus === words[i].id) restoreRunAt(i);
    },
    [words],
  );

  const seekToWord = useCallback(
    (i: number) => {
      clickedRef.current = i;
      setFollow(true);
      useEditorStore.getState().seek(words[i].start);
    },
    [words, setFollow],
  );

  const extendTo = useCallback(
    (x: number, y: number) => {
      const i = wordIndexOf(document.elementFromPoint(x, y));
      if (i < 0) return;
      const { selection: cur, setSelection } = useEditorStore.getState();
      if (cur?.focus === words[i].id) return;
      setSelection(extendSelection(cur, words[i].id));
    },
    [words],
  );

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    cancelAnimationFrame(rafRef.current);
  }, []);
  useEffect(() => stopDrag, [stopDrag]);

  // Scroll while a drag is held near the top or bottom edge.
  const autoscroll = useCallback(() => {
    const el = scrollRef.current;
    const drag = dragRef.current;
    if (!el || !drag) return;
    const box = el.getBoundingClientRect();
    let dy = 0;
    if (drag.y < box.top + EDGE_PX) dy = -Math.ceil((box.top + EDGE_PX - drag.y) / 4);
    else if (drag.y > box.bottom - EDGE_PX) dy = Math.ceil((drag.y - (box.bottom - EDGE_PX)) / 4);
    if (dy) {
      el.scrollTop += dy;
      extendTo(drag.x, drag.y);
    }
    rafRef.current = requestAnimationFrame(autoscroll);
  }, [extendTo]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const i = wordIndexOf(e.target);
    const { setSelection } = useEditorStore.getState();
    if (i < 0) {
      setSelection(null);
      return;
    }
    // Touch: a press may be the start of a scroll, so act on release instead.
    if (e.pointerType === "touch") {
      dragRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    e.preventDefault();
    const { selection: current, deleted: cut } = useEditorStore.getState();
    restoreRef.current = -1;
    if (e.shiftKey && current) {
      setSelection(extendSelection(current, words[i].id));
    } else if (cut.has(words[i].id)) {
      setSelection(collapsedSelection(words[i].id));
      restoreRef.current = i;
    } else {
      setSelection(collapsedSelection(words[i].id));
      seekToWord(i);
    }
    dragRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    rafRef.current = requestAnimationFrame(autoscroll);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerType === "touch") return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    extendTo(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag && e.pointerType === "touch") {
      const i = wordIndexOf(e.target);
      if (i >= 0 && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) {
        useEditorStore.getState().setSelection(collapsedSelection(words[i].id));
        if (useEditorStore.getState().deleted.has(words[i].id)) releaseOn(i);
        else seekToWord(i);
      }
    } else if (restoreRef.current >= 0) {
      releaseOn(restoreRef.current);
    }
    restoreRef.current = -1;
    stopDrag();
  };

  // Escape clears the selection; copy works even though native selection is off.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      const sel = useEditorStore.getState().selection;
      if (!sel) return;
      if (e.code === "Escape") useEditorStore.getState().setSelection(null);
      else if ((e.ctrlKey || e.metaKey) && e.code === "KeyC" && !window.getSelection()?.toString()) {
        const text = selectedText(words, selectionRange(sel, wordIndex));
        if (text) void navigator.clipboard?.writeText(text);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [words, wordIndex]);

  const seekTime = useCallback((t: number) => {
    setFollow(true);
    useEditorStore.getState().seek(t);
  }, [setFollow]);

  const rows = [];
  for (let i = range.start; i < range.end; i++) {
    const p = paragraphs[i];
    const sel = clipRange(selRange, p.startIndex, p.endIndex);
    rows.push(
      <TranscriptRow
        key={i}
        paragraph={p}
        index={i}
        top={offsets[i]}
        words={words}
        deleted={deleted}
        time={edl ? sourceToEdited(edl, p.start) : p.start}
        mark={marks[i]}
        active={activeIndex >= p.startIndex && activeIndex < p.endIndex ? activeIndex : -1}
        selStart={sel ? sel.start : -1}
        selEnd={sel ? sel.end : -1}
        observe={observeRow}
        onSeek={seekTime}
      />,
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          restoreRef.current = -1;
          stopDrag();
        }}
        className="h-full overflow-y-auto py-4"
      >
        <div className="relative" style={{ height: totalHeight }}>
          {rows}
        </div>
      </div>
      {!following && activeIndex >= 0 && (
        <button
          onClick={() => {
            clickedRef.current = -1;
            setFollow(true);
          }}
          className="enter press absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-panel-2 px-3.5 py-1.5 text-xs shadow-lg hover:brightness-125"
        >
          Follow playback
        </button>
      )}
    </div>
  );
}
