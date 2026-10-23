import type { RawWord } from "@/lib/transcript/types";
import { baseMimeType, providerHttpError, type ProviderResult, type TranscriptionProvider } from "./provider";

const ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
/** OpenAI picks the decoder from the file name, so the upload needs the right extension. */
const EXTENSIONS: Record<string, string> = { "audio/ogg": "ogg", "audio/webm": "webm", "audio/wav": "wav" };
/**
 * OpenAI's suggested prompt for keeping hesitations in the transcript. It helps
 * a little; Whisper still drops many fillers. English only, since the prompt
 * should match the audio language.
 */
const FILLER_PROMPT = "Umm, let me think like, hmm... Okay, here's what I'm, like, thinking.";
/** How far ahead in the text to look for a word's punctuated form. */
const LOOKAHEAD = 4;

interface OpenAIWord {
  word: string;
  start: number;
  end: number;
}

export interface OpenAIVerboseResponse {
  /** A language name such as "english", not a code. */
  language?: string;
  duration?: number;
  text?: string;
  words?: OpenAIWord[];
}

/** Lowercase letters and digits only, for matching a bare word to a punctuated token. */
const bare = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Whisper's word timestamps come without punctuation ("hello", not "Hello,").
 * The full text has it, so walk its tokens in step with the words and take the
 * punctuated form of each one that matches. Words that don't match keep their bare text.
 */
export function punctuateWords(text: string, words: string[]): string[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  let next = 0;
  return words.map((word) => {
    const key = bare(word);
    if (key) {
      for (let i = next; i < Math.min(tokens.length, next + LOOKAHEAD); i++) {
        if (bare(tokens[i]) === key) {
          next = i + 1;
          return tokens[i];
        }
      }
    }
    return word.trim();
  });
}

/** Maps a Whisper verbose_json response to provider-neutral words. */
export function normalizeOpenAIResponse(body: OpenAIVerboseResponse, language?: string): ProviderResult {
  const raw = body.words ?? [];
  const texts = punctuateWords(body.text ?? "", raw.map((w) => w.word));
  const words: RawWord[] = raw
    // Whisper reports no per-word confidence and no speakers.
    .map((w, i) => ({ text: texts[i], start: w.start, end: w.end, confidence: 1 }))
    .filter((w) => w.text);
  const lastEnd = words.at(-1)?.end ?? 0;
  return { words, duration: body.duration ?? lastEnd, language };
}

/** Word timestamps need whisper-1; the gpt-4o transcribe models only return plain text. */
export function createOpenAIProvider(apiKey: string, model = "whisper-1"): TranscriptionProvider {
  return {
    name: "openai",
    async transcribe({ audio, mimeType, language, signal }) {
      const type = baseMimeType(mimeType);
      const form = new FormData();
      form.append("file", new Blob([audio], { type }), `audio.${EXTENSIONS[type] ?? "ogg"}`);
      form.append("model", model);
      form.append("language", language);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      if (language.startsWith("en")) form.append("prompt", FILLER_PROMPT);

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal,
      });
      if (!res.ok) throw await providerHttpError(res, "OpenAI", "OPENAI_API_KEY");
      // The response names the language ("english"); report the code it was asked for instead.
      return normalizeOpenAIResponse((await res.json()) as OpenAIVerboseResponse, language);
    },
  };
}
