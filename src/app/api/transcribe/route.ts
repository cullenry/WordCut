import { NextResponse } from "next/server";
import { MAX_CHUNK_BYTES } from "@/lib/audio/chunks";
import { estimateAudioSeconds, isAcceptedAudioType } from "@/lib/audio/estimate";
import type { TranscribeResponse } from "@/lib/transcription/transcribe";
import {
  getTranscriptionLanguage,
  getTranscriptionProvider,
  ProviderConfigError,
  ProviderError,
} from "@/server/transcription";
import { getUsageMeter, UsageLimitError, type UsageContext } from "@/server/usage/meter";

export const runtime = "nodejs";
// AssemblyAI queues each chunk and is polled until done, which can take a few minutes for a long chunk.
export const maxDuration = 300;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Accepts one encoded audio chunk (never video) and returns word-level timestamps. */
export async function POST(req: Request) {
  const mimeType = req.headers.get("content-type") ?? "";
  if (!isAcceptedAudioType(mimeType)) return fail("Expected audio/ogg, audio/webm or audio/wav.", 415);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_CHUNK_BYTES) return fail("Audio chunk too large.", 413);
  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0) return fail("Empty audio.", 400);
  if (audio.byteLength > MAX_CHUNK_BYTES) return fail("Audio chunk too large.", 413);

  const ctx: UsageContext = { userId: null };
  const meter = getUsageMeter();

  try {
    const provider = getTranscriptionProvider();
    await meter.authorize(ctx, estimateAudioSeconds(audio.byteLength, mimeType));
    const result = await provider.transcribe({
      audio,
      mimeType,
      language: getTranscriptionLanguage(),
      signal: req.signal,
    });
    await meter.record(ctx, result.duration, { provider: provider.name });
    const body: TranscribeResponse = { ...result, provider: provider.name };
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof ProviderConfigError) return fail(e.message, 500);
    if (e instanceof UsageLimitError) return fail(e.message, 402);
    if (e instanceof ProviderError) {
      // Pass rate limits through so the client backs off; everything else is a bad gateway.
      return fail(e.message, e.status === 429 ? 429 : e.status >= 500 ? 502 : 400);
    }
    console.error("[transcribe]", e);
    return fail("Transcription failed unexpectedly.", 502);
  }
}
