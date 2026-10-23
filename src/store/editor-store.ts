import { create } from "zustand";
import type { VideoMeta } from "@/lib/probe";

export interface Source {
  file: File;
  url: string;
  meta: VideoMeta;
}

interface EditorState {
  source: Source | null;
  currentTime: number;
  playing: boolean;
  video: HTMLVideoElement | null;
  setSource: (source: Source) => void;
  clearSource: () => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  registerVideo: (el: HTMLVideoElement | null) => void;
  seek: (t: number) => void;
  togglePlay: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  source: null,
  currentTime: 0,
  playing: false,
  video: null,
  setSource: (source) => {
    const prev = get().source;
    if (prev) URL.revokeObjectURL(prev.url);
    set({ source, currentTime: 0, playing: false });
  },
  clearSource: () => {
    const prev = get().source;
    if (prev) URL.revokeObjectURL(prev.url);
    set({ source: null, currentTime: 0, playing: false });
  },
  setCurrentTime: (currentTime) => set({ currentTime }),
  setPlaying: (playing) => set({ playing }),
  registerVideo: (video) => set({ video }),
  seek: (t) => {
    const { video, source } = get();
    if (!video || !source) return;
    const clamped = Math.min(Math.max(0, t), source.meta.duration);
    video.currentTime = clamped;
    set({ currentTime: clamped });
  },
  togglePlay: () => {
    const { video } = get();
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  },
}));
