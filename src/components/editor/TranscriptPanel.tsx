"use client";

import type { TranscriptionStatus } from "@/store/editor-store";
import { useEditorStore } from "@/store/editor-store";
import { EditToolbar } from "./transcript/EditToolbar";
import { TranscriptView } from "./transcript/TranscriptView";

export function TranscriptPanel() {
  const transcript = useEditorStore((s) => s.transcript);
  const status = useEditorStore((s) => s.transcription);
  const restored = useEditorStore((s) => s.restored);
  const start = useEditorStore((s) => s.startTranscription);
  const hasCuts = useEditorStore((s) => s.deleted.size > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm">
        <span className="font-medium">Transcript</span>
        {transcript && status.state !== "running" && (
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>
              {transcript.words.length.toLocaleString()} words
              {restored && " · restored from last session"}
            </span>
            <button
              onClick={() => void start()}
              title={hasCuts ? "Your cuts are cleared when the video is transcribed again" : undefined}
              className="press rounded-md border border-border px-2 py-1 hover:bg-panel-2"
            >
              Re-transcribe
            </button>
          </div>
        )}
      </div>

      {status.state === "running" ? (
        <Progress status={status} />
      ) : status.state === "error" ? (
        <ErrorState message={status.message} onRetry={() => void start()} />
      ) : transcript ? (
        transcript.words.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No speech was detected in this video.</p>
        ) : (
          <>
            <EditToolbar transcript={transcript} />
            <TranscriptView transcript={transcript} />
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
        <p className="mt-2 text-sm text-muted">
          The audio is extracted in your browser and sent for transcription. Your video never leaves this device.
        </p>
        <button
          onClick={onStart}
          className="press mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:brightness-110"
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
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-panel-2">
          <div
            className="progress-fill h-full origin-left rounded-full bg-accent"
            style={{ transform: `scaleX(${Math.max(0.02, fraction)})` }}
          />
        </div>
        <button onClick={cancel} className="press mt-5 text-xs text-muted hover:text-fg">
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
        <p className="font-medium text-red-400">Transcription failed</p>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <button
          onClick={onRetry}
          className="press mt-5 rounded-lg border border-border bg-panel-2 px-4 py-2 text-sm hover:brightness-125"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
