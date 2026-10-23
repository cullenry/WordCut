import type { ExportCounts } from "./progress";
import type { ExportJob, ExportResult, ProbeResult, WorkerResponse } from "./protocol";

/**
 * The page's handle on one export worker. One worker per export: terminate() is the
 * cancel button, and it really stops the work, because it kills the thread and with
 * it every decoder, encoder, frame and buffer the export was holding.
 */
export class ExportWorker {
  private worker: Worker;
  private pending: {
    resolve: (v: never) => void;
    reject: (e: Error) => void;
    expect: "probe" | "done";
    onProgress?: (c: ExportCounts) => void;
  } | null = null;
  private dead = false;

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "export" });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.receive(e.data);
    this.worker.onerror = (e) => {
      e.preventDefault();
      this.fail(new Error(e.message || "The export worker crashed."));
    };
  }

  /** Checks this browser can decode the file and encode an MP4, and measures the source frame rate. */
  probe(file: File): Promise<ProbeResult> {
    return this.request("probe", () => this.worker.postMessage({ type: "probe", file }));
  }

  /** Runs the export. Rejects with an AbortError if terminate() is called first. */
  run(job: ExportJob, onProgress: (c: ExportCounts) => void): Promise<ExportResult> {
    return this.request("done", () => this.worker.postMessage({ type: "export", job }), onProgress);
  }

  terminate(): void {
    if (this.dead) return;
    this.worker.terminate();
    this.fail(new DOMException("Export cancelled", "AbortError"));
    this.dead = true;
  }

  private request<T>(expect: "probe" | "done", send: () => void, onProgress?: (c: ExportCounts) => void): Promise<T> {
    if (this.dead) return Promise.reject(new DOMException("Export cancelled", "AbortError"));
    if (this.pending) return Promise.reject(new Error("The export worker is busy."));
    return new Promise<T>((resolve, reject) => {
      this.pending = { resolve: resolve as (v: never) => void, reject, expect, onProgress };
      send();
    });
  }

  private receive(msg: WorkerResponse) {
    const p = this.pending;
    if (!p) return;
    if (msg.type === "progress") {
      p.onProgress?.(msg);
      return;
    }
    this.pending = null;
    if (msg.type === "error") p.reject(new Error(msg.message));
    else if (msg.type === "probe" && p.expect === "probe") p.resolve(msg.result as never);
    else if (msg.type === "done" && p.expect === "done") p.resolve(msg.result as never);
    else p.reject(new Error(`Unexpected "${msg.type}" message from the export worker.`));
  }

  private fail(err: Error) {
    const p = this.pending;
    this.pending = null;
    p?.reject(err);
  }
}

export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

const probes = new WeakMap<File, Promise<ProbeResult>>();

/** Probes a file once per session, on a short-lived worker of its own. */
export function probeExport(file: File): Promise<ProbeResult> {
  let p = probes.get(file);
  if (!p) {
    const worker = new ExportWorker();
    p = worker.probe(file).finally(() => worker.terminate());
    p.catch(() => probes.delete(file));
    probes.set(file, p);
  }
  return p;
}
