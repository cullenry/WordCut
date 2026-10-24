"use client";

import { useCallback, useEffect, useRef } from "react";
import { playbackJump, secondsUntilJump, sourceToEdited } from "@/lib/edl/time";
import { formatTime } from "@/lib/format";
import { selectActiveClip, selectPlayEdl, useEditorStore } from "@/store/editor-store";
import { ClipStage } from "./ClipStage";

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
  // In clip view playback, the seek bar and the time readout all run on the selected clip's own timeline.
  const edl = useEditorStore(selectPlayEdl)!;
  const clip = useEditorStore(selectActiveClip);
  const { setCurrentTime, setPlaying, registerVideo, seekPlayEdited, togglePlay } = useEditorStore.getState();
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
    const edl = selectPlayEdl(useEditorStore.getState());
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
      <div className="relative grid min-h-0 flex-1 place-items-center bg-paper-2 p-2">
        {clip && <ClipStage />}
        {/* Stays mounted in clip view: it is the picture the 9:16 canvas is drawn from. */}
        <video
          ref={videoRef}
          src={source.url}
          className={clip ? "pointer-events-none absolute h-px w-px opacity-0" : "max-h-full max-w-full"}
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

      <div className="flex items-center gap-3 border-t border-rule px-4 py-2.5">
        <button
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-sm text-paper hover:bg-ink/85"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="w-32 shrink-0 font-label text-[11px] text-ink-2">
          {formatTime(editedTime)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={editedTime}
          onChange={(e) => seekPlayEdited(Number(e.target.value))}
          disabled={duration === 0}
          aria-label="Seek"
          className="h-1 flex-1 accent-ink"
        />
        <select
          defaultValue={1}
          onChange={(e) => {
            rateRef.current = Number(e.target.value);
            if (videoRef.current) videoRef.current.playbackRate = rateRef.current;
          }}
          aria-label="Playback speed"
          className="rounded-full border border-rule bg-paper px-2 py-1 font-label text-[11px]"
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
