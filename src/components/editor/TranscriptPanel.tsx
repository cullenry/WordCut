"use client";

import { outlineButton, primaryButton, secondaryButton } from "@/components/ui/buttons";
import type { TranscriptionStatus } from "@/store/editor-store";
import { useEditorStore } from "@/store/editor-store";
import { CleanupPanel } from "./transcript/CleanupPanel";
import { EditToolbar } from "./transcript/EditToolbar";
import { TranscriptView } from "./transcript/TranscriptView";

/** Word count and Re-transcribe, shown beside the tabs. */
export function TranscriptMeta() {
  const transcript = useEditorStore((s) => s.transcript);
  const status = useEditorStore((s) => s.transcription);
  const restored = useEditorStore((s) => s.restored);
  const start = useEditorStore((s) => s.startTranscription);
  const hasCuts = useEditorStore((s) => s.deleted.size > 0);
  const hasClips = useEditorStore((s) => s.clips.length > 0);
  if (!transcript || status.state === "running") return null;

  return (
    <div className="flex items-center gap-3 text-xs text-ink-2">
      <span className="font-label text-[11px]">
        {transcript.words.length.toLocaleString()} words
        {restored && " · restored"}
      </span>
      <button
        onClick={() => void start()}
        title={
          hasCuts
            ? `Your cuts are cleared when the video is transcribed again${hasClips ? "; clips are kept" : ""}`
            : undefined
        }
        className={outlineButton}
      >
        Re-transcribe
      </button>
    </div>
  );
}

export function TranscriptPanel() {
  const transcript = useEditorStore((s) => s.transcript);
  const status = useEditorStore((s) => s.transcription);
  const start = useEditorStore((s) => s.startTranscription);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {status.state === "running" ? (
        <Progress status={status} />
      ) : status.state === "error" ? (
        <ErrorState message={status.message} onRetry={() => void start()} />
      ) : transcript ? (
        transcript.words.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-2">No speech was detected in this video.</p>
        ) : (
          <>
            <EditToolbar transcript={transcript} />
            <TranscriptView transcript={transcript} />
            <CleanupPanel />
          </>
        )
      ) : (
        <EmptyState onStart={() => void start()} />
      )}
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="enter grid flex-1 place-items-center p-8 text-center">
      <div className="max-w-xs">
        <p className="font-medium">Transcribe this video</p>
        <p className="mt-2 text-sm text-ink-2">
          The audio is extracted in your browser and sent for transcription. Your video never leaves this device.
        </p>
        <button
          onClick={onStart}
          className={`${primaryButton} mt-5`}
        >
          Transcribe
        </button>
      </div>
    </div>
  );
}

function Progress({ status }: { status: Extract<TranscriptionStatus, { state: "running" }> }) {
  const cancel = useEditorStore((s) => s.cancelTranscription);
  const p = status.progress;
  // Analysis is a fast local pass; weight it as the first 15% of the bar.
  const fraction = p.phase === "analyzing" ? p.fraction * 0.15 : 0.15 + (p.done / p.total) * 0.85;
  const label =
    p.phase === "analyzing"
      ? `Analysing audio… ${Math.round(p.fraction * 100)}%`
      : p.total === 1
        ? "Transcribing…"
        : `Transcribing… ${p.done} of ${p.total} parts`;

  return (
    <div className="enter grid flex-1 place-items-center p-8">
      <div className="w-full max-w-xs text-center">
        <p className="text-sm font-medium tabular-nums">{label}</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-ink/10">
          <div
            className="progress-fill h-full origin-left rounded-full bg-ink"
            style={{ transform: `scaleX(${Math.max(0.02, fraction)})` }}
          />
        </div>
        <button onClick={cancel} className="press mt-5 text-xs text-ink-2 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="enter grid flex-1 place-items-center p-8 text-center">
      <div className="max-w-sm">
        <p className="font-medium text-cut-text">Transcription failed</p>
        <p className="mt-2 text-sm text-ink-2">{message}</p>
        <button
          onClick={onRetry}
          className={`${secondaryButton} mt-5`}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
