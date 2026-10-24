"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { primaryButton, secondaryButton } from "@/components/ui/buttons";
import { captionPagesFor } from "@/lib/captions/words";
import { clipEdl } from "@/lib/clips/range";
import type { Clip } from "@/lib/clips/types";
import { formatBytes, formatDuration } from "@/lib/format";
import { ExportWorker, probeExport } from "@/lib/media/export/client";
import {
  DEFAULT_RESOLUTION,
  RESOLUTION_IDS,
  RESOLUTIONS,
  codecName,
  exportFileName,
  formatFrameRate,
  type ResolutionId,
} from "@/lib/media/export/plan";
import { formatRemaining, percentOf } from "@/lib/media/export/progress";
import type { ExportJob, ProbeResult } from "@/lib/media/export/protocol";
import { useEditorStore } from "@/store/editor-store";
import { downloadFile, useExportStore, type ExportStatus } from "@/store/export-store";
import { captionFontCheck, captionFontFaces, captionFontFamily } from "../captionFont";

const RESOLUTION_HINTS: Record<ResolutionId, string> = {
  "1080": "Full HD, best for upload",
  "720": "Smaller file, faster",
};

/** The export dialog of the clip in useExportStore.dialogClipId. */
export function ExportDialog() {
  const clipId = useExportStore((s) => s.dialogClipId);
  const clip = useEditorStore((s) => s.clips.find((c) => c.id === clipId) ?? null);
  return clipId && clip ? <Dialog key={clipId} clip={clip} /> : null;
}

function Dialog({ clip }: { clip: Clip }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeDialog = useExportStore((s) => s.closeDialog);
  const status = useExportStore((s) => s.status);
  const mine = status.state !== "idle" && status.clipId === clip.id ? status : null;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="export-title"
      onClose={closeDialog}
      // Keys typed here are the dialog's: Space mustn't play the video behind it, Delete mustn't cut words.
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close(); // the backdrop
      }}
      className="dialog m-auto w-[min(440px,calc(100vw-32px))] rounded-panel border border-rule bg-paper p-0 text-ink shadow-2xl shadow-black/40 backdrop:bg-black/50"
    >
      <div className="px-5 pb-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="export-title" className="text-sm font-medium">
              Export clip
            </h2>
            <p className="mt-0.5 truncate text-xs text-ink-2">{clip.name}</p>
          </div>
          <IconButton label="Close" onClick={() => ref.current?.close()}>
            <path d="m4 4 8 8M12 4l-8 8" />
          </IconButton>
        </div>
        {mine?.state === "running" ? (
          <Running status={mine} onHide={() => ref.current?.close()} />
        ) : mine?.state === "done" ? (
          <Done status={mine} onClose={() => ref.current?.close()} />
        ) : mine?.state === "error" ? (
          <Failed message={mine.message} onClose={() => ref.current?.close()} />
        ) : (
          <Setup clip={clip} busy={status.state === "running"} onCancel={() => ref.current?.close()} />
        )}
      </div>
    </dialog>
  );
}

function Setup({ clip, busy, onCancel }: { clip: Clip; busy: boolean; onCancel: () => void }) {
  const file = useEditorStore((s) => s.source!.file);
  const edl = useEditorStore((s) => s.edl);
  const duration = useMemo(() => (edl ? clipEdl(edl, clip.start, clip.end).duration : 0), [edl, clip.start, clip.end]);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [resolution, setResolution] = useState<ResolutionId>(DEFAULT_RESOLUTION);
  const [name, setName] = useState(() => exportFileName(clip.name).replace(/\.mp4$/, ""));
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let live = true;
    probeExport(file)
      .then((r) => live && setProbe(r))
      .catch((e: unknown) => live && setProbe({ ok: false, reason: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [file]);

  // Fall back to the other size if this browser can only encode one of them.
  const encoders = probe?.ok ? probe.encoders : null;
  const res: ResolutionId = encoders && !encoders[resolution] ? (resolution === "1080" ? "720" : "1080") : resolution;
  const video = encoders?.[res] ?? null;
  const audio = probe?.ok ? probe.audio : null;

  const start = async () => {
    if (!probe?.ok || !video || starting) return;
    const s = useEditorStore.getState();
    if (!s.edl || !s.transcript) return;
    setStarting(true);
    const ce = clipEdl(s.edl, clip.start, clip.end);
    // The same pages, from the same function, as the preview (see ClipStage).
    const pages = captionPagesFor(s.transcript.words, s.deleted, ce, clip.start, clip.end);
    const family = captionFontFamily();
    const job: ExportJob = {
      file,
      clipEdl: ce,
      pages,
      captions: clip.captions,
      cropOffset: clip.cropOffset,
      ...RESOLUTIONS[res],
      frameRate: probe.frameRate,
      video,
      audio: audio?.encoder ?? null,
      fontFamily: family,
      fontFaces: clip.captions.enabled ? captionFontFaces(family) : [],
      fontCheck: clip.captions.enabled ? await captionFontCheck(clip.captions, pages, family) : null,
    };
    useExportStore.getState().start(new ExportWorker(), job, clip.id, exportFileName(name));
  };

  if (!probe) {
    return (
      <p className="mt-5 flex items-center gap-2 text-sm text-ink-2" role="status">
        <Spinner /> Checking what this browser can export…
      </p>
    );
  }

  if (!probe.ok) {
    return (
      <>
        <Notice tone="error" title="Can't export this video">
          {probe.reason}
        </Notice>
        <Footer>
          <SecondaryButton onClick={onCancel}>Close</SecondaryButton>
        </Footer>
      </>
    );
  }

  const rate = probe.frameRate;
  const src = probe.sourceFrameRate;
  const rateHint =
    src === null
      ? "Source rate unknown"
      : Math.abs(src - rate) < 0.05
        ? "Matches the source"
        : `Source is ${formatFrameRate(src)} fps; exports are capped at 30`;
  const bitrate = video ? video.bitrate + (audio?.encoder.bitrate ?? 0) : 0;
  const notes = fallbackNotes(probe, video);

  return (
    <>
      <p className="mt-1 text-xs text-ink-2">
        {formatDuration(duration)} · 9:16 · cuts, trimmed pauses, crop and captions as in the preview
      </p>

      <div className="mt-5 space-y-4">
        <Field label="Resolution">
          <div role="radiogroup" aria-label="Resolution" className="grid grid-cols-2 gap-2">
            {RESOLUTION_IDS.map((id) => {
              const { width, height } = RESOLUTIONS[id];
              const ok = !!encoders?.[id];
              const on = id === res;
              return (
                <button
                  key={id}
                  role="radio"
                  aria-checked={on}
                  disabled={!ok}
                  onClick={() => setResolution(id)}
                  className={`press rounded-field px-3 py-2 text-left ring-1 disabled:cursor-not-allowed disabled:opacity-40 ${
                    on ? "bg-ink/[0.05] ring-2 ring-ink" : "ring-rule hover:ring-ink/40"
                  }`}
                >
                  <span className="block font-label text-[13px]">
                    {width} × {height}
                  </span>
                  <span className="block text-[11px] text-ink-2">{ok ? RESOLUTION_HINTS[id] : "Not supported here"}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Frame rate" value={`${formatFrameRate(rate)} fps`}>
          <p className="text-xs text-ink-2">{rateHint}</p>
        </Field>

        <Field label="File name">
          <div className="flex items-center rounded-field border border-rule focus-within:border-ink/60">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void start()}
              aria-label="File name"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            />
            <span className="pr-3 text-sm text-ink-2">.mp4</span>
          </div>
        </Field>
      </div>

      <p className="mt-4 font-label text-[11px] leading-relaxed text-ink-2">
        MP4 · {codecName(video?.codec)}
        {video && (video.hardware ? " (hardware)" : " (software)")}
        {audio ? ` · ${codecName(audio.encoder.codec)} ${audio.encoder.channels > 1 ? "stereo" : "mono"}` : " · no audio"}
        {bitrate > 0 && ` · about ${formatBytes((bitrate * duration) / 8)}`}
      </p>

      {notes.map((n) => (
        <Notice key={n} tone="warn">
          {n}
        </Notice>
      ))}
      {busy && <Notice tone="warn">Another clip is exporting. Wait for it to finish or cancel it first.</Notice>}

      <Footer>
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
        <PrimaryButton onClick={() => void start()} disabled={busy || !video || duration <= 0 || starting}>
          Export
        </PrimaryButton>
      </Footer>
    </>
  );
}

/** What the browser made us fall back to, in words. */
function fallbackNotes(probe: Extract<ProbeResult, { ok: true }>, video: { codec: string } | null): string[] {
  const notes: string[] = [];
  if (video && video.codec !== "avc") {
    notes.push(
      `This browser can't encode H.264, so the video will be ${codecName(video.codec)}. Some phones and apps may not play it.`,
    );
  }
  if (probe.audio?.encoder.codec === "opus") {
    notes.push(
      "This browser can't encode AAC, so the audio will be Opus. It plays in Chrome, Firefox and VLC, but some Apple apps and social sites won't accept it.",
    );
  }
  return notes;
}

function Running({ status, onHide }: { status: Extract<ExportStatus, { state: "running" }>; onHide: () => void }) {
  const cancel = useExportStore((s) => s.cancel);
  const pct = percentOf(status.fraction);
  return (
    <>
      <div className="mt-5" role="status" aria-live="polite">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-medium tabular-nums">{pct}%</span>
          <span className="font-label text-[11px] text-ink-2">{formatRemaining(status.remaining)}</span>
        </div>
        <ProgressBar fraction={status.fraction} />
        <p className="mt-3 text-xs text-ink-2">
          You can keep editing while this runs. Changes made now won&apos;t affect this export.
        </p>
      </div>
      <Footer>
        <SecondaryButton onClick={cancel}>Cancel export</SecondaryButton>
        <PrimaryButton onClick={onHide}>Keep editing</PrimaryButton>
      </Footer>
    </>
  );
}

function Done({ status, onClose }: { status: Extract<ExportStatus, { state: "done" }>; onClose: () => void }) {
  const dismiss = useExportStore((s) => s.dismiss);
  return (
    <>
      <div className="mt-5 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-paper">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm">{status.fileName}</p>
          <p className="text-xs text-ink-2">
            {formatDuration(status.duration)} · {formatBytes(status.size)} · saved to your downloads
          </p>
        </div>
      </div>
      {status.fontWarning && <Notice tone="warn">{status.fontWarning}</Notice>}
      <Footer>
        <SecondaryButton onClick={() => downloadFile(status.url, status.fileName)}>Download again</SecondaryButton>
        <SecondaryButton onClick={dismiss}>Export again</SecondaryButton>
        <PrimaryButton
          onClick={() => {
            onClose();
            dismiss();
          }}
        >
          Done
        </PrimaryButton>
      </Footer>
    </>
  );
}

function Failed({ message, onClose }: { message: string; onClose: () => void }) {
  const dismiss = useExportStore((s) => s.dismiss);
  return (
    <>
      <Notice tone="error" title="Export failed">
        {message}
      </Notice>
      <Footer>
        <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        <PrimaryButton onClick={dismiss}>Try again</PrimaryButton>
      </Footer>
    </>
  );
}

export function ProgressBar({ fraction, thin }: { fraction: number; thin?: boolean }) {
  return (
    <div className={`${thin ? "h-1" : "mt-2 h-1.5"} overflow-hidden rounded-full bg-ink/10`}>
      <div
        className="progress-fill h-full origin-left rounded-full bg-ink"
        style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, fraction))})` }}
      />
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-ink-2">
        <span>{label}</span>
        {value && <span className="font-label text-[11px] text-ink">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function Notice({ tone, title, children }: { tone: "warn" | "error"; title?: string; children: ReactNode }) {
  const colors = tone === "error" ? "border-cut/40 bg-cut/[0.08]" : "border-mark/50 bg-mark/15";
  return (
    <div role={tone === "error" ? "alert" : undefined} className={`mt-4 rounded-field border px-3 py-2.5 text-xs leading-relaxed ${colors}`}>
      {title && <p className={`mb-0.5 text-sm font-medium ${tone === "error" ? "text-cut-text" : "text-ink"}`}>{title}</p>}
      <p className="text-ink/80">{children}</p>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}

function PrimaryButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={primaryButton}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={secondaryButton}>
      {children}
    </button>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="press grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ink/[0.07] hover:text-ink"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
        {children}
      </svg>
    </button>
  );
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden />;
}
