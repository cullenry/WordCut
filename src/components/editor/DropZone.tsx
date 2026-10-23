"use client";

import { useRef, useState } from "react";
import { probeVideo, ProbeError } from "@/lib/probe";
import { useEditorStore } from "@/store/editor-store";

export function DropZone() {
  const setSource = useEditorStore((s) => s.setSource);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const { url, meta } = await probeVideo(file);
      setSource({ file, url, meta });
    } catch (e) {
      setError(e instanceof ProbeError ? e.message : "Could not open this file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid flex-1 place-items-center p-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex w-full max-w-2xl cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-8 py-20 text-center transition ${
          dragging ? "border-accent bg-accent/10" : "border-border bg-panel hover:border-accent/60"
        }`}
      >
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-panel-2 text-2xl">⬆</div>
        <h2 className="text-xl font-semibold">{loading ? "Opening video..." : "Drop a video here"}</h2>
        <p className="mt-2 text-sm text-muted">
          or click to browse. MP4, MOV, WebM. Your video stays on your device.
        </p>
        {error && <p className="mt-5 max-w-md text-sm text-red-400">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mkv"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
