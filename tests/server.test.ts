import { describe, expect, it } from "vitest";
import { estimateAudioSeconds, isAcceptedAudioType } from "@/lib/audio/estimate";
import { normalizeDeepgramResponse } from "@/server/transcription/deepgram";
import { getTranscriptionLanguage, getTranscriptionProvider, ProviderConfigError } from "@/server/transcription";

describe("normalizeDeepgramResponse", () => {
  it("prefers punctuated words and keeps timing, confidence and speaker", () => {
    const r = normalizeDeepgramResponse({
      metadata: { duration: 3.2 },
      results: {
        channels: [
          {
            alternatives: [
              {
                words: [
                  { word: "um", punctuated_word: "Um,", start: 0.1, end: 0.3, confidence: 0.8, speaker: 0 },
                  { word: "hello", start: 0.4, end: 0.9, confidence: 0.99 },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(r.duration).toBe(3.2);
    expect(r.words).toEqual([
      { text: "Um,", start: 0.1, end: 0.3, confidence: 0.8, speaker: 0 },
      { text: "hello", start: 0.4, end: 0.9, confidence: 0.99 },
    ]);
  });

  it("handles a response with no speech", () => {
    expect(normalizeDeepgramResponse({ metadata: { duration: 5 }, results: { channels: [] } })).toEqual({
      words: [],
      duration: 5,
      language: undefined,
    });
  });

  it("falls back to the last word end when duration is missing", () => {
    const r = normalizeDeepgramResponse({
      results: { channels: [{ alternatives: [{ words: [{ word: "x", start: 0, end: 2, confidence: 1 }] }] }] },
    });
    expect(r.duration).toBe(2);
  });
});

describe("getTranscriptionProvider", () => {
  it("defaults to Deepgram", () => {
    expect(getTranscriptionProvider({ DEEPGRAM_API_KEY: "k" }).name).toBe("deepgram");
  });

  it("explains a missing key", () => {
    expect(() => getTranscriptionProvider({ TRANSCRIPTION_PROVIDER: "deepgram" })).toThrow(/DEEPGRAM_API_KEY/);
  });

  it("rejects unknown and unimplemented providers with a config error", () => {
    expect(() => getTranscriptionProvider({ TRANSCRIPTION_PROVIDER: "nope" })).toThrow(ProviderConfigError);
    expect(() => getTranscriptionProvider({ TRANSCRIPTION_PROVIDER: "openai" })).toThrow(/not implemented/);
  });

  it("reads the language with an English default", () => {
    expect(getTranscriptionLanguage({})).toBe("en");
    expect(getTranscriptionLanguage({ TRANSCRIPTION_LANGUAGE: "es" })).toBe("es");
  });
});

describe("audio estimates", () => {
  it("overestimates Opus duration for safe pre-authorization", () => {
    // 60 s at 24 kbps is ~180 KB.
    expect(estimateAudioSeconds(180_000, "audio/ogg")).toBeGreaterThanOrEqual(60);
  });

  it("estimates WAV duration from 16 kHz mono s16", () => {
    expect(estimateAudioSeconds(320_000, "audio/wav")).toBe(10);
  });

  it("accepts only supported audio types, ignoring parameters", () => {
    expect(isAcceptedAudioType("audio/ogg; codecs=opus")).toBe(true);
    expect(isAcceptedAudioType("video/mp4")).toBe(false);
  });
});
