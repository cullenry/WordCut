"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { APP_NAME } from "@/lib/config";
import { browserSupport, type BrowserSupport } from "@/lib/media/support";

const DISMISS_KEY = "wordcut:untested-browser-dismissed";
const noSubscribe = () => () => {};
// The server can't know the browser; render nothing there and decide after hydration.
const serverSupport = (): BrowserSupport => "supported";

/**
 * Explains, in the editor only, when this browser can't run WordCut (no WebCodecs)
 * or hasn't been tested. The landing page never shows it.
 */
export function BrowserSupportBanner() {
  const support = useSyncExternalStore(noSubscribe, browserSupport, serverSupport);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) setDismissed(true);
    } catch {}
  }, []);

  if (support === "insecure") {
    return (
      <div role="alert" className="enter border-b border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm">
        <div className="flex items-center gap-4">
          <WarningIcon />
          <p className="min-w-0 flex-1 text-amber-50">
            <strong className="font-semibold">Open {APP_NAME} over HTTPS.</strong>{" "}
            <span className="text-amber-100/80">
              Browsers only allow the video APIs {APP_NAME} needs on secure pages: https:// addresses and localhost. If
              you&apos;re self-hosting, put the server behind HTTPS.
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (support === "unsupported") {
    return (
      <div role="alert" className="enter border-b border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <WarningIcon />
          <p className="min-w-0 flex-1 basis-64 text-amber-50">
            <strong className="font-semibold">{APP_NAME} needs Chrome or Edge for now.</strong>{" "}
            <span className="text-amber-100/80">
              This browser doesn&apos;t support WebCodecs, which {APP_NAME} uses to read your video&apos;s audio and to
              export clips. Firefox and Safari support is on the roadmap.
            </span>
          </p>
          <CopyLinkButton />
        </div>
      </div>
    );
  }

  if (support === "untested" && !dismissed) {
    return (
      <div role="status" className="enter flex items-center gap-3 border-b border-border bg-panel-2 px-4 py-2 text-xs text-muted">
        <p className="min-w-0 flex-1">
          {APP_NAME} is built and tested in Chrome and Edge. In this browser, transcription or export may not work.
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {}
          }}
          className="press grid h-6 w-6 shrink-0 place-items-center rounded-md hover:bg-white/10 hover:text-fg"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  return null;
}

/** Most people will switch browsers by pasting the link, so make that one click. */
function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="press shrink-0 rounded-md border border-amber-300/30 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-300/10"
    >
      <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
    </button>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 self-start text-amber-300" fill="none" aria-hidden>
      <path
        d="M10 3.2 17.4 16H2.6L10 3.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 8.2v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13.9" r="0.9" fill="currentColor" />
    </svg>
  );
}
