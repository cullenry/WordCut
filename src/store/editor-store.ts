import { create } from "zustand";
import type { Envelope } from "@/lib/audio/envelope";
import { loadProject, projectIdFor, saveProject, type ProjectRecord } from "@/lib/persistence/projects";
import type { VideoMeta } from "@/lib/probe";
import type { Transcript } from "@/lib/transcript/types";
import { transcribeFile, type TranscribeProgress } from "@/lib/transcription/transcribe";

export interface Source {
  file: File;
  url: string;
  meta: VideoMeta;
}

export type TranscriptionStatus =
  | { state: "idle" }
  | { state: "running"; progress: TranscribeProgress }
  | { state: "error"; message: string };

interface EditorState {
  source: Source | null;
  projectId: string | null;
  /** True when the transcript was restored from a previous session. */
  restored: boolean;
  transcript: Transcript | null;
  envelope: Envelope | null;
  transcription: TranscriptionStatus;
  currentTime: number;
  playing: boolean;
  video: HTMLVideoElement | null;
  setSource: (source: Source) => void;
  clearSource: () => void;
  startTranscription: () => Promise<void>;
  cancelTranscription: () => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  registerVideo: (el: HTMLVideoElement | null) => void;
  seek: (t: number) => void;
  togglePlay: () => void;
}

let abortCtrl: AbortController | null = null;

const emptyProjectState = {
  projectId: null,
  restored: false,
  transcript: null,
  envelope: null,
  transcription: { state: "idle" } as TranscriptionStatus,
  currentTime: 0,
  playing: false,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  source: null,
  video: null,
  ...emptyProjectState,

  setSource: (source) => {
    abortCtrl?.abort();
    const prev = get().source;
    if (prev) URL.revokeObjectURL(prev.url);
    const projectId = projectIdFor(source.file);
    set({ ...emptyProjectState, source, projectId });

    loadProject(projectId)
      .then((saved) => {
        if (saved?.transcript && get().projectId === projectId) {
          set({ transcript: saved.transcript, envelope: saved.envelope, restored: true });
        }
      })
      .catch((e) => console.warn("Could not load saved project", e));
  },

  clearSource: () => {
    abortCtrl?.abort();
    const prev = get().source;
    if (prev) URL.revokeObjectURL(prev.url);
    set({ ...emptyProjectState, source: null });
  },

  startTranscription: async () => {
    const { source, projectId } = get();
    if (!source || !projectId || get().transcription.state === "running") return;
    abortCtrl?.abort();
    const ctrl = (abortCtrl = new AbortController());
    set({ transcription: { state: "running", progress: { phase: "analyzing", fraction: 0 } } });

    try {
      const { transcript, envelope } = await transcribeFile(source.file, {
        signal: ctrl.signal,
        audioFormat: process.env.NEXT_PUBLIC_TRANSCRIBE_AUDIO === "wav" ? "wav" : "opus",
        onProgress: (progress) => {
          if (get().projectId === projectId) set({ transcription: { state: "running", progress } });
        },
      });
      if (get().projectId !== projectId) return;
      set({ transcript, envelope, restored: false, transcription: { state: "idle" } });

      const now = Date.now();
      const record: ProjectRecord = {
        id: projectId,
        fileName: source.file.name,
        fileSize: source.file.size,
        lastModified: source.file.lastModified,
        meta: source.meta,
        transcript,
        envelope,
        createdAt: (await loadProject(projectId).catch(() => null))?.createdAt ?? now,
        updatedAt: now,
      };
      await saveProject(record).catch((e) => console.warn("Could not save project", e));
    } catch (e) {
      if (ctrl.signal.aborted || get().projectId !== projectId) {
        set({ transcription: { state: "idle" } });
        return;
      }
      console.error(e);
      set({
        transcription: {
          state: "error",
          message: e instanceof Error ? e.message : "Transcription failed.",
        },
      });
    } finally {
      if (abortCtrl === ctrl) abortCtrl = null;
    }
  },

  cancelTranscription: () => {
    abortCtrl?.abort();
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
