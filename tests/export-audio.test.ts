import { describe, expect, it } from "vitest";
import { clipEdl } from "@/lib/clips/range";
import { fromSpans } from "@/lib/edl/edl";
import { SegmentWriter, fadeGain, fadeSamples, packPlanar } from "@/lib/media/export/audio";
import { audioSegments } from "@/lib/media/export/plan";

const ramp = (from: number, n: number) => Float32Array.from({ length: n }, (_, i) => from + i);

/** Feeds `source` (one channel) to a writer in chunks, as a decoder would, and joins the output. */
function runWriter(w: SegmentWriter, source: Float32Array, chunk: number, firstSample = 0): Float32Array {
  const parts: Float32Array[] = [];
  for (let at = 0; at < source.length && !w.done; at += chunk) {
    const out = w.push(firstSample + at, [source.subarray(at, at + chunk)]);
    if (out) parts.push(out[0]);
  }
  const rest = w.finish();
  if (rest) parts.push(rest[0]);
  return concat(parts);
}

const concat = (parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe("fadeGain", () => {
  it("ramps from 0 up to 1 and back down over `fade` samples", () => {
    expect(fadeGain(0, 1000, 10)).toBe(0);
    expect(fadeGain(5, 1000, 10)).toBeCloseTo(0.5, 6);
    expect(fadeGain(10, 1000, 10)).toBe(1);
    expect(fadeGain(500, 1000, 10)).toBe(1);
    expect(fadeGain(999, 1000, 10)).toBe(0);
    expect(fadeGain(994, 1000, 10)).toBeCloseTo(0.5, 6);
  });

  it("rises smoothly: every step is small", () => {
    for (let k = 1; k < 192; k++) expect(fadeGain(k, 10_000, 192) - fadeGain(k - 1, 10_000, 192)).toBeLessThan(0.01);
  });

  it("shrinks to half of a very short segment: in and straight back out", () => {
    const g = Array.from({ length: 10 }, (_, k) => fadeGain(k, 10, 192));
    expect(g[0]).toBe(0);
    expect(g[9]).toBe(0);
    expect(Math.max(...g)).toBeGreaterThan(0.9);
    expect(g).toEqual([...g].reverse());
  });

  it("is 1 everywhere with no fade", () => {
    expect(fadeGain(0, 100, 0)).toBe(1);
  });

  it("is about 4 ms long", () => {
    expect(fadeSamples(48_000)).toBe(192);
    expect(fadeSamples(44_100)).toBe(176);
  });
});

describe("SegmentWriter", () => {
  const seg = { srcStart: 100, outStart: 0, length: 1000 };

  it("copies exactly `length` samples starting at srcStart, whatever the chunk size", () => {
    const source = ramp(0, 5000);
    for (const chunk of [1, 7, 256, 1024, 5000]) {
      const out = runWriter(new SegmentWriter(seg, 1, 0), source, chunk);
      expect(out).toHaveLength(1000);
      expect(out[0]).toBe(100);
      expect(out[999]).toBe(1099);
    }
  });

  it("never writes a sample twice when the decoder repeats or overlaps", () => {
    const w = new SegmentWriter(seg, 1, 0);
    const chunk = ramp(0, 600);
    expect(w.push(0, [chunk])?.[0]).toHaveLength(500);
    expect(w.push(0, [chunk])).toBeNull();
    const next = w.push(550, [ramp(550, 100)]);
    expect(next?.[0][0]).toBe(600); // the overlapping 550..599 is skipped
    expect(next?.[0]).toHaveLength(50);
  });

  it("fills a gap in the source with silence instead of closing it, so what follows stays in sync", () => {
    const w = new SegmentWriter(seg, 1, 0);
    const a = w.push(0, [ramp(0, 300)])![0]; // source 100..299
    const b = w.push(500, [ramp(500, 2000)])![0]; // 300..499 missing
    const out = concat([a, b]);
    expect(out).toHaveLength(1000);
    expect(out[199]).toBe(299);
    expect(out[200]).toBe(0);
    expect(out[399]).toBe(0);
    expect(out[400]).toBe(500); // source sample 500 at output 400, where it belongs
    expect(w.done).toBe(true);
  });

  it("pads with silence when the source ends early", () => {
    const out = runWriter(new SegmentWriter(seg, 1, 0), ramp(0, 800), 256);
    expect(out).toHaveLength(1000);
    expect(out[699]).toBe(799);
    expect(out[700]).toBe(0);
  });

  it("fills the whole segment with silence if the first chunk is past its end", () => {
    const w = new SegmentWriter(seg, 1, 0);
    expect(w.push(5000, [ramp(5000, 10)])![0]).toEqual(new Float32Array(1000));
    expect(w.done).toBe(true);
    expect(w.finish()).toBeNull();
  });

  it("fades in and out at its edges and nowhere else", () => {
    const ones = new Float32Array(5000).fill(1);
    const out = runWriter(new SegmentWriter(seg, 1, 10), ones, 64);
    expect(out[0]).toBe(0);
    expect(out[5]).toBeCloseTo(0.5, 6);
    expect(out[10]).toBe(1);
    expect(out[500]).toBe(1);
    expect(out[989]).toBe(1);
    expect(out[999]).toBe(0);
  });

  it("gives every output channel a plane, repeating a mono source", () => {
    const out = new SegmentWriter({ srcStart: 0, outStart: 0, length: 4 }, 2, 0).push(0, [ramp(1, 4)]);
    expect(out).toHaveLength(2);
    expect(out![1]).toEqual(out![0]);
  });
});

describe("a whole clip's audio", () => {
  const sr = 48_000;
  const source = Float32Array.from({ length: sr * 10 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / sr));
  // Cuts at arbitrary points of the waveform: without fades each join could jump by up to 2.
  const edl = fromSpans(
    [
      { start: 0.5123, end: 1.2771 },
      { start: 2.0009, end: 3.3333 },
      { start: 4.1, end: 4.98765 },
      { start: 6.25, end: 6.3 },
    ],
    10,
  );
  const c = clipEdl(edl, 0, 10);
  const { segments, totalSamples } = audioSegments(c, sr);
  const out = concat(segments.map((s) => runWriter(new SegmentWriter(s, 1, fadeSamples(sr)), source, 1024)));

  it("is exactly as long as the clip, to the sample", () => {
    expect(out).toHaveLength(totalSamples);
    expect(totalSamples).toBe(Math.round(c.duration * sr));
  });

  it("has no clicks: no step between samples is bigger than the waveform's own", () => {
    const maxStep = 2 * Math.sin((Math.PI * 440) / sr); // largest step of the sine itself
    let worst = 0;
    for (let i = 1; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i] - out[i - 1]));
    expect(worst).toBeLessThanOrEqual(maxStep + 0.02);
  });

  it("stays in sync: mid-range, each output sample is the source sample the EDL maps it to", () => {
    segments.forEach((s, i) => {
      const mid = s.outStart + Math.floor(s.length / 2);
      const sourceTime = c.ranges[i].start + (mid / sr - c.ranges[i].offset);
      expect(out[mid]).toBeCloseTo(source[Math.round(sourceTime * sr)], 1);
      expect(out[mid]).toBe(source[s.srcStart + (mid - s.outStart)]);
    });
  });

  it("ends without drift: the last sample is the last kept source sample", () => {
    const last = segments[segments.length - 1];
    expect(last.outStart + last.length).toBe(out.length);
    expect(Math.abs((last.srcStart + last.length) / sr - c.ranges[c.ranges.length - 1].end)).toBeLessThanOrEqual(1 / sr);
  });
});

describe("packPlanar", () => {
  it("lays planes end to end", () => {
    expect(packPlanar([Float32Array.of(1, 2), Float32Array.of(3, 4)])).toEqual(Float32Array.of(1, 2, 3, 4));
    expect(packPlanar([])).toEqual(new Float32Array(0));
  });
});
