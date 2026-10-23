import { delay } from "@/lib/async";
import type { RawWord } from "@/lib/transcript/types";
import { ProviderError, providerHttpError, type ProviderResult, type TranscriptionProvider } from "./provider";

const API = "https://api.assemblyai.com/v2";
const KEY_ENV = "ASSEMBLYAI_API_KEY";

interface AssemblyAIWord {
  text: string;
  /** Milliseconds. */
  start: number;
  end: number;
  confidence: number;
  /** "A", "B", ... when speaker_labels is on, otherwise null. */
  speaker?: string | null;
}

export interface AssemblyAITranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  words?: AssemblyAIWord[] | null;
  /** Whole seconds. */
  audio_duration?: number | null;
  /** e.g. "en_us". */
  language_code?: string | null;
}

/** Maps a completed AssemblyAI transcript to provider-neutral words. */
export function normalizeAssemblyAIResponse(body: AssemblyAITranscript): ProviderResult {
  // Speakers are lettered; number them from 0 in order of appearance, like Deepgram.
  const speakers = new Map<string, number>();
  const words: RawWord[] = (body.words ?? []).map((w) => {
    if (w.speaker != null && !speakers.has(w.speaker)) speakers.set(w.speaker, speakers.size);
    return {
      text: w.text,
      start: w.start / 1000,
      end: w.end / 1000,
      confidence: w.confidence,
      ...(w.speaker != null && { speaker: speakers.get(w.speaker) }),
    };
  });
  const lastEnd = words.at(-1)?.end ?? 0;
  return {
    words,
    duration: body.audio_duration ?? lastEnd,
    language: body.language_code?.split("_")[0] || undefined,
  };
}

export interface AssemblyAIOptions {
  pollMs?: number;
  /** Give up before the route's maxDuration, so the client gets a clear error rather than a dropped request. */
  timeoutMs?: number;
}

/**
 * AssemblyAI is asynchronous: upload the audio, submit a job, poll until it
 * finishes, then delete the job so the audio isn't kept on their servers.
 */
export function createAssemblyAIProvider(
  apiKey: string,
  { pollMs = 1500, timeoutMs = 270_000 }: AssemblyAIOptions = {},
): TranscriptionProvider {
  async function call<T>(path: string, init: { method?: string; body?: BodyInit; json?: unknown; signal?: AbortSignal }) {
    const res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: apiKey,
        ...(init.json !== undefined && { "Content-Type": "application/json" }),
        ...(init.body !== undefined && { "Content-Type": "application/octet-stream" }),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      signal: init.signal,
    });
    if (!res.ok) throw await providerHttpError(res, "AssemblyAI", KEY_ENV);
    return (await res.json()) as T;
  }

  return {
    name: "assemblyai",
    async transcribe({ audio, language, signal }) {
      const { upload_url } = await call<{ upload_url: string }>("/upload", { method: "POST", body: audio, signal });
      let job = await call<AssemblyAITranscript>("/transcript", {
        method: "POST",
        json: {
          audio_url: upload_url,
          language_code: language,
          punctuate: true,
          format_text: true,
          // Keep "um"/"uh" so they can be removed in the editor. AssemblyAI drops them by default.
          disfluencies: true,
          speaker_labels: true,
        },
        signal,
      });

      try {
        const deadline = Date.now() + timeoutMs;
        while (job.status === "queued" || job.status === "processing") {
          if (Date.now() > deadline) throw new ProviderError("AssemblyAI took too long to transcribe this chunk.", 504);
          await delay(pollMs, signal);
          job = await call<AssemblyAITranscript>(`/transcript/${job.id}`, { signal });
        }
        if (job.status === "error") {
          throw new ProviderError(`AssemblyAI could not transcribe this audio: ${job.error ?? "unknown error"}`, 422);
        }
        return normalizeAssemblyAIResponse(job);
      } finally {
        // Deleting the transcript also deletes the uploaded audio. Best effort; never fails the request.
        void fetch(`${API}/transcript/${job.id}`, { method: "DELETE", headers: { Authorization: apiKey } }).catch(
          () => {},
        );
      }
    },
  };
}
