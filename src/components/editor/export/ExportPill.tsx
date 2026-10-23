"use client";

import { formatRemaining, percentOf } from "@/lib/media/export/progress";
import { downloadFile, useExportStore } from "@/store/export-store";
import { IconButton, ProgressBar } from "./ExportDialog";

/**
 * The export's status while its dialog is closed, so you can keep editing during
 * an export and still see it, open it again, or stop it.
 */
export function ExportPill() {
  const status = useExportStore((s) => s.status);
  const dialogOpen = useExportStore((s) => s.dialogClipId !== null);
  const openDialog = useExportStore((s) => s.openDialog);
  const cancel = useExportStore((s) => s.cancel);
  const dismiss = useExportStore((s) => s.dismiss);
  if (status.state === "idle" || dialogOpen) return null;

  return (
    <div
      role="status"
      className="pill fixed bottom-4 right-4 z-40 w-72 rounded-xl border border-border bg-panel-2 px-3.5 py-3 shadow-xl shadow-black/50"
    >
      <div className="flex items-center gap-2">
        <button onClick={() => openDialog(status.clipId)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm">
            {status.state === "running" ? "Exporting" : status.state === "done" ? "Exported" : "Export failed"}
            <span className="text-muted"> · {status.fileName}</span>
          </p>
          <p className="text-xs tabular-nums text-muted">
            {status.state === "running"
              ? `${percentOf(status.fraction)}% · ${formatRemaining(status.remaining)}`
              : status.state === "done"
                ? "Saved to your downloads"
                : "Open for details"}
          </p>
        </button>
        {status.state === "done" && (
          <IconButton label="Download again" onClick={() => downloadFile(status.url, status.fileName)}>
            <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
          </IconButton>
        )}
        <IconButton label={status.state === "running" ? "Cancel export" : "Dismiss"} onClick={status.state === "running" ? cancel : dismiss}>
          <path d="m4 4 8 8M12 4l-8 8" />
        </IconButton>
      </div>
      {status.state === "running" && (
        <div className="mt-2">
          <ProgressBar fraction={status.fraction} thin />
        </div>
      )}
    </div>
  );
}
