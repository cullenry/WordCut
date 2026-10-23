"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { usePageCuts } from "./pageCuts";

/** The strike draws first; then the word closes up to a notch. */
const CLOSE_DELAY = 200;
const OPEN_MS = 300;

/**
 * Closes a cut word up to a thin notch, and opens it again on restore. Width
 * can't transition to or from auto, so it is pinned to measured pixels around
 * each change; data-closed is set here, outside React.
 */
function useCollapse(ref: RefObject<HTMLElement | null>, cut: boolean) {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!mounted.current) {
      mounted.current = true;
      if (cut) el.dataset.closed = "true";
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = 0;
    if (cut) {
      const close = () => {
        el.style.width = `${el.getBoundingClientRect().width}px`;
        void el.offsetWidth;
        el.style.width = "";
        el.dataset.closed = "true";
      };
      if (reduced) close();
      else timer = window.setTimeout(close, CLOSE_DELAY);
    } else if (el.dataset.closed === "true") {
      const from = el.getBoundingClientRect().width;
      el.style.transition = "none";
      el.dataset.closed = "false";
      const full = el.getBoundingClientRect().width;
      el.style.width = `${from}px`;
      void el.offsetWidth;
      el.style.transition = "";
      el.style.width = `${full}px`;
      timer = window.setTimeout(() => (el.style.width = ""), reduced ? 0 : OPEN_MS + 40);
    }
    return () => clearTimeout(timer);
  }, [cut, ref]);
}

/**
 * One word that can be cut: struck through in red, then closed up to a red
 * notch, the way the editor's timeline marks a cut. The space after the word
 * is part of it, so the text closes up cleanly. With `onToggle` it is a button.
 */
export function CutWord({
  text,
  cut,
  space = true,
  pageCut,
  onToggle,
}: {
  text: string;
  cut: boolean;
  space?: boolean;
  /** Registers the cut with the scroll ruler. */
  pageCut?: { id: string; seconds: number };
  onToggle?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const setCut = usePageCuts((s) => s.setCut);
  useCollapse(ref, cut);

  const id = pageCut?.id;
  const seconds = pageCut?.seconds ?? 0;
  useEffect(() => {
    if (!id) return;
    setCut(id, cut && ref.current ? { el: ref.current, seconds } : null);
    return () => setCut(id, null);
  }, [id, seconds, cut, setCut]);

  const inner = (
    <>
      <span className="cw-w">{text}</span>
      {space && " "}
    </>
  );
  if (!onToggle) {
    return (
      <span ref={ref} className="cw" data-cut={cut}>
        {inner}
      </span>
    );
  }
  return (
    <button
      ref={ref as RefObject<HTMLButtonElement>}
      type="button"
      aria-pressed={cut}
      title={cut ? `Restore "${text}"` : `Cut "${text}"`}
      onClick={onToggle}
      className="cw"
      data-cut={cut}
    >
      {inner}
    </button>
  );
}
