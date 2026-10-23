import { createLimiter, delay } from "@/lib/async";
import { chunkLimitsFor, planChunks } from "@/lib/audio/chunks";
import type { Envelope } from "@/lib/audio/envelope";
import { computeEnvelope, encodeChunk, openAudio, pickChunkFormat } from "@/lib/audio/extract";
import type { RawWord, Transcript } from "@/lib/transcript/types";
import { stitchChunks, type ChunkResult } from "./stitch";

/** Response body of POST /api/transcribe. */
export interface TranscribeResponse {
  words: RawWord[];
  duration: number;
  language?: string;
  provider: string;
}

export type TranscribeProgress =
  | { phase: "analyzing"; fraction: number }
  | { phase: "transcribing"; done: number; total: number };

export class TranscriptionError extends Error {}

export interface TranscribeOptions {
  onProgress?: (p: TranscribeProgress) => void;
  signal?: AbortSignal;
  endpoint?: string;
  concurrency?: number;
  audioFormat?: "opus" | "wav";
}

/**
 * Full pipeline: analyse loudness, split at silences, encode each chunk to
 * small mono audio, upload chunks in parallel, and stitch the results.
 * Only encoded audio leaves the browser.
 */
export async function transcribeFile(
  file: File,
  { onProgress, signal, endpoint = "/api/transcribe", concurrency = 3, audioFormat }: TranscribeOptions = {},
): Promise<{ transcript: Transcript; envelope: Envelope }> {
  const { input, track, duration } = await openAudio(file);
  // Fail fast on the first error and stop everything else in flight.
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const envelope = await computeEnvelope(
      track,
      duration,
      (fraction) => onProgress?.({ phase: "analyzing", fraction }),
      ctrl.signal,
    );
    const format = await pickChunkFormat(audioFormat);
    const plan = planChunks(envelope, duration, chunkLimitsFor(format.bytesPerSecond));

    let done = 0;
    let provider = "";
    let language: string | undefined;
    onProgress?.({ phase: "transcribing", done, total: plan.length });

    const limit = createLimiter(concurrency);
    const tasks: Promise<ChunkResult>[] = [];
    // Encode sequentially (one decoder at a time), upload in parallel.
    for (const range of plan) {
      ctrl.signal.throwIfAborted();
      const blob = await encodeChunk(input, range, format, ctrl.signal);
      const task = limit(async () => {
        const res = await uploadChunk(endpoint, blob, ctrl.signal);
        provider = res.provider;
        language ??= res.language;
        done++;
        onProgress?.({ phase: "transcribing", done, total: plan.length });
        return { ...range, words: res.words };
      });
      task.catch((e) => ctrl.abort(e));
      tasks.push(task);
    }
    const results = await Promise.all(tasks);

    return {
      envelope,
      transcript: {
        words: stitchChunks(results),
        duration,
        language,
        provider,
        createdAt: Date.now(),
      },
    };
  } catch (e) {
    ctrl.abort(e);
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    input.dispose();
  }
}

const MAX_ATTEMPTS = 3;

async function uploadChunk(endpoint: string, blob: Blob, signal: AbortSignal): Promise<TranscribeResponse> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": blob.type },
        body: blob,
        signal,
      });
    } catch (e) {
      if (signal.aborted || attempt >= MAX_ATTEMPTS) {
        throw signal.aborted ? e : new TranscriptionError("Network error while uploading audio.");
      }
      await delay(1000 * attempt, signal);
      continue;
    }
    if (res.ok) return (await res.json()) as TranscribeResponse;

    const message = await res
      .json()
      .then((b: { error?: string }) => b.error)
      .catch(() => undefined);
    // 500 means misconfiguration (e.g. missing API key); retrying won't help.
    const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new TranscriptionError(message ?? `Transcription failed (HTTP ${res.status}).`);
    }
    await delay(1000 * attempt, signal);
  }
}
