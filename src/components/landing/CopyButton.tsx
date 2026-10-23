"use client";

import { useEffect, useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined)}
      className="press rounded-full border border-paper/30 px-4 py-2 font-label text-xs uppercase tracking-[0.12em] transition-colors hover:border-paper"
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
