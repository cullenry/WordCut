import { create } from "zustand";
import type { Envelope } from "@/lib/audio/envelope";
import {
  allDeleted,
  applyOp,
  applyTrims,
  deleteOp,
  deletedRunAt,
  invertOp,
  restoreOp,
  sanitizeDeleted,
  type EditOp,
} from "@/lib/edl/edits";
import { buildEdl, type Edl } from "@/lib/edl/edl";
import { emptyHistory, pushHistory, redoHistory, undoHistory, type History } from "@/lib/edl/history";
import { editedToSource, snapToKept, sourceToEdited } from "@/lib/edl/time";
import { sanitizeTrims, trimsToList, type TrimMap } from "@/lib/edl/trims";
import { loadProject, projectIdFor, saveProject, updateProject, type ProjectRecord } from "@/lib/persistence/projects";
import type { VideoMeta } from "@/lib/probe";
import {
  cleanupOp,
  defaultCleanupSettings,
  planCleanup,
  type CleanupPlan,
  type CleanupSettings,
} from "@/lib/transcript/cleanup";
import { buildWordIndex, selectedIds, selectionRange, type Selection } from "@/lib/transcript/selection";
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

/** The cleanup review: what would be removed. Nothing is applied until confirmed. */
export interface CleanupReview {
  settings: CleanupSettings;
  /** Keys of unticked items. Keys are stable across re-detection. */
  excluded: ReadonlySet<string>;
  plan: CleanupPlan;
}

interface EditorState {
  source: Source | null;
  projectId: string | null;
  /** True when the transcript was restored from a previous session. */
  restored: boolean;
  transcript: Transcript | null;
  envelope: Envelope | null;
  transcription: TranscriptionStatus;
  /** Word-range selection in the transcript; ids only, the transcript itself is never touched. */
  selection: Selection | null;
  /** Ids of cut words. Replaced, never mutated, on every edit. */
  deleted: ReadonlySet<string>;
  /** Shortened pauses by the id of the word before the gap. Replaced, never mutated. */
  trims: TrimMap;
  /** Open cleanup review, or null. */
  cleanup: CleanupReview | null;
  /** Kept for the session so the sliders stay where the user left them. */
  cleanupSettings: CleanupSettings;
  /** Undo/redo stacks of edits, newest last. */
  history: History<EditOp>;
  /** Kept source ranges derived from `deleted`; null only without a source. */
  edl: Edl | null;
  /** Playhead in source time. The edited time is sourceToEdited(edl, currentTime). */
  currentTime: number;
  playing: boolean;
  video: HTMLVideoElement | null;
  setSource: (source: Source) => void;
  clearSource: () => void;
  startTranscription: () => Promise<void>;
  cancelTranscription: () => void;
  setSelection: (selection: Selection | null) => void;
  /** Delete key and toolbar: cuts the selection, or restores it if it is all cut already. */
  toggleSelection: () => void;
  /** Restores the run of cut words around word `index` and selects it. */
  restoreRunAt: (index: number) => void;
  openCleanup: () => void;
  closeCleanup: () => void;
  setCleanupSettings: (patch: Partial<CleanupSettings>) => void;
  toggleCleanupItem: (key: string) => void;
  /** Ticks or unticks every item of one kind. */
  setCleanupGroup: (kind: "fillers" | "silences", included: boolean) => void;
  /** Applies the ticked items as one undoable step and closes the review. */
  applyCleanup: () => void;
  undo: () => void;
  redo: () => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  registerVideo: (el: HTMLVideoElement | null) => void;
  /** Seeks to a source time, moving forward out of a cut if it lands in one. */
  seek: (t: number) => void;
  seekEdited: (t: number) => void;
  togglePlay: () => void;
}

let abortCtrl: AbortController | null = null;

const NO_CUTS: ReadonlySet<string> = new Set();
const NO_TRIMS: TrimMap = new Map();
const SAVE_DELAY_MS = 300;

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pendingSave: (() => void) | null = null;

/** Debounced so a burst of edits is one write. */
function scheduleSave(projectId: string, deleted: ReadonlySet<string>, trims: TrimMap) {
  clearTimeout(saveTimer);
  pendingSave = () => {
    pendingSave = null;
    updateProject(projectId, {
      edits: { deletedWordIds: [...deleted], silenceTrims: trimsToList(trims) },
    }).catch((e) =>
      console.warn("Could not save edits", e),
    );
  };
  saveTimer = setTimeout(pendingSave, SAVE_DELAY_MS);
}

/** Writes any edit still waiting on the debounce (on page hide, and before switching project). */
export function flushPendingSave() {
  clearTimeout(saveTimer);
  pendingSave?.();
}

function dropPendingSave() {
  clearTimeout(saveTimer);
  pendingSave = null;
}

function edlFor(
  source: Source | null,
  transcript: Transcript | null,
  deleted: ReadonlySet<string>,
  trims: TrimMap,
): Edl | null {
  return source ? buildEdl(transcript?.words ?? [], deleted, source.meta.duration, { trims }) : null;
}

/**
 * Selects the span an op touched, so undo and redo show what changed. A
 * cleanup touches words all over the transcript, so it selects nothing.
 */
const spanOf = (op: EditOp): Selection | null =>
  op.trims || op.ids.length === 0 ? null : { anchor: op.ids[0], focus: op.ids[op.ids.length - 1] };

function reviewFor(
  transcript: Transcript | null,
  deleted: ReadonlySet<string>,
  trims: TrimMap,
  settings: CleanupSettings,
  excluded: ReadonlySet<string>,
): CleanupReview {
  return { settings, excluded, plan: planCleanup(transcript?.words ?? [], deleted, trims, settings, excluded) };
}

const emptyProjectState = {
  projectId: null,
  restored: false,
  transcript: null,
  envelope: null,
  transcription: { state: "idle" } as TranscriptionStatus,
  selection: null as Selection | null,
  deleted: NO_CUTS,
  trims: NO_TRIMS,
  cleanup: null as CleanupReview | null,
  history: emptyHistory<EditOp>(),
  currentTime: 0,
  playing: false,
};

export const useEditorStore = create<EditorState>((set, get) => {
  /** Applies an edit with the given history (pushed for a new edit, popped for undo/redo) and saves. */
  function commit(op: EditOp, history: History<EditOp>, selection: Selection | null) {
    const { source, transcript, projectId, cleanup } = get();
    const deleted = applyOp(get().deleted, op);
    const trims = applyTrims(get().trims, op);
    set({
      deleted,
      trims,
      history,
      selection,
      edl: edlFor(source, transcript, deleted, trims),
      // An open review describes the old state; refresh it so it never goes stale.
      cleanup: cleanup && reviewFor(transcript, deleted, trims, cleanup.settings, cleanup.excluded),
    });
    if (projectId) scheduleSave(projectId, deleted, trims);
  }

  return {
    source: null,
    video: null,
    edl: null,
    cleanupSettings: defaultCleanupSettings(),
    ...emptyProjectState,

    setSource: (source) => {
      abortCtrl?.abort();
      flushPendingSave();
      const prev = get().source;
      if (prev) URL.revokeObjectURL(prev.url);
      const projectId = projectIdFor(source.file);
      set({ ...emptyProjectState, source, projectId, edl: edlFor(source, null, NO_CUTS, NO_TRIMS) });

      loadProject(projectId)
        .then((saved) => {
          if (saved?.transcript && get().projectId === projectId) {
            const deleted = sanitizeDeleted(saved.transcript.words, saved.edits?.deletedWordIds ?? []);
            const trims = sanitizeTrims(saved.transcript.words, saved.edits?.silenceTrims ?? []);
            set({
              transcript: saved.transcript,
              envelope: saved.envelope,
              restored: true,
              deleted,
              trims,
              edl: edlFor(source, saved.transcript, deleted, trims),
            });
          }
        })
        .catch((e) => console.warn("Could not load saved project", e));
    },

    clearSource: () => {
      abortCtrl?.abort();
      flushPendingSave();
      const prev = get().source;
      if (prev) URL.revokeObjectURL(prev.url);
      set({ ...emptyProjectState, source: null, edl: null });
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
        // Word ids are positional, so cuts made against the old transcript can't carry over.
        dropPendingSave();
        set({
          transcript,
          envelope,
          restored: false,
          selection: null,
          deleted: NO_CUTS,
          trims: NO_TRIMS,
          cleanup: null,
          history: emptyHistory<EditOp>(),
          edl: edlFor(source, transcript, NO_CUTS, NO_TRIMS),
          transcription: { state: "idle" },
        });

        const now = Date.now();
        const record: ProjectRecord = {
          id: projectId,
          fileName: source.file.name,
          fileSize: source.file.size,
          lastModified: source.file.lastModified,
          meta: source.meta,
          transcript,
          envelope,
          edits: { deletedWordIds: [], silenceTrims: [] },
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

    setSelection: (selection) => set({ selection }),

    toggleSelection: () => {
      const { transcript, selection, deleted, history } = get();
      if (!transcript) return;
      const range = selectionRange(selection, buildWordIndex(transcript.words));
      const ids = selectedIds(transcript.words, range);
      if (allDeleted(transcript.words, deleted, range)) {
        const op = restoreOp(deleted, ids);
        if (op) commit(op, pushHistory(history, op), selection);
      } else {
        const op = deleteOp(deleted, ids);
        if (op) commit(op, pushHistory(history, op), null);
      }
    },

    restoreRunAt: (index) => {
      const { transcript, deleted, history } = get();
      if (!transcript) return;
      const run = deletedRunAt(transcript.words, deleted, index);
      const op = restoreOp(deleted, selectedIds(transcript.words, run));
      if (op) commit(op, pushHistory(history, op), spanOf(op));
    },

    openCleanup: () => {
      const { transcript, deleted, trims, cleanupSettings } = get();
      if (transcript) set({ cleanup: reviewFor(transcript, deleted, trims, cleanupSettings, new Set()) });
    },

    closeCleanup: () => set({ cleanup: null }),

    setCleanupSettings: (patch) => {
      const { transcript, deleted, trims, cleanup, cleanupSettings } = get();
      const settings = { ...cleanupSettings, ...patch };
      set({
        cleanupSettings: settings,
        cleanup: cleanup && reviewFor(transcript, deleted, trims, settings, cleanup.excluded),
      });
    },

    toggleCleanupItem: (key) => {
      const { transcript, deleted, trims, cleanup } = get();
      if (!cleanup) return;
      const excluded = new Set(cleanup.excluded);
      if (!excluded.delete(key)) excluded.add(key);
      set({ cleanup: reviewFor(transcript, deleted, trims, cleanup.settings, excluded) });
    },

    setCleanupGroup: (kind, included) => {
      const { transcript, deleted, trims, cleanup } = get();
      if (!cleanup) return;
      const excluded = new Set(cleanup.excluded);
      for (const item of cleanup.plan[kind]) {
        if (included) excluded.delete(item.key);
        else excluded.add(item.key);
      }
      set({ cleanup: reviewFor(transcript, deleted, trims, cleanup.settings, excluded) });
    },

    applyCleanup: () => {
      const { cleanup, history } = get();
      const op = cleanup && cleanupOp(cleanup.plan);
      if (!op) return;
      commit(op, pushHistory(history, op), null);
      set({ cleanup: null });
    },

    undo: () => {
      const step = undoHistory(get().history);
      if (step) commit(invertOp(step.entry), step.history, spanOf(step.entry));
    },

    redo: () => {
      const step = redoHistory(get().history);
      if (step) commit(step.entry, step.history, spanOf(step.entry));
    },

    setCurrentTime: (currentTime) => set({ currentTime }),
    setPlaying: (playing) => set({ playing }),
    registerVideo: (video) => set({ video }),
    seek: (t) => {
      const { video, source, edl } = get();
      if (!video || !source) return;
      let target = Math.min(Math.max(0, t), source.meta.duration);
      if (edl) target = snapToKept(edl, target) ?? edl.ranges[edl.ranges.length - 1]?.end ?? 0;
      video.currentTime = target;
      set({ currentTime: target });
    },
    seekEdited: (t) => {
      const { edl, seek } = get();
      if (edl) seek(editedToSource(edl, t));
    },
    togglePlay: () => {
      const { video, edl } = get();
      if (!video) return;
      if (!video.paused) {
        video.pause();
        return;
      }
      if (edl) {
        if (edl.ranges.length === 0) return; // everything is cut
        // Start on a kept frame so no cut audio leaks out; from the edited end, start over.
        const atEnd = sourceToEdited(edl, video.currentTime) >= edl.duration;
        const from = atEnd ? edl.ranges[0].start : (snapToKept(edl, video.currentTime) ?? edl.ranges[0].start);
        if (from !== video.currentTime) video.currentTime = from;
      }
      void video.play();
    },
  };
});
