import type { Paragraph } from "./paragraphs";
import type { Transcript } from "./types";

/** Videos longer than this are transcribed in several chunks (see chunkLimitsFor). */
const LEGACY_MULTI_CHUNK_SECONDS = 12 * 60;

/**
 * What to show beside a paragraph:
 * - `speaker`: the speaker changed, and numbers are comparable (one chunk).
 * - `change`: the speaker changed, but numbers from different chunks may not
 *   match, so no identity is claimed.
 * - null: no change from the previous paragraph, or nothing can be said.
 */
export type SpeakerMark = { kind: "speaker"; speaker: number } | { kind: "change" } | null;

/** True when speaker numbers may be inconsistent across the transcript. */
export function isMultiChunk(transcript: Pick<Transcript, "words" | "duration">): boolean {
  const { words, duration } = transcript;
  if (words.length === 0) return false;
  if (words[0].chunk === undefined) return duration > LEGACY_MULTI_CHUNK_SECONDS;
  return words[words.length - 1].chunk !== words[0].chunk;
}

/** One mark per paragraph, set only where the speaker differs from the paragraph before it. */
export function speakerMarks(paragraphs: Paragraph[], multiChunk: boolean): SpeakerMark[] {
  return paragraphs.map((p, i) => {
    const prev = paragraphs[i - 1];
    if (!prev || p.speaker === undefined || prev.speaker === undefined) return null;
    if (p.chunk !== prev.chunk || p.speaker === prev.speaker) return null;
    return multiChunk ? { kind: "change" } : { kind: "speaker", speaker: p.speaker };
  });
}
