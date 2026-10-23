import type { RawWord } from "@/lib/transcript/types";

export interface TranscribeRequest {
  audio: ArrayBuffer;
  mimeType: string;
  language: string;
  signal?: AbortSignal;
}

export interface ProviderResult {
  /** Words timed relative to the start of the submitted audio. */
  words: RawWord[];
  /** Audio duration as measured by the provider. Used for billing. */
  duration: number;
  language?: string;
}

/** Implement this to add a transcription backend. Pick one with TRANSCRIPTION_PROVIDER. */
export interface TranscriptionProvider {
  readonly name: string;
  transcribe(req: TranscribeRequest): Promise<ProviderResult>;
}

/** Server misconfiguration, e.g. a missing API key. Shown to self-hosters as-is. */
export class ProviderConfigError extends Error {}

/** The upstream provider rejected or failed the request. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Turns a failed upstream response into a ProviderError, naming the env var to check on auth failures. */
export async function providerHttpError(res: Response, provider: string, keyEnv: string): Promise<ProviderError> {
  const detail = await res.text().catch(() => "");
  const msg =
    res.status === 401 || res.status === 403
      ? `${provider} rejected the API key. Check ${keyEnv}.`
      : `${provider} error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
  return new ProviderError(msg, res.status);
}

/** "audio/ogg; codecs=opus" -> "audio/ogg". */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}
