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
