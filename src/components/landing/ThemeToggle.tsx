"use client";

import { useEffect, useState } from "react";

const KEY = "wordcut-landing-ink";

/** Runs before the page paints (see the landing page), so a saved dark choice doesn't flash. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="dark")document.documentElement.dataset.ink="dark"}catch(e){}`;

/** Paper or ink. The landing page only; the editor is always dark. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    if (saved === "dark") document.documentElement.dataset.ink = "dark";
    setDark(document.documentElement.dataset.ink === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.ink = "dark";
    else delete document.documentElement.dataset.ink;
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to the light page" : "Switch to the dark page"}
      className="press grid h-9 w-9 place-items-center rounded-full border border-ink/20 transition-colors hover:border-ink"
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
