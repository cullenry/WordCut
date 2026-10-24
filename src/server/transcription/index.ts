import { createAssemblyAIProvider } from "./assemblyai";
import { createDeepgramProvider } from "./deepgram";
import { createOpenAIProvider } from "./openai";
import { ProviderConfigError, type TranscriptionProvider } from "./provider";

type Env = Record<string, string | undefined>;

const PROVIDERS = {
  deepgram: { keyEnv: "DEEPGRAM_API_KEY", create: (key: string) => createDeepgramProvider(key) },
  assemblyai: { keyEnv: "ASSEMBLYAI_API_KEY", create: (key: string) => createAssemblyAIProvider(key) },
  openai: { keyEnv: "OPENAI_API_KEY", create: (key: string) => createOpenAIProvider(key) },
} as const;

/** Builds the provider selected by TRANSCRIPTION_PROVIDER (default: deepgram). */
export function getTranscriptionProvider(env: Env = process.env): TranscriptionProvider {
  const name = (env.TRANSCRIPTION_PROVIDER?.trim() || "deepgram").toLowerCase();
  if (!Object.hasOwn(PROVIDERS, name)) {
    throw new ProviderConfigError(
      `Unknown TRANSCRIPTION_PROVIDER "${name}". Use one of: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }
  const { keyEnv, create } = PROVIDERS[name as keyof typeof PROVIDERS];
  const key = env[keyEnv]?.trim();
  if (!key) {
    // Vercel sets VERCEL=1 on its builds and functions, where .env.local is never read.
    const where = env.VERCEL
      ? "Add it under Settings → Environment Variables in your Vercel project, then redeploy."
      : "Add it to .env.local and restart the server.";
    throw new ProviderConfigError(`${keyEnv} is not set. ${where}`);
  }
  return create(key);
}

export function getTranscriptionLanguage(env: Env = process.env): string {
  return env.TRANSCRIPTION_LANGUAGE?.trim() || "en";
}

export * from "./provider";
