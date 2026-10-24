"use client";

import { useEditorStore, type Panel } from "@/store/editor-store";
import { ClipsPanel } from "./clips/ClipsPanel";
import { TranscriptMeta, TranscriptPanel } from "./TranscriptPanel";

/** The right-hand side: the transcript, or the clips made from it. */
export function SidePanel() {
  const panel = useEditorStore((s) => s.panel);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-rule pr-4">
        <Tabs />
        {panel === "transcript" && <TranscriptMeta />}
      </div>
      {panel === "transcript" ? <TranscriptPanel /> : <ClipsPanel />}
    </div>
  );
}

function Tabs() {
  const panel = useEditorStore((s) => s.panel);
  const count = useEditorStore((s) => s.clips.length);
  const setPanel = useEditorStore((s) => s.setPanel);
  return (
    <div role="tablist" aria-label="Side panel" className="flex px-2">
      <Tab id="transcript" active={panel === "transcript"} onSelect={setPanel}>
        Transcript
      </Tab>
      <Tab id="clips" active={panel === "clips"} onSelect={setPanel}>
        Clips
        {count > 0 && (
          // Re-keyed on every change so a new clip gives the count a small pop, even from the other tab.
          <span key={count} className="badge-pop rounded-full bg-ink/10 px-1.5 font-label text-[10px] leading-4 text-ink">
            {count}
          </span>
        )}
      </Tab>
    </div>
  );
}

function Tab({
  id,
  active,
  onSelect,
  children,
}: {
  id: Panel;
  active: boolean;
  onSelect: (p: Panel) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      className={`relative flex items-center gap-1.5 px-2.5 py-3 text-sm font-medium ${
        active ? "text-ink" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-ink" />}
    </button>
  );
}
