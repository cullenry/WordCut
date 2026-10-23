"use client";

import { useCallback, useEffect, useRef } from "react";
import { playbackJump, secondsUntilJump, sourceToEdited } from "@/lib/edl/time";
import { formatTime } from "@/lib/format";
import { useEditorStore } from "@/store/editor-store";

const SPEEDS = [0.5, 1, 1.5, 2];
/**
 * How far ahead of a cut (in wall-clock seconds) playback jumps over it. The
 * playhead is only checked once a frame and a seek takes a moment to land, so
 * jumping a little early means none of the cut word is heard. Cuts sit inside
 * pauses (see buildEdl), so jumping early only trims silence.
 */
const SKIP_LOOKAHEAD = 0.03;

export function VideoPreview() {
  const source = useEditorStore((s) => s.source)!;
  const currentTime = useEditorStore((s) => s.currentTime);
  const playing = useEditorStore((s) => s.playing);
  const edl = useEditorStore((s) => s.edl)!;
  const { setCurrentTime, setPlaying, registerVideo, seekEdited, togglePlay } = useEditorStore.getState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rateRef = useRef(1);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    registerVideo(videoRef.current);
    return () => registerVideo(null);
  }, [registerVideo, source.url]);

  /** Updates the playhead and skips the cuts. Reads the EDL fresh so edits apply mid-playback. */
  const follow = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const { edl } = useEditorStore.getState();
    const lookahead = SKIP_LOOKAHEAD * el.playbackRate;
    const jump = edl && !el.paused ? playbackJump(edl, el.currentTime, lookahead) : null;
    if (jump === "end") {
      el.pause();
      const last = edl!.ranges[edl!.ranges.length - 1];
      if (last) el.currentTime = last.end;
    } else if (jump !== null) {
      el.currentTime = jump;
    }
    setCurrentTime(el.currentTime);

    // rAF is throttled when the window is hidden or covered; a timer aimed at the
    // next cut still lands on time. If it fires early it just re-aims.
    clearTimeout(timerRef.current);
    const wait = edl && !el.paused ? secondsUntilJump(edl, el.currentTime, lookahead) : null;
    if (wait !== null) timerRef.current = setTimeout(follow, (wait / el.playbackRate) * 1000);
  }, [setCurrentTime]);

  // Check every frame while playing, not just on timeupdate (4Hz), so cuts are skipped promptly.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      follow();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timerRef.current);
    };
  }, [playing, follow]);

  const duration = edl.duration;
  const editedTime = sourceToEdited(edl, currentTime);

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
          // Backstop for background tabs, where rAF stops and timers are slowed.
          onTimeUpdate={follow}
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
          {formatTime(editedTime)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={editedTime}
          onChange={(e) => seekEdited(Number(e.target.value))}
          disabled={duration === 0}
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
