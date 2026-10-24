"use client";

import { primaryButton, secondaryButton } from "@/components/ui/buttons";
import { useEditorStore } from "@/store/editor-store";
import { ClipInspector } from "./ClipInspector";
import { ClipList } from "./ClipList";

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

export function ClipsPanel() {
  const hasTranscript = useEditorStore((s) => (s.transcript?.words.length ?? 0) > 0);
  const count = useEditorStore((s) => s.clips.length);
  const selected = useEditorStore((s) => s.clips.find((c) => c.id === s.selectedClipId) ?? null);
  const setPanel = useEditorStore((s) => s.setPanel);

  if (!hasTranscript) {
    return (
      <Empty title="Transcribe first">
        Clips are made from words. Once the video is transcribed, select a few words and press <Kbd>C</Kbd>.
        <span className="mt-4 flex justify-center">
          <button onClick={() => setPanel("transcript")} className={secondaryButton}>
            Go to transcript
          </button>
        </span>
      </Empty>
    );
  }

  if (count === 0) {
    return (
      <Empty title="No clips yet">
        Select the words you want in the transcript, then click <span className="text-ink">Make clip</span> or press{" "}
        <Kbd>C</Kbd>. Cuts you have made stay cut inside the clip.
        <span className="mt-4 flex justify-center">
          <button onClick={() => setPanel("transcript")} className={primaryButton}>
            Select words
          </button>
        </span>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between px-4 pb-1 pt-3 text-xs text-ink-2">
        <span className="font-label text-[11px]">
          {count} {count === 1 ? "clip" : "clips"}
        </span>
        <span className="hidden lg:inline">
          <Kbd>F2</Kbd> rename · <Kbd>Alt+↑↓</Kbd> reorder · <Kbd>{MOD}Z</Kbd> undo
        </span>
      </div>
      <div className="flex max-h-[42%] min-h-[88px] shrink-0 flex-col border-b border-rule">
        <ClipList />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{selected && <ClipInspector key={selected.id} clip={selected} />}</div>
    </div>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="enter grid flex-1 place-items-center p-8 text-center">
      <div className="max-w-xs text-sm text-ink-2">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-2 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-chip border border-rule px-1 font-label text-[10px] text-ink">{children}</kbd>;
}
