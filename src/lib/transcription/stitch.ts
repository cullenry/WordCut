import type { ChunkRange } from "@/lib/audio/chunks";
import type { RawWord, Word } from "@/lib/transcript/types";

export interface ChunkResult extends ChunkRange {
  /** Words timed relative to the chunk start. */
  words: RawWord[];
}

/**
 * Shifts each chunk's words into source-video time and joins them in order.
 * Times are clamped to their chunk and kept monotonic, and every word gets a
 * stable id from its position in the final transcript.
 */
export function stitchChunks(chunks: ChunkResult[]): Word[] {
  const ordered = [...chunks].sort((a, b) => a.start - b.start);
  const out: Word[] = [];
  let prevEnd = 0;

  for (const chunk of ordered) {
    const words = [...chunk.words].sort((a, b) => a.start - b.start);
    for (const w of words) {
      const text = w.text.trim();
      if (!text) continue;
      let start = clamp(chunk.start + w.start, chunk.start, chunk.end);
      const end = clamp(chunk.start + w.end, start, chunk.end);
      start = Math.min(Math.max(start, prevEnd), end);
      out.push({
        id: `w${out.length}`,
        text,
        start: round(start),
        end: round(end),
        confidence: w.confidence,
        ...(w.speaker !== undefined && { speaker: w.speaker }),
      });
      prevEnd = end;
    }
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Millisecond precision keeps stored transcripts compact and comparisons exact. */
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
