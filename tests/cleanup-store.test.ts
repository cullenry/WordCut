import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { loadProject, saveProject, type ProjectRecord } from "@/lib/persistence/projects";
import type { Transcript } from "@/lib/transcript/types";
import { flushPendingSave, useEditorStore, type Source } from "@/store/editor-store";
import { makeWords } from "./helpers";

// Um, long pause, "so uh it was", long pause, "fine um"
const words = makeWords([
  ["Um,", 0, 0.3],
  ["so", 2.3, 2.6],
  ["uh", 2.7, 2.9],
  ["it", 3, 3.2],
  ["was", 5.5, 5.8],
  ["fine", 5.9, 6.3],
  ["um", 6.4, 6.7],
]);
const transcript: Transcript = { words, duration: 8, provider: "test", createdAt: 0 };
const file = { name: "talk.mp4", size: 1, lastModified: 1 } as File;
const source = { file, url: "blob:x", meta: { duration: 8, width: 1, height: 1 } } as Source;
const PROJECT = "talk.mp4:1:1";

const state = () => useEditorStore.getState();
const edited = () => state().edl!.duration;

beforeEach(async () => {
  useEditorStore.setState({
    source,
    transcript,
    projectId: PROJECT,
    deleted: new Set(),
    trims: new Map(),
    cleanup: null,
    selection: null,
    history: { past: [], future: [] },
    edl: { ranges: [{ start: 0, end: 8, offset: 0 }], duration: 8, sourceDuration: 8 },
  });
  const record: ProjectRecord = {
    id: PROJECT,
    fileName: file.name,
    fileSize: 1,
    lastModified: 1,
    meta: source.meta,
    transcript,
    envelope: null,
    edits: { deletedWordIds: [] },
    createdAt: 0,
    updatedAt: 0,
  };
  await saveProject(record);
});

describe("cleanup in the editor store", () => {
  it("opening the review changes nothing", () => {
    state().openCleanup();
    expect(state().cleanup!.plan.fillers.map((f) => f.text)).toEqual(["Um,", "uh", "um"]);
    expect(state().cleanup!.plan.silences).toHaveLength(1);
    expect(state().deleted.size).toBe(0);
    expect(state().trims.size).toBe(0);
    expect(state().history.past).toHaveLength(0);
    expect(edited()).toBe(8);
  });

  it("cancelling changes nothing", () => {
    state().openCleanup();
    state().toggleCleanupItem("f:w0");
    state().closeCleanup();
    expect(state().cleanup).toBeNull();
    expect(state().deleted.size).toBe(0);
    expect(state().history.past).toHaveLength(0);
  });

  it("applies fillers as deleted ids and pauses as trims, in one history entry", () => {
    state().openCleanup();
    state().applyCleanup();
    expect([...state().deleted]).toEqual(["w0", "w2", "w6"]);
    expect([...state().trims]).toEqual([["w3", 0.3]]);
    expect(state().history.past).toHaveLength(1);
    expect(state().cleanup).toBeNull();
    expect(edited()).toBeLessThan(8 - 2.5);
    expect(state().transcript!.words).toBe(transcript.words); // never touched
  });

  it("one undo reverts the whole cleanup, and redo reapplies it", () => {
    const before = edited();
    state().openCleanup();
    state().applyCleanup();
    const after = state().edl;

    state().undo();
    expect(state().deleted.size).toBe(0);
    expect(state().trims.size).toBe(0);
    expect(edited()).toBe(before);
    expect(state().history.past).toHaveLength(0);

    state().redo();
    expect([...state().deleted]).toEqual(["w0", "w2", "w6"]);
    expect([...state().trims]).toEqual([["w3", 0.3]]);
    expect(state().edl).toEqual(after);
  });

  it("applies only the ticked items", () => {
    state().openCleanup();
    state().toggleCleanupItem("f:w2");
    state().toggleCleanupItem("s:w3");
    state().applyCleanup();
    expect([...state().deleted]).toEqual(["w0", "w6"]);
    expect(state().trims.size).toBe(0);
  });

  it("does nothing when nothing is ticked", () => {
    state().openCleanup();
    state().setCleanupGroup("fillers", false);
    state().setCleanupGroup("silences", false);
    state().applyCleanup();
    expect(state().history.past).toHaveLength(0);
    expect(state().cleanup).not.toBeNull();
  });

  it("recomputes when settings change, and keeps unticked choices", () => {
    state().openCleanup();
    state().toggleCleanupItem("f:w0");
    state().setCleanupSettings({ threshold: 3 });
    expect(state().cleanup!.plan.silences).toHaveLength(0);
    state().setCleanupSettings({ threshold: 1 });
    expect(state().cleanup!.plan.silences).toHaveLength(1);
    expect(state().cleanup!.plan.fillers[0].included).toBe(false);
  });

  it("a second cleanup finds nothing new, and undo steps back one cleanup at a time", () => {
    state().openCleanup();
    state().applyCleanup();
    state().openCleanup();
    expect(state().cleanup!.plan).toEqual({ fillers: [], silences: [] });
    state().closeCleanup();
    state().undo();
    expect(state().deleted.size).toBe(0);
  });

  it("refreshes an open review when the transcript is edited underneath it", () => {
    state().openCleanup();
    useEditorStore.setState({ selection: { anchor: "w2", focus: "w2" } });
    state().toggleSelection(); // the user deletes "uh" by hand
    expect(state().cleanup!.plan.fillers.map((f) => f.text)).toEqual(["Um,", "um"]);
  });

  it("restores saved trims and cuts when the project is reopened", async () => {
    state().openCleanup();
    state().applyCleanup();
    flushPendingSave();
    await new Promise((r) => setTimeout(r, 50));
    const applied = state().edl;

    useEditorStore.setState({ deleted: new Set(), trims: new Map(), transcript: null });
    state().setSource(source);
    await new Promise((r) => setTimeout(r, 50));
    expect([...state().deleted]).toEqual(["w0", "w2", "w6"]);
    expect([...state().trims]).toEqual([["w3", 0.3]]);
    expect(state().edl).toEqual(applied);
  });

  it("saves trims with the project", async () => {
    state().openCleanup();
    state().applyCleanup();
    flushPendingSave();
    await new Promise((r) => setTimeout(r, 50));
    const saved = await loadProject(PROJECT);
    expect(saved!.edits).toEqual({ deletedWordIds: ["w0", "w2", "w6"], silenceTrims: [{ afterId: "w3", keep: 0.3 }] });
  });
});
