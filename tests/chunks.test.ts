import { describe, expect, it } from "vitest";
import { chunkLimitsFor, MAX_CHUNK_SECONDS, planChunks, type ChunkLimits } from "@/lib/audio/chunks";
import type { Envelope } from "@/lib/audio/envelope";

const FRAME = 0.05;

/** Builds an envelope that is loud everywhere except the given silent spans. */
function envelopeWithSilences(duration: number, silences: [number, number][]): Envelope {
  const rms = new Float32Array(Math.ceil(duration / FRAME)).fill(0.3);
  for (const [a, b] of silences) {
    for (let f = Math.floor(a / FRAME); f < Math.ceil(b / FRAME); f++) rms[f] = 0.001;
  }
  return { frameSeconds: FRAME, rms };
}

const limits: ChunkLimits = { targetSeconds: 60, maxSeconds: 80, searchSeconds: 15 };

function expectContiguous(chunks: { start: number; end: number }[], duration: number) {
  expect(chunks[0].start).toBe(0);
  expect(chunks.at(-1)!.end).toBe(duration);
  for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBe(chunks[i - 1].end);
}

describe("planChunks", () => {
  it("returns a single chunk when the audio fits", () => {
    expect(planChunks(envelopeWithSilences(70, []), 70, limits)).toEqual([{ start: 0, end: 70 }]);
  });

  it("returns nothing for empty audio", () => {
    expect(planChunks(envelopeWithSilences(1, []), 0, limits)).toEqual([]);
  });

  it("cuts inside the silence nearest the target", () => {
    const chunks = planChunks(envelopeWithSilences(120, [[52, 53]]), 120, limits);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].end).toBeGreaterThanOrEqual(52);
    expect(chunks[0].end).toBeLessThanOrEqual(53);
    expectContiguous(chunks, 120);
  });

  it("prefers the deepest silence over a closer, shallower dip", () => {
    const env = envelopeWithSilences(150, [[70, 71]]);
    for (let f = Math.floor(60 / FRAME); f < Math.ceil(61 / FRAME); f++) env.rms[f] = 0.1;
    const chunks = planChunks(env, 150, limits);
    expect(chunks[0].end).toBeGreaterThanOrEqual(70);
    expect(chunks[0].end).toBeLessThanOrEqual(71);
  });

  it("ignores a single quiet frame in favour of sustained silence", () => {
    const env = envelopeWithSilences(150, [[72, 73]]);
    env.rms[Math.floor(60 / FRAME)] = 0; // one-frame click of silence mid-word
    const [first] = planChunks(env, 150, limits);
    expect(first.end).toBeGreaterThanOrEqual(72);
    expect(first.end).toBeLessThanOrEqual(73);
  });

  it("never exceeds maxSeconds, even with no silence at all", () => {
    const duration = 1000;
    const chunks = planChunks(envelopeWithSilences(duration, []), duration, limits);
    expectContiguous(chunks, duration);
    for (const c of chunks) {
      expect(c.end - c.start).toBeLessThanOrEqual(limits.maxSeconds + 1e-9);
      expect(c.end - c.start).toBeGreaterThan(0);
    }
  });

  it("splits a long recording into contiguous chunks at each silence", () => {
    const silences: [number, number][] = [
      [58, 59],
      [121, 122],
      [178, 179],
    ];
    const chunks = planChunks(envelopeWithSilences(230, silences), 230, limits);
    expect(chunks).toHaveLength(4);
    expectContiguous(chunks, 230);
    chunks.slice(0, -1).forEach((c, i) => {
      expect(c.end).toBeGreaterThanOrEqual(silences[i][0]);
      expect(c.end).toBeLessThanOrEqual(silences[i][1]);
    });
  });

  it("treats audio past the end of the envelope as silent instead of crashing", () => {
    const env: Envelope = { frameSeconds: FRAME, rms: new Float32Array(10).fill(0.3) };
    const chunks = planChunks(env, 200, limits);
    expectContiguous(chunks, 200);
  });

  it("rejects invalid limits", () => {
    expect(() => planChunks(envelopeWithSilences(10, []), 10, { ...limits, targetSeconds: 100 })).toThrow();
  });
});

describe("chunkLimitsFor", () => {
  it("caps Opus-sized chunks at the time limit", () => {
    const l = chunkLimitsFor(2_000);
    expect(l.maxSeconds).toBe(MAX_CHUNK_SECONDS);
    expect(l.targetSeconds).toBeLessThan(l.maxSeconds);
    expect(l.targetSeconds + l.searchSeconds).toBeLessThanOrEqual(l.maxSeconds);
  });

  it("keeps WAV chunks within the byte budget", () => {
    const l = chunkLimitsFor(32_100, 3 * 1024 * 1024);
    expect(l.maxSeconds * 32_100).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(l.maxSeconds).toBeGreaterThan(60);
  });
});
