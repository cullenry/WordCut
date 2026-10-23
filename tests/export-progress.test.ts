import { describe, expect, it } from "vitest";
import { AUDIO_WEIGHT, EtaEstimator, exportFraction, formatRemaining, percentOf } from "@/lib/media/export/progress";

describe("exportFraction", () => {
  it("is the video share alone when there is no audio", () => {
    expect(exportFraction({ framesDone: 50, totalFrames: 100, samplesDone: 0, totalSamples: 0 })).toBe(0.5);
  });

  it("weights audio by how little time it takes", () => {
    expect(exportFraction({ framesDone: 0, totalFrames: 100, samplesDone: 10, totalSamples: 10 })).toBeCloseTo(AUDIO_WEIGHT);
    expect(exportFraction({ framesDone: 100, totalFrames: 100, samplesDone: 0, totalSamples: 10 })).toBeCloseTo(1 - AUDIO_WEIGHT);
    expect(exportFraction({ framesDone: 100, totalFrames: 100, samplesDone: 10, totalSamples: 10 })).toBe(1);
  });

  it("is clamped to 0..1", () => {
    expect(exportFraction({ framesDone: 150, totalFrames: 100, samplesDone: -5, totalSamples: 10 })).toBeCloseTo(1 - AUDIO_WEIGHT);
  });
});

describe("percentOf", () => {
  it("rounds down and holds at 99 until the file is done", () => {
    expect(percentOf(0.426)).toBe(42);
    expect(percentOf(0.999)).toBe(99);
    expect(percentOf(1)).toBe(99);
    expect(percentOf(1, true)).toBe(100);
    expect(percentOf(-1)).toBe(0);
  });
});

describe("EtaEstimator", () => {
  it("has no estimate until a second of progress has been seen", () => {
    const e = new EtaEstimator();
    expect(e.remaining()).toBeNull();
    e.push(0, 0);
    e.push(0.5, 0.05);
    expect(e.remaining()).toBeNull();
    e.push(1, 0.1);
    expect(e.remaining()).toBeCloseTo(9);
  });

  it("follows the recent rate, not the slow start", () => {
    const e = new EtaEstimator(5);
    e.push(0, 0);
    e.push(4, 0.02); // opening the file and warming up the encoder
    for (let t = 5; t <= 14; t++) e.push(t, 0.02 + (t - 4) * 0.05);
    // 5% a second recently, 50% left after t = 14.
    expect(e.remaining()).toBeCloseTo(10, 0);
  });

  it("ignores samples that go back in time or progress", () => {
    const e = new EtaEstimator();
    e.push(0, 0);
    e.push(2, 0.2);
    e.push(1, 0.5);
    e.push(3, 0.1);
    expect(e.remaining()).toBeCloseTo(8);
  });

  it("is 0 once done", () => {
    const e = new EtaEstimator();
    e.push(0, 0);
    e.push(2, 1);
    expect(e.remaining()).toBe(0);
  });
});

describe("formatRemaining", () => {
  it("reads naturally", () => {
    expect(formatRemaining(null)).toBe("Estimating time left…");
    expect(formatRemaining(0.4)).toBe("Less than a second left");
    expect(formatRemaining(4.2)).toBe("About 5 s left");
    expect(formatRemaining(59.5)).toBe("About 60 s left");
    expect(formatRemaining(80)).toBe("About 1 min 20 s left");
    expect(formatRemaining(123)).toBe("About 2 min left");
    expect(formatRemaining(Number.POSITIVE_INFINITY)).toBe("Estimating time left…");
  });
});
