import { create } from "zustand";
import { isAbort, type ExportWorker } from "@/lib/media/export/client";
import { EtaEstimator, exportFraction } from "@/lib/media/export/progress";
import type { ExportJob } from "@/lib/media/export/protocol";

/** What the export is doing. One export runs at a time; the editor stays usable meanwhile. */
export type ExportStatus =
  | { state: "idle" }
  | { state: "running"; clipId: string; fileName: string; fraction: number; remaining: number | null }
  | {
      state: "done";
      clipId: string;
      fileName: string;
      url: string;
      size: number;
      duration: number;
      fontWarning: string | null;
    }
  | { state: "error"; clipId: string; fileName: string; message: string };

interface ExportState {
  /** The clip whose export dialog is open, or null. */
  dialogClipId: string | null;
  status: ExportStatus;
  openDialog: (clipId: string) => void;
  closeDialog: () => void;
  /** Takes ownership of `worker` (already probed) and runs the export on it. */
  start: (worker: ExportWorker, job: ExportJob, clipId: string, fileName: string) => void;
  /** Stops the export now: the worker is terminated, which frees everything it held. */
  cancel: () => void;
  /** Forgets a finished or failed export (and its download URL). */
  dismiss: () => void;
}

let active: ExportWorker | null = null;

const warnOnLeave = (e: BeforeUnloadEvent) => e.preventDefault();

function revoke(status: ExportStatus) {
  if (status.state === "done") URL.revokeObjectURL(status.url);
}

export function downloadFile(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const useExportStore = create<ExportState>()((set, get) => ({
  dialogClipId: null,
  status: { state: "idle" },

  openDialog: (clipId) => set({ dialogClipId: clipId }),
  closeDialog: () => set({ dialogClipId: null }),

  start: (worker, job, clipId, fileName) => {
    active?.terminate();
    revoke(get().status);
    active = worker;
    const eta = new EtaEstimator();
    const startedAt = performance.now();
    set({ status: { state: "running", clipId, fileName, fraction: 0, remaining: null } });
    window.addEventListener("beforeunload", warnOnLeave);

    const finish = () => {
      if (active === worker) active = null;
      worker.terminate();
      window.removeEventListener("beforeunload", warnOnLeave);
    };

    worker
      .run(job, (counts) => {
        if (active !== worker) return;
        const fraction = exportFraction(counts);
        eta.push((performance.now() - startedAt) / 1000, fraction);
        set({ status: { state: "running", clipId, fileName, fraction, remaining: eta.remaining() } });
      })
      .then((result) => {
        if (active !== worker) return;
        finish();
        const blob = new Blob([result.buffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        set({
          status: {
            state: "done",
            clipId,
            fileName,
            url,
            size: blob.size,
            duration: result.duration,
            fontWarning: result.fontWarning,
          },
        });
        downloadFile(url, fileName);
      })
      .catch((err: unknown) => {
        if (active !== worker) return;
        finish();
        if (isAbort(err)) set({ status: { state: "idle" } });
        else set({ status: { state: "error", clipId, fileName, message: err instanceof Error ? err.message : String(err) } });
      });
  },

  cancel: () => {
    const worker = active;
    active = null;
    worker?.terminate();
    window.removeEventListener("beforeunload", warnOnLeave);
    if (get().status.state === "running") set({ status: { state: "idle" } });
  },

  dismiss: () => {
    const { status } = get();
    if (status.state === "running") return;
    revoke(status);
    set({ status: { state: "idle" } });
  },
}));
