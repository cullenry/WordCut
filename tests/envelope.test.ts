import { describe, expect, it } from "vitest";
import { EnvelopeBuilder } from "@/lib/audio/envelope";

describe("EnvelopeBuilder", () => {
  it("computes RMS per frame and averages channels", () => {
    const b = new EnvelopeBuilder(1, 0.5);
    const rate = 4;
    // 4 samples per frame-pair: first frame loud (0.5), second silent.
    b.push([new Float32Array([0.5, 0.5, 0, 0]), new Float32Array([0.5, 0.5, 0, 0])], rate, 0);
    const env = b.finish();
    expect(env.rms).toHaveLength(2);
    expect(env.rms[0]).toBeCloseTo(0.5);
    expect(env.rms[1]).toBe(0);
  });

  it("places blocks by their timestamp", () => {
    const b = new EnvelopeBuilder(2, 0.5);
    b.push([new Float32Array([1, 1])], 4, 1.5);
    const env = b.finish();
    expect(Array.from(env.rms)).toEqual([0, 0, 0, 1]);
  });

  it("ignores samples outside the duration", () => {
    const b = new EnvelopeBuilder(1, 0.5);
    b.push([new Float32Array([1, 1, 1, 1])], 2, 0.5);
    expect(b.finish().rms).toHaveLength(2);
  });

  it("does nothing for an empty block", () => {
    const b = new EnvelopeBuilder(1, 0.5);
    b.push([], 48000, 0);
    expect(Array.from(b.finish().rms)).toEqual([0, 0]);
  });
});
