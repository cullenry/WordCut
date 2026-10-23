"use client";

import { useEffect, useRef } from "react";
import { formatTime } from "@/lib/format";
import { useEditorStore } from "@/store/editor-store";

const SPEEDS = [0.5, 1, 1.5, 2];

export function VideoPreview() {
  const source = useEditorStore((s) => s.source)!;
  const currentTime = useEditorStore((s) => s.currentTime);
  const playing = useEditorStore((s) => s.playing);
  const { setCurrentTime, setPlaying, registerVideo, seek, togglePlay } = useEditorStore.getState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rateRef = useRef(1);

  useEffect(() => {
    registerVideo(videoRef.current);
    return () => registerVideo(null);
  }, [registerVideo, source.url]);

  // Update the playhead every frame while playing, not just on timeupdate (4Hz).
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !playing) return;
    let raf = 0;
    const tick = () => {
      setCurrentTime(el.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setCurrentTime]);

  const duration = source.meta.duration;

  return (
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 place-items-center bg-black p-2">
        <video
          ref={videoRef}
          src={source.url}
          className="max-h-full max-w-full"
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            setCurrentTime(videoRef.current?.currentTime ?? 0);
          }}
          onSeeked={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
          onEnded={() => setPlaying(false)}
          playsInline
        />
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-panel px-4 py-2.5">
        <button
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm text-white hover:brightness-110"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="w-28 text-xs tabular-nums text-muted">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={currentTime}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek"
          className="h-1 flex-1 accent-accent"
        />
        <select
          defaultValue={1}
          onChange={(e) => {
            rateRef.current = Number(e.target.value);
            if (videoRef.current) videoRef.current.playbackRate = rateRef.current;
          }}
          aria-label="Playback speed"
          className="rounded-md border border-border bg-panel-2 px-2 py-1 text-xs"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
