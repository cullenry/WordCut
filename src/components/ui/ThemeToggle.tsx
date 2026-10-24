"use client";

import { useEffect, useState } from "react";
import { THEME_KEY, type Ink } from "./theme";

function apply(ink: Ink) {
  if (ink === "dark") document.documentElement.dataset.ink = "dark";
  else delete document.documentElement.dataset.ink;
}

/** Paper or ink. One choice, shared by the landing page and the editor. */
export function ThemeToggle({ fallback = "light", size = "h-9 w-9" }: { fallback?: Ink; size?: string }) {
  const [dark, setDark] = useState(fallback === "dark");

  // The inline script only runs on a full page load; moving between pages in the app lands here.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {}
    const ink: Ink = saved === "dark" || saved === "light" ? saved : fallback;
    apply(ink);
    setDark(ink === "dark");
  }, [fallback]);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    apply(next ? "dark" : "light");
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
      className={`press grid ${size} shrink-0 place-items-center rounded-full border border-ink/20 transition-colors hover:border-ink`}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        {dark ? (
          <>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
          </>
        ) : (
          <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />
        )}
      </svg>
    </button>
  );
}
