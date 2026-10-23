import { createDeepgramProvider } from "./deepgram";
import { ProviderConfigError, type TranscriptionProvider } from "./provider";

type Env = Record<string, string | undefined>;

/** Builds the provider selected by TRANSCRIPTION_PROVIDER (default: deepgram). */
export function getTranscriptionProvider(env: Env = process.env): TranscriptionProvider {
  const name = (env.TRANSCRIPTION_PROVIDER ?? "deepgram").trim().toLowerCase();
  switch (name) {
    case "deepgram": {
      const key = env.DEEPGRAM_API_KEY?.trim();
      if (!key) throw new ProviderConfigError("DEEPGRAM_API_KEY is not set. Add it to .env.local and restart the server.");
      return createDeepgramProvider(key);
    }
    case "assemblyai":
    case "openai":
      throw new ProviderConfigError(`The ${name} provider is not implemented yet. Use TRANSCRIPTION_PROVIDER=deepgram.`);
    default:
      throw new ProviderConfigError(`Unknown TRANSCRIPTION_PROVIDER "${name}".`);
  }
}

export function getTranscriptionLanguage(env: Env = process.env): string {
  return env.TRANSCRIPTION_LANGUAGE?.trim() || "en";
}

export * from "./provider";
