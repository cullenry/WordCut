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
        className={`flex w-full max-w-2xl cursor-pointer flex-col items-center rounded-panel border border-dashed px-8 py-20 text-center transition ${
          dragging ? "border-ink bg-ink/[0.05]" : "border-ink/25 hover:border-ink/50"
        }`}
      >
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-full border border-rule text-xl">⬆</div>
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.02em]">{loading ? "Opening video..." : "Drop a video here"}</h2>
        <p className="mt-2 text-sm text-ink-2">
          or click to browse. MP4, MOV, WebM. Your video stays on your device.
        </p>
        {error && <p className="mt-5 max-w-md text-sm text-cut-text">{error}</p>}
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
