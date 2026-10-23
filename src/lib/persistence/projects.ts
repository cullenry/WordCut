import type { Envelope } from "@/lib/audio/envelope";
import type { VideoMeta } from "@/lib/probe";
import type { Transcript } from "@/lib/transcript/types";

/**
 * A saved project. The video itself is never stored: the user re-opens the
 * same file and it is matched by `id`.
 */
export interface ProjectRecord {
  id: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  meta: VideoMeta;
  transcript: Transcript | null;
  envelope: Envelope | null;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "wordcut";
const DB_VERSION = 1;
const STORE = "projects";

/** Cheap fingerprint that identifies the same file without reading its bytes. */
export function projectIdFor(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export async function loadProject(id: string): Promise<ProjectRecord | null> {
  return (await run("readonly", (s) => s.get(id) as IDBRequest<ProjectRecord | undefined>)) ?? null;
}

export async function saveProject(record: ProjectRecord): Promise<void> {
  await run("readwrite", (s) => s.put({ ...record, updatedAt: Date.now() }));
}

export async function deleteProject(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** Test hook: drops the cached connection so a fresh database can be opened. */
export function resetProjectDbForTests(): void {
  dbPromise = null;
}
