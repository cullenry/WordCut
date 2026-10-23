import { create } from "zustand";
import type { Envelope } from "@/lib/audio/envelope";
import {
  applyClipOp,
  cleanClipName,
  defaultClipName,
  editOp,
  invertClipOp,
  isClipOp,
  mergeClipEdits,
  nextClipId,
  sanitizeClips,
  type ClipOp,
} from "@/lib/clips/ops";
import { clipEdl, planClip } from "@/lib/clips/range";
import { MIN_CLIP_DURATION, newClip, type Clip, type ClipPatch } from "@/lib/clips/types";
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
import { emptyHistory, pushHistory, redoHistory, replaceLastEntry, undoHistory, type History } from "@/lib/edl/history";
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

/** One step of the shared undo history: a change to the cuts or to the clips. */
export type HistoryEntry = EditOp | ClipOp;

/** Which side panel is showing. In "clips", the left pane previews the selected clip in 9:16. */
export type Panel = "transcript" | "clips";

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
  /** Undo/redo stacks of edits and clip changes, newest last. */
  history: History<HistoryEntry>;
  /** Clips in list order. Replaced, never mutated, on every change. */
  clips: readonly Clip[];
  selectedClipId: string | null;
  panel: Panel;
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
  setPanel: (panel: Panel) => void;
  /** Makes a clip from the selected words (selecting the existing one if it is already there). Returns its id, or null. */
  makeClip: () => string | null;
  selectClip: (id: string | null) => void;
  renameClip: (id: string, name: string) => void;
  deleteClip: (id: string) => void;
  /** Moves the clip at index `from` so it ends up at index `to`. */
  moveClip: (from: number, to: number) => void;
  /** Changes a clip's crop or captions. A burst of changes to the same fields undoes as one step. */
  editClip: (id: string, patch: ClipPatch) => void;
  undo: () => void;
  redo: () => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  registerVideo: (el: HTMLVideoElement | null) => void;
  /** Seeks to a source time, moving forward out of a cut if it lands in one. */
  seek: (t: number) => void;
  seekEdited: (t: number) => void;
  /** Seeks by time on the playback timeline: the clip's own time in clip view, else the edited video's. */
  seekPlayEdited: (t: number) => void;
  togglePlay: () => void;
}

let abortCtrl: AbortController | null = null;

const NO_CUTS: ReadonlySet<string> = new Set();
const NO_TRIMS: TrimMap = new Map();
const SAVE_DELAY_MS = 300;

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pendingSave: (() => void) | null = null;
let pendingPatch: Partial<ProjectRecord> = {};

/** Debounced so a burst of changes is one write. Patches queued within the delay are merged. */
function scheduleSave(projectId: string, patch: Partial<ProjectRecord>) {
  clearTimeout(saveTimer);
  pendingPatch = { ...pendingPatch, ...patch };
  pendingSave = () => {
    const toWrite = pendingPatch;
    pendingPatch = {};
    pendingSave = null;
    updateProject(projectId, toWrite).catch((e) => console.warn("Could not save project", e));
  };
  saveTimer = setTimeout(pendingSave, SAVE_DELAY_MS);
}

const editsPatch = (deleted: ReadonlySet<string>, trims: TrimMap): Partial<ProjectRecord> => ({
  edits: { deletedWordIds: [...deleted], silenceTrims: trimsToList(trims) },
});

/** Writes any change still waiting on the debounce (on page hide, and before switching project). */
export function flushPendingSave() {
  clearTimeout(saveTimer);
  pendingSave?.();
}

/** Forgets queued cut edits (their word ids are stale after a new transcript); a queued clip save stays. */
function dropPendingEdits() {
  delete pendingPatch.edits;
  if (Object.keys(pendingPatch).length === 0) {
    clearTimeout(saveTimer);
    pendingSave = null;
  }
}

/** Edits to one clip within this long of the last one are folded into a single undo step. */
const COALESCE_MS = 700;
let lastClipEditAt = 0;

let playMemo: { edl: Edl; start: number; end: number; out: Edl } | null = null;

/** The clip being previewed, or null outside the clips panel. */
export function selectActiveClip(s: Pick<EditorState, "panel" | "clips" | "selectedClipId">): Clip | null {
  return s.panel === "clips" ? (s.clips.find((c) => c.id === s.selectedClipId) ?? null) : null;
}

/**
 * The EDL playback follows: the selected clip's own EDL (times from the clip's
 * start) in clip view, else the whole edit. Memoised, so it is the same object
 * until the edits or the clip's range change.
 */
export function selectPlayEdl(s: Pick<EditorState, "edl" | "panel" | "clips" | "selectedClipId">): Edl | null {
  const clip = selectActiveClip(s);
  if (!s.edl || !clip) return s.edl;
  if (playMemo && playMemo.edl === s.edl && playMemo.start === clip.start && playMemo.end === clip.end) return playMemo.out;
  const out = clipEdl(s.edl, clip.start, clip.end);
  playMemo = { edl: s.edl, start: clip.start, end: clip.end, out };
  return out;
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
  history: emptyHistory<HistoryEntry>(),
  clips: [] as readonly Clip[],
  selectedClipId: null as string | null,
  panel: "transcript" as Panel,
  currentTime: 0,
  playing: false,
};

export const useEditorStore = create<EditorState>((set, get) => {
  /** Applies an edit with the given history (pushed for a new edit, popped for undo/redo) and saves. */
  function commit(op: EditOp, history: History<HistoryEntry>, selection: Selection | null) {
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
    if (projectId) scheduleSave(projectId, editsPatch(deleted, trims));
  }

  /** Applies a clip change with the given history and saves. */
  function commitClip(op: ClipOp, history: History<HistoryEntry>) {
    const { clips: before, selectedClipId, projectId, panel } = get();
    const clips = applyClipOp(before, op);
    let selected = selectedClipId;
    if (op.kind === "clip-insert") selected = op.clip.id;
    else if (op.kind === "clip-remove" && selectedClipId === op.clip.id) {
      selected = clips[Math.min(op.index, clips.length - 1)]?.id ?? null;
    }
    set({ clips, history, selectedClipId: selected });
    if (projectId) scheduleSave(projectId, { clips: [...clips] });
    // The preview follows the selection: land on the start of whichever clip it moved to.
    if (panel === "clips" && selected !== selectedClipId) {
      const next = clips.find((c) => c.id === selected);
      if (next) get().seek(next.start);
    }
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
              clips: sanitizeClips(saved.clips, source.meta.duration),
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
        dropPendingEdits();
        set({
          transcript,
          envelope,
          restored: false,
          selection: null,
          deleted: NO_CUTS,
          trims: NO_TRIMS,
          cleanup: null,
          // Clips are source-time ranges, so they survive a new transcript; the history that
          // refers to old word ids does not.
          history: emptyHistory<HistoryEntry>(),
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
          clips: [...get().clips],
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

    setPanel: (panel) => {
      if (panel === get().panel) return;
      get().video?.pause();
      const { clips, selectedClipId } = get();
      const target = panel === "clips" ? (clips.find((c) => c.id === selectedClipId) ?? clips[0]) : undefined;
      set({ panel, selectedClipId: target?.id ?? selectedClipId });
      if (target) get().seek(target.start);
    },

    makeClip: () => {
      const { transcript, selection, edl, clips, history, deleted } = get();
      if (!transcript || !edl) return null;
      const range = selectionRange(selection, buildWordIndex(transcript.words));
      if (!range) return null;
      const plan = planClip(transcript.words, range, edl);
      if (plan.duration < MIN_CLIP_DURATION) return null;
      const existing = clips.find((c) => c.start === plan.start && c.end === plan.end);
      if (existing) {
        set({ selectedClipId: existing.id });
        return existing.id;
      }
      const spoken = transcript.words.slice(range.start, range.end + 1).filter((w) => !deleted.has(w.id));
      const clip = newClip({
        id: nextClipId(clips),
        name: defaultClipName(spoken, clips),
        start: plan.start,
        end: plan.end,
      });
      const op: ClipOp = { kind: "clip-insert", clip, index: clips.length };
      lastClipEditAt = 0;
      commitClip(op, pushHistory(history, op));
      return clip.id;
    },

    selectClip: (id) => {
      const { clips, selectedClipId, panel } = get();
      const clip = id ? clips.find((c) => c.id === id) : undefined;
      if ((clip?.id ?? null) === selectedClipId) return;
      set({ selectedClipId: clip?.id ?? null });
      if (clip && panel === "clips") get().seek(clip.start);
    },

    renameClip: (id, name) => {
      const { clips, history } = get();
      const clip = clips.find((c) => c.id === id);
      const after = cleanClipName(name);
      if (!clip || after === null || after === clip.name) return;
      const op: ClipOp = { kind: "clip-rename", id, before: clip.name, after };
      lastClipEditAt = 0;
      commitClip(op, pushHistory(history, op));
    },

    deleteClip: (id) => {
      const { clips, history } = get();
      const index = clips.findIndex((c) => c.id === id);
      if (index < 0) return;
      const op: ClipOp = { kind: "clip-remove", clip: clips[index], index };
      lastClipEditAt = 0;
      commitClip(op, pushHistory(history, op));
    },

    moveClip: (from, to) => {
      const { clips, history } = get();
      if (from === to || !clips[from] || to < 0 || to >= clips.length) return;
      const op: ClipOp = { kind: "clip-move", id: clips[from].id, from, to };
      lastClipEditAt = 0;
      commitClip(op, pushHistory(history, op));
    },

    editClip: (id, patch) => {
      const { clips, history } = get();
      const clip = clips.find((c) => c.id === id);
      const op = clip && editOp(clip, patch);
      if (!op) return;
      const now = performance.now();
      const last = history.past[history.past.length - 1];
      const merged = last && isClipOp(last) && now - lastClipEditAt < COALESCE_MS ? mergeClipEdits(last, op) : null;
      lastClipEditAt = now;
      commitClip(op, merged ? replaceLastEntry(history, merged) : pushHistory(history, op));
    },

    undo: () => {
      const step = undoHistory(get().history);
      if (!step) return;
      lastClipEditAt = 0;
      if (isClipOp(step.entry)) commitClip(invertClipOp(step.entry), step.history);
      else commit(invertOp(step.entry), step.history, spanOf(step.entry));
    },

    redo: () => {
      const step = redoHistory(get().history);
      if (!step) return;
      lastClipEditAt = 0;
      if (isClipOp(step.entry)) commitClip(step.entry, step.history);
      else commit(step.entry, step.history, spanOf(step.entry));
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
    seekPlayEdited: (t) => {
      const edl = selectPlayEdl(get());
      if (edl) get().seek(editedToSource(edl, t));
    },
    togglePlay: () => {
      const { video } = get();
      if (!video) return;
      const edl = selectPlayEdl(get());
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
