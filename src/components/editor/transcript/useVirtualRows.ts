"use client";

import { useCallback, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { Paragraph } from "@/lib/transcript/paragraphs";
import { buildOffsets, estimateParagraphHeight, visibleRange } from "@/lib/transcript/virtual";

const OVERSCAN_PX = 600;
/** Horizontal space around the text: panel padding plus the timestamp gutter. */
const TEXT_INSET = 40 + 68;
const DEFAULT_WIDTH = 480;

interface Layout {
  heights: Float64Array;
  measured: Uint8Array;
  offsets: Float64Array;
  width: number;
}

function estimate(layout: Layout, paragraphs: Paragraph[], containerWidth: number) {
  const textWidth = Math.max(120, containerWidth - TEXT_INSET);
  for (let i = 0; i < paragraphs.length; i++) {
    if (layout.measured[i]) continue;
    const p = paragraphs[i];
    layout.heights[i] = estimateParagraphHeight(p.endIndex - p.startIndex, { textWidth });
  }
  layout.offsets = buildOffsets(layout.heights);
}

/**
 * Windowing for variable-height paragraph rows. Heights start as estimates and
 * are replaced by real measurements as rows render; when a row above the
 * viewport changes size, scrollTop is adjusted so the visible text doesn't jump.
 */
export function useVirtualRows(paragraphs: Paragraph[], scrollRef: RefObject<HTMLDivElement | null>) {
  const [version, bump] = useReducer((n: number) => n + 1, 0);

  const layout = useMemo<Layout>(() => {
    const n = paragraphs.length;
    const l: Layout = {
      heights: new Float64Array(n),
      measured: new Uint8Array(n),
      offsets: new Float64Array(n + 1),
      width: DEFAULT_WIDTH,
    };
    estimate(l, paragraphs, l.width);
    return l;
  }, [paragraphs]);
  const layoutRef = useRef(layout);
  const [range, setRange] = useState(() => visibleRange(layout.offsets, 0, 800, OVERSCAN_PX));

  const updateRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const r = visibleRange(layoutRef.current.offsets, el.scrollTop, el.clientHeight, OVERSCAN_PX);
    setRange((prev) => (prev.start === r.start && prev.end === r.end ? prev : r));
  }, [scrollRef]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    layoutRef.current = layout;
    el.scrollTop = 0;
    const fit = () => {
      if (Math.abs(el.clientWidth - layout.width) > 1) {
        layout.width = el.clientWidth;
        estimate(layout, paragraphs, el.clientWidth);
        bump();
      }
      updateRange();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, paragraphs, scrollRef, updateRange]);

  useLayoutEffect(updateRange, [version, updateRange]);

  const onRowsResized = useCallback(
    (entries: ResizeObserverEntry[]) => {
      const el = scrollRef.current;
      const l = layoutRef.current;
      if (!el) return;
      const top = el.scrollTop;
      let delta = 0;
      let changed = false;
      for (const target of entries.map((e) => e.target as HTMLElement)) {
        const i = Number(target.dataset.row);
        if (!(i >= 0 && i < l.heights.length)) continue;
        const h = target.offsetHeight;
        if (l.measured[i] && Math.abs(l.heights[i] - h) < 0.5) continue;
        if (l.offsets[i + 1] <= top) delta += h - l.heights[i]; // entirely above the viewport
        l.heights[i] = h;
        l.measured[i] = 1;
        changed = true;
      }
      if (!changed) return;
      l.offsets = buildOffsets(l.heights);
      flushSync(bump); // reposition rows before paint
      if (delta) el.scrollTop = top + delta;
    },
    [scrollRef],
  );

  const roRef = useRef<ResizeObserver | null>(null);
  /** Ref callback for row elements. */
  const observeRow = useCallback(
    (row: HTMLElement | null) => {
      if (!row) return;
      const ro = (roRef.current ??= new ResizeObserver(onRowsResized));
      ro.observe(row);
      return () => ro.unobserve(row);
    },
    [onRowsResized],
  );

  return {
    range: { start: Math.min(range.start, paragraphs.length), end: Math.min(range.end, paragraphs.length) },
    version,
    offsets: layout.offsets,
    totalHeight: layout.offsets[paragraphs.length],
    observeRow,
    onScroll: updateRange,
  };
}
