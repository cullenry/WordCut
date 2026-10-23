import type { RawWord } from "@/lib/transcript/types";
import { providerHttpError, type ProviderResult, type TranscriptionProvider } from "./provider";

const ENDPOINT = "https://api.deepgram.com/v1/listen";

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

export interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels?: {
      detected_language?: string;
      alternatives?: { words?: DeepgramWord[] }[];
    }[];
  };
}

/** Maps a Deepgram pre-recorded response to provider-neutral words. */
export function normalizeDeepgramResponse(body: DeepgramResponse): ProviderResult {
  const channel = body.results?.channels?.[0];
  const words: RawWord[] = (channel?.alternatives?.[0]?.words ?? []).map((w) => ({
    text: w.punctuated_word ?? w.word,
    start: w.start,
    end: w.end,
    confidence: w.confidence,
    ...(w.speaker !== undefined && { speaker: w.speaker }),
  }));
  const lastEnd = words.at(-1)?.end ?? 0;
  return {
    words,
    duration: body.metadata?.duration ?? lastEnd,
    language: channel?.detected_language,
  };
}

export function createDeepgramProvider(apiKey: string, model = "nova-3"): TranscriptionProvider {
  return {
    name: "deepgram",
    async transcribe({ audio, mimeType, language, signal }) {
      const params = new URLSearchParams({
        model,
        language,
        smart_format: "true",
        punctuate: "true",
        // Keep "um"/"uh" so they can be removed in the editor.
        filler_words: "true",
        diarize: "true",
      });
      const res = await fetch(`${ENDPOINT}?${params}`, {
        method: "POST",
        headers: { Authorization: `Token ${apiKey}`, "Content-Type": mimeType },
        body: audio,
        signal,
      });
      if (!res.ok) throw await providerHttpError(res, "Deepgram", "DEEPGRAM_API_KEY");
      return normalizeDeepgramResponse((await res.json()) as DeepgramResponse);
    },
  };
}
