import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyHistory, pushHistory, replaceLastEntry } from "@/lib/edl/history";
import { loadProject, saveProject, type ProjectRecord } from "@/lib/persistence/projects";
import type { Transcript } from "@/lib/transcript/types";
import {
  flushPendingSave,
  selectActiveClip,
  selectPlayEdl,
  useEditorStore,
  type Source,
} from "@/store/editor-store";
import { makeWords } from "./helpers";

// 12 s source. Three sentences with pauses between them.
const words = makeWords([
  ["So", 1, 1.3],
  ["here's", 1.4, 1.8],
  ["the", 1.9, 2.1],
  ["thing", 2.2, 2.6],
  ["Second", 5, 5.4],
  ["part", 5.5, 5.9],
  ["Third", 9, 9.4],
  ["one", 9.5, 9.9],
]);
const transcript: Transcript = { words, duration: 12, provider: "test", createdAt: 0 };
const file = { name: "talk.mp4", size: 1, lastModified: 7 } as File;
const source = { file, url: "blob:x", meta: { duration: 12, width: 1920, height: 1080 } } as Source;
const PROJECT = "talk.mp4:1:7";

const state = () => useEditorStore.getState();
const select = (a: number, b: number) => state().setSelection({ anchor: `w${a}`, focus: `w${b}` });
const names = () => state().clips.map((c) => c.name);

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
    clips: [],
    selectedClipId: null,
    panel: "transcript",
    edl: { ranges: [{ start: 0, end: 12, offset: 0 }], duration: 12, sourceDuration: 12 },
  });
  const record: ProjectRecord = {
    id: PROJECT,
    fileName: file.name,
    fileSize: 1,
    lastModified: 7,
    meta: source.meta,
    transcript,
    envelope: null,
    edits: { deletedWordIds: [] },
    createdAt: 0,
    updatedAt: 0,
  };
  await saveProject(record);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("making clips", () => {
  it("makes a clip from the selected words and selects it", () => {
    select(0, 3);
    const id = state().makeClip();
    expect(id).toBe("clip-1");
    const clip = state().clips[0];
    expect(clip.name).toBe("So here's the thing");
    expect(clip.start).toBeCloseTo(0.88, 6);
    expect(clip.end).toBeCloseTo(2.72, 6);
    expect(clip.cropOffset).toBe(0);
    expect(state().selectedClipId).toBe("clip-1");
    expect(state().history.past).toHaveLength(1);
  });

  it("does nothing without a selection", () => {
    expect(state().makeClip()).toBeNull();
    expect(state().clips).toEqual([]);
    expect(state().history.past).toHaveLength(0);
  });

  it("makes a clip from a single word", () => {
    select(4, 4);
    state().makeClip();
    const clip = state().clips[0];
    expect(clip.end - clip.start).toBeLessThan(0.7);
    expect(clip.name).toBe("Second");
  });

  it("does not make a second copy of the same clip; it selects the existing one", () => {
    select(0, 3);
    state().makeClip();
    select(4, 5);
    state().makeClip();
    select(0, 3);
    expect(state().makeClip()).toBe("clip-1");
    expect(state().clips).toHaveLength(2);
    expect(state().selectedClipId).toBe("clip-1");
    expect(state().history.past).toHaveLength(2);
  });

  it("refuses a range where everything is cut", () => {
    select(4, 5);
    state().toggleSelection(); // cut 'Second part'
    select(4, 5);
    expect(state().makeClip()).toBeNull();
    expect(state().clips).toEqual([]);
  });

  it("names the clip from kept words only, when it starts on a cut word", () => {
    select(0, 1);
    state().toggleSelection(); // cut 'So here's'
    select(0, 3);
    state().makeClip();
    expect(state().clips[0].name).toBe("the thing");
  });
});

describe("clips follow the edits", () => {
  it("a cut inside a clip shortens it; restoring grows it back; the range never changes", () => {
    select(0, 7);
    state().makeClip();
    const { start, end } = state().clips[0];
    state().setPanel("clips");
    const full = selectPlayEdl(state())!.duration;

    select(2, 3);
    state().toggleSelection();
    const cut = selectPlayEdl(state())!.duration;
    expect(cut).toBeLessThan(full - 0.5);
    expect(state().clips[0].start).toBe(start);
    expect(state().clips[0].end).toBe(end);

    state().undo();
    expect(selectPlayEdl(state())!.duration).toBeCloseTo(full, 6);
  });

  it("plays the whole edit outside the clips panel, and the clip inside it", () => {
    select(4, 5);
    state().makeClip();
    expect(selectPlayEdl(state())).toBe(state().edl);
    expect(selectActiveClip(state())).toBeNull();
    state().setPanel("clips");
    const edl = selectPlayEdl(state())!;
    expect(edl).not.toBe(state().edl);
    expect(edl.duration).toBeCloseTo(state().clips[0].end - state().clips[0].start, 6);
    expect(selectPlayEdl(state())).toBe(edl); // memoised
    expect(selectActiveClip(state())?.id).toBe("clip-1");
  });

  it("opening the clips panel selects the first clip", () => {
    select(0, 1);
    state().makeClip();
    select(4, 5);
    state().makeClip();
    state().selectClip(null);
    state().setPanel("clips");
    expect(state().selectedClipId).toBe("clip-1");
  });
});

describe("one undo history for cuts and clips", () => {
  it("undoes and redoes a mix of both, in order", () => {
    select(0, 3);
    state().makeClip(); //                         1: clip
    select(1, 1);
    state().toggleSelection(); //                  2: cut
    state().renameClip("clip-1", "Hook"); //       3: rename
    expect(names()).toEqual(["Hook"]);
    expect(state().deleted.size).toBe(1);

    state().undo(); // rename
    expect(names()).toEqual(["So here's the thing"]);
    expect(state().deleted.size).toBe(1);
    state().undo(); // cut
    expect(state().deleted.size).toBe(0);
    expect(state().clips).toHaveLength(1);
    state().undo(); // clip
    expect(state().clips).toEqual([]);
    expect(state().selectedClipId).toBeNull();

    state().redo();
    expect(state().clips).toHaveLength(1);
    state().redo();
    state().redo();
    expect(names()).toEqual(["Hook"]);
    expect(state().deleted.size).toBe(1);
  });

  it("deleting a clip selects its neighbour, and undo brings it back in place", () => {
    for (const [a, b] of [[0, 1], [2, 3], [4, 5]] as const) {
      select(a, b);
      state().makeClip();
    }
    state().selectClip("clip-2");
    state().deleteClip("clip-2");
    expect(state().clips.map((c) => c.id)).toEqual(["clip-1", "clip-3"]);
    expect(state().selectedClipId).toBe("clip-3");
    state().undo();
    expect(state().clips.map((c) => c.id)).toEqual(["clip-1", "clip-2", "clip-3"]);
    expect(state().selectedClipId).toBe("clip-2");
  });

  it("deleting the last clip leaves nothing selected", () => {
    select(0, 1);
    state().makeClip();
    state().deleteClip("clip-1");
    expect(state().selectedClipId).toBeNull();
  });

  it("reorders and undoes the reorder", () => {
    for (const [a, b] of [[0, 1], [2, 3], [4, 5]] as const) {
      select(a, b);
      state().makeClip();
    }
    state().moveClip(0, 2);
    expect(state().clips.map((c) => c.id)).toEqual(["clip-2", "clip-3", "clip-1"]);
    state().moveClip(2, 2);
    state().moveClip(5, 0);
    expect(state().history.past).toHaveLength(4); // 3 clips + 1 move
    state().undo();
    expect(state().clips.map((c) => c.id)).toEqual(["clip-1", "clip-2", "clip-3"]);
  });

  it("ignores an empty or unchanged rename", () => {
    select(0, 1);
    state().makeClip();
    const before = state().history.past.length;
    state().renameClip("clip-1", "   ");
    state().renameClip("clip-1", state().clips[0].name);
    expect(state().history.past).toHaveLength(before);
  });

  it("a new clip after an undo clears the redo stack", () => {
    select(0, 1);
    state().makeClip();
    state().undo();
    expect(state().history.future).toHaveLength(1);
    select(4, 5);
    state().makeClip();
    expect(state().history.future).toHaveLength(0);
  });
});

describe("editing a clip", () => {
  it("folds a quick drag of the crop into one undo step", () => {
    select(0, 3);
    state().makeClip();
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    state().editClip("clip-1", { cropOffset: 0.1 });
    now.mockReturnValue(1100);
    state().editClip("clip-1", { cropOffset: 0.4 });
    now.mockReturnValue(1200);
    state().editClip("clip-1", { cropOffset: 0.8 });
    expect(state().clips[0].cropOffset).toBe(0.8);
    expect(state().history.past).toHaveLength(2); // the clip + one crop step
    state().undo();
    expect(state().clips[0].cropOffset).toBe(0);
    state().redo();
    expect(state().clips[0].cropOffset).toBe(0.8);
  });

  it("starts a new undo step after a pause", () => {
    select(0, 3);
    state().makeClip();
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    state().editClip("clip-1", { cropOffset: 0.5 });
    now.mockReturnValue(5000);
    state().editClip("clip-1", { cropOffset: -0.5 });
    expect(state().history.past).toHaveLength(3);
    state().undo();
    expect(state().clips[0].cropOffset).toBe(0.5);
  });

  it("keeps different settings as separate steps", () => {
    select(0, 3);
    state().makeClip();
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    state().editClip("clip-1", { captions: { size: 1.3 } });
    now.mockReturnValue(1100);
    state().editClip("clip-1", { captions: { style: "boxed" } });
    expect(state().history.past).toHaveLength(3);
    state().undo();
    expect(state().clips[0].captions).toMatchObject({ size: 1.3, style: "bold" });
  });

  it("does not merge into the step before an undo", () => {
    select(0, 3);
    state().makeClip();
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    state().editClip("clip-1", { cropOffset: 0.5 });
    now.mockReturnValue(1100);
    state().editClip("clip-1", { cropOffset: 0.9 });
    state().undo();
    now.mockReturnValue(1200);
    state().editClip("clip-1", { cropOffset: -0.3 });
    expect(state().history.past).toHaveLength(2);
    state().undo();
    expect(state().clips[0].cropOffset).toBe(0);
  });

  it("keeps caption settings per clip", () => {
    for (const [a, b] of [[0, 1], [4, 5]] as const) {
      select(a, b);
      state().makeClip();
    }
    state().editClip("clip-2", { captions: { style: "minimal", position: "top", color: "#22d3ee" } });
    expect(state().clips[0].captions.style).toBe("bold");
    expect(state().clips[1].captions).toMatchObject({ style: "minimal", position: "top", color: "#22D3EE" });
  });

  it("ignores edits to a clip that does not exist, and no-op edits", () => {
    select(0, 3);
    state().makeClip();
    state().editClip("nope", { cropOffset: 1 });
    state().editClip("clip-1", { cropOffset: 0 });
    expect(state().history.past).toHaveLength(1);
  });
});

describe("saving clips", () => {
  it("saves clips with the project", async () => {
    select(0, 3);
    state().makeClip();
    state().editClip("clip-1", { cropOffset: -0.6, captions: { style: "boxed" } });
    state().renameClip("clip-1", "Intro");
    flushPendingSave();
    await vi.waitFor(async () => {
      const saved = await loadProject(PROJECT);
      expect(saved?.clips).toHaveLength(1);
      expect(saved?.clips?.[0]).toMatchObject({ name: "Intro", cropOffset: -0.6 });
      expect(saved?.clips?.[0].captions.style).toBe("boxed");
    });
  });

  it("saves cuts and clips made in the same burst", async () => {
    select(0, 3);
    state().makeClip();
    select(5, 5);
    state().toggleSelection();
    flushPendingSave();
    await vi.waitFor(async () => {
      const saved = await loadProject(PROJECT);
      expect(saved?.clips).toHaveLength(1);
      expect(saved?.edits?.deletedWordIds).toEqual(["w5"]);
    });
  });

  it("restores clips when the same file is opened again", async () => {
    select(0, 3);
    state().makeClip();
    state().editClip("clip-1", { cropOffset: 0.25 });
    flushPendingSave();
    await vi.waitFor(async () => expect((await loadProject(PROJECT))?.clips).toHaveLength(1));

    state().clearSource();
    expect(state().clips).toEqual([]);
    state().setSource(source);
    await vi.waitFor(() => expect(state().clips).toHaveLength(1));
    expect(state().clips[0]).toMatchObject({ id: "clip-1", cropOffset: 0.25 });
    expect(state().selectedClipId).toBeNull();
  });

  it("drops damaged saved clips instead of crashing", async () => {
    const saved = (await loadProject(PROJECT))!;
    await saveProject({
      ...saved,
      clips: [{ id: "x", name: "bad", start: 9, end: 3 } as never, { id: "y", name: "ok", start: 1, end: 3 } as never],
    });
    state().clearSource();
    state().setSource(source);
    await vi.waitFor(() => expect(state().clips.map((c) => c.id)).toEqual(["y"]));
  });
});

describe("history helpers", () => {
  it("replaceLastEntry swaps the newest entry and clears redo", () => {
    let h = pushHistory(pushHistory(emptyHistory<string>(), "a"), "b");
    h = { ...h, future: ["z"] };
    expect(replaceLastEntry(h, "B")).toEqual({ past: ["a", "B"], future: [] });
  });
});
