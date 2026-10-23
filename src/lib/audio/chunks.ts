import type { Envelope } from "./envelope";

export interface ChunkRange {
  start: number;
  end: number;
}

export interface ChunkLimits {
  /** Preferred chunk length in seconds. */
  targetSeconds: number;
  /** Hard upper bound; chunks never exceed this. */
  maxSeconds: number;
  /** How far either side of the target to search for a quiet cut point. */
  searchSeconds: number;
}

/** Hard cap on accepted upload size, under Vercel's 4.5 MB function body limit. */
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
/** Client-side budget per chunk, leaving headroom for container overhead and VBR spikes. */
export const CHUNK_BYTE_BUDGET = 3 * 1024 * 1024;
/** Longest chunk regardless of size, so slow requests stay well under function timeouts. */
export const MAX_CHUNK_SECONDS = 900;

/** Picks chunk lengths that keep each encoded chunk under the byte budget. */
export function chunkLimitsFor(bytesPerSecond: number, budget = CHUNK_BYTE_BUDGET): ChunkLimits {
  const maxSeconds = Math.min(MAX_CHUNK_SECONDS, Math.floor(budget / bytesPerSecond));
  const targetSeconds = Math.floor(maxSeconds * 0.8);
  return { maxSeconds, targetSeconds, searchSeconds: Math.floor(maxSeconds * 0.15) };
}

/** Width of the moving window used to find sustained silence, not a single quiet frame. */
const QUIET_WINDOW_SECONDS = 0.4;

/**
 * Splits [0, duration] into chunks no longer than `maxSeconds`, cutting at the
 * quietest point near each target so no word is split between two requests.
 */
export function planChunks(envelope: Envelope, duration: number, limits: ChunkLimits): ChunkRange[] {
  const { targetSeconds, maxSeconds, searchSeconds } = limits;
  if (!(maxSeconds > 0) || targetSeconds > maxSeconds) throw new Error("Invalid chunk limits");
  if (duration <= 0) return [];

  const { rms, frameSeconds } = envelope;
  const frameCount = Math.ceil(duration / frameSeconds);
  const prefix = new Float64Array(frameCount + 1);
  for (let i = 0; i < frameCount; i++) prefix[i + 1] = prefix[i] + (rms[i] ?? 0);
  const half = Math.max(0, Math.round(QUIET_WINDOW_SECONDS / frameSeconds / 2));
  const loudnessAround = (frame: number) => {
    const a = Math.max(0, frame - half);
    const b = Math.min(frameCount, frame + half + 1);
    return (prefix[b] - prefix[a]) / (b - a);
  };

  const chunks: ChunkRange[] = [];
  let pos = 0;
  while (duration - pos > maxSeconds) {
    const target = pos + targetSeconds;
    const lo = Math.max(pos + frameSeconds, target - searchSeconds);
    const hi = Math.min(pos + maxSeconds, target + searchSeconds);
    let bestFrame = -1;
    let bestScore = Infinity;
    let bestDist = Infinity;
    for (let f = Math.ceil(lo / frameSeconds); (f + 1) * frameSeconds <= hi; f++) {
      const score = loudnessAround(f);
      const dist = Math.abs((f + 0.5) * frameSeconds - target);
      if (score < bestScore || (score === bestScore && dist < bestDist)) {
        bestFrame = f;
        bestScore = score;
        bestDist = dist;
      }
    }
    const cut = bestFrame >= 0 ? (bestFrame + 0.5) * frameSeconds : Math.min(target, pos + maxSeconds);
    chunks.push({ start: pos, end: cut });
    pos = cut;
  }
  chunks.push({ start: pos, end: duration });
  return chunks;
}
