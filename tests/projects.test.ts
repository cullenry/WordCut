import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  deleteProject,
  loadProject,
  projectIdFor,
  saveProject,
  updateProject,
  type ProjectRecord,
} from "@/lib/persistence/projects";

const record = (id: string): ProjectRecord => ({
  id,
  fileName: "talk.mp4",
  fileSize: 1234,
  lastModified: 1,
  meta: { duration: 60, width: 1920, height: 1080 },
  transcript: {
    words: [{ id: "w0", text: "hi", start: 0, end: 1, confidence: 1 }],
    duration: 60,
    provider: "deepgram",
    createdAt: 1,
  },
  envelope: { frameSeconds: 0.05, rms: new Float32Array([0.1, 0.2]) },
  createdAt: 1,
  updatedAt: 1,
});

describe("projectIdFor", () => {
  it("is stable for the same file and differs when it changes", () => {
    const f = { name: "a.mp4", size: 10, lastModified: 5 };
    expect(projectIdFor(f)).toBe(projectIdFor({ ...f }));
    expect(projectIdFor(f)).not.toBe(projectIdFor({ ...f, size: 11 }));
  });
});

describe("project persistence", () => {
  it("round-trips a project, including the envelope typed array", async () => {
    await saveProject(record("p1"));
    const loaded = await loadProject("p1");
    expect(loaded?.transcript?.words[0].text).toBe("hi");
    expect(loaded?.envelope?.rms).toBeInstanceOf(Float32Array);
    expect(Array.from(loaded!.envelope!.rms)).toEqual([0.10000000149011612, 0.20000000298023224]);
    expect(loaded!.updatedAt).toBeGreaterThan(1);
  });

  it("returns null for unknown projects", async () => {
    expect(await loadProject("missing")).toBeNull();
  });

  it("overwrites on save and deletes", async () => {
    await saveProject(record("p2"));
    await saveProject({ ...record("p2"), fileName: "renamed.mp4" });
    expect((await loadProject("p2"))?.fileName).toBe("renamed.mp4");
    await deleteProject("p2");
    expect(await loadProject("p2")).toBeNull();
  });

  it("patches edits into a saved project, keeping the rest", async () => {
    await saveProject(record("p3"));
    expect(await updateProject("p3", { edits: { deletedWordIds: ["w0"] } })).toBe(true);
    const loaded = await loadProject("p3");
    expect(loaded?.edits).toEqual({ deletedWordIds: ["w0"] });
    expect(loaded?.transcript?.words[0].text).toBe("hi");
    expect(loaded?.id).toBe("p3");
  });

  it("does not create a project when updating an unknown id", async () => {
    expect(await updateProject("nope", { edits: { deletedWordIds: [] } })).toBe(false);
    expect(await loadProject("nope")).toBeNull();
  });
});
