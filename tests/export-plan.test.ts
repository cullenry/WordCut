import { describe, expect, it } from "vitest";
import { clipEdl } from "@/lib/clips/range";
import { buildEdl, fromSpans } from "@/lib/edl/edl";
import { isKept } from "@/lib/edl/time";
import {
  audioSegments,
  codecName,
  exportFileName,
  frameCount,
  frameDuration,
  frameSourceTimes,
  frameTime,
  outputFrameRate,
  snapFrameRate,
  videoBitrate,
} from "@/lib/media/export/plan";
import { makeWords } from "./helpers";

// Kept 1-2, 3-5 and 7-8 of a 10 s source: clip offsets 0, 1, 3, duration 4.
const cut = fromSpans(
  [
    { start: 1, end: 2 },
    { start: 3, end: 5 },
    { start: 7, end: 8 },
  ],
  10,
);
const whole = fromSpans([{ start: 0, end: 10 }], 10);

const times = (edl: Parameters<typeof frameSourceTimes>[0], fps: number, first?: number) => [
  ...frameSourceTimes(edl, fps, first),
];

/** The source frame a decoder returns for time `t`: the last one starting at or before it, on a `fps` grid. */
const sourceFrame = (t: number, fps = 30) => Math.floor(t * fps);

describe("outputFrameRate", () => {
  it("matches the source up to 30", () => {
    expect(outputFrameRate(24)).toBe(24);
    expect(outputFrameRate(25)).toBe(25);
    expect(outputFrameRate(30)).toBe(30);
    expect(outputFrameRate(15)).toBe(15);
  });

  it("snaps a measured average to the rate the camera meant", () => {
    expect(outputFrameRate(29.97002997)).toBe(30000 / 1001);
    expect(outputFrameRate(29.6)).toBe(30000 / 1001); // variable-rate phone footage
    expect(outputFrameRate(23.98)).toBe(24000 / 1001);
    expect(snapFrameRate(27.3)).toBe(27.3);
  });

  it("divides faster sources by a whole number so the cadence stays even", () => {
    expect(outputFrameRate(60000 / 1001)).toBe(30000 / 1001);
    expect(outputFrameRate(60)).toBe(30);
    expect(outputFrameRate(50)).toBe(25);
    expect(outputFrameRate(120)).toBe(30);
    expect(outputFrameRate(48)).toBe(24);
  });

  it("caps at 30 when dividing would make it choppy", () => {
    expect(outputFrameRate(31)).toBe(30); // 31 / 2 would be 15.5
    expect(outputFrameRate(40)).toBe(30);
  });

  it("uses 30 when the rate is unknown", () => {
    expect(outputFrameRate(null)).toBe(30);
    expect(outputFrameRate(0)).toBe(30);
    expect(outputFrameRate(Number.NaN)).toBe(30);
  });
});

describe("frame grid", () => {
  it("covers the duration, with a short last frame when it doesn't divide evenly", () => {
    expect(frameCount(2, 30)).toBe(60);
    expect(frameCount(1.97, 30)).toBe(60);
    expect(frameDuration(59, 30, 1.97)).toBeCloseTo(1.97 - 59 / 30, 6);
    expect(frameCount(0, 30)).toBe(0);
  });

  it("isn't thrown off by float noise in the duration", () => {
    expect(frameCount(0.1 + 0.2, 30)).toBe(9); // 0.30000000000000004 s
    expect(frameCount(2.0000000001, 30)).toBe(60);
  });

  it("tiles the output timeline exactly: no gaps or overlaps between frames", () => {
    for (const [duration, fps] of [
      [4, 30],
      [3.217, 30000 / 1001],
      [1.05, 25],
    ]) {
      const n = frameCount(duration, fps);
      let end = 0;
      for (let i = 0; i < n; i++) {
        expect(frameTime(i, fps)).toBe(end);
        const d = frameDuration(i, fps, duration);
        expect(d).toBeGreaterThan(0);
        end = Math.round((end + d) * 1e6) / 1e6;
      }
      expect(end).toBeCloseTo(duration, 6);
    }
  });
});

describe("frameSourceTimes", () => {
  it("a clip with no cuts: frames step through the source one frame at a time", () => {
    const c = clipEdl(whole, 2, 5);
    const t = times(c, 30);
    expect(t).toHaveLength(90);
    expect(t[0]).toBeCloseTo(2, 3);
    t.forEach((s, n) => expect(sourceFrame(s)).toBe(60 + n));
  });

  it("a clip with several cuts: never shows a cut, and a frame on a join comes from the range after it", () => {
    const c = clipEdl(cut, 0, 10);
    const t = times(c, 30);
    expect(t).toHaveLength(120);
    expect(sourceFrame(t[29])).toBe(59); // last frame before the first join
    expect(sourceFrame(t[30])).toBe(90); // clip time 1 is the join: source 3 s
    expect(sourceFrame(t[90])).toBe(210); // clip time 3 is the next join: source 7 s
    for (const s of t) expect(isKept(cut, s)).toBe(true);
  });

  it("is strictly ascending, so no source frame is used twice across a join", () => {
    const t = times(clipEdl(cut, 0, 10), 30);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });

  it("a clip starting on a cut starts at the next kept frame", () => {
    const c = clipEdl(cut, 2.4, 6);
    const t = times(c, 30);
    expect(sourceFrame(t[0])).toBe(90);
    expect(t).toHaveLength(60);
  });

  it("a clip ending on a cut ends with the last kept frame", () => {
    const c = clipEdl(cut, 1.5, 6);
    const t = times(c, 30);
    expect(t).toHaveLength(75); // 0.5 + 2 s
    expect(t[t.length - 1]).toBeLessThan(5);
    expect(sourceFrame(t[t.length - 1])).toBe(149); // the frame at 4.967 s
  });

  it("a clip of a word or two (under 2 s)", () => {
    const words = makeWords([
      ["hi", 1, 1.3],
      ["um", 1.5, 1.7],
      ["there", 1.9, 2.3],
    ]);
    const edl = buildEdl(words, new Set(["w1"]), 5);
    const c = clipEdl(edl, 0.9, 2.4);
    expect(c.duration).toBeLessThan(2);
    const t = times(c, 30);
    expect(t).toHaveLength(frameCount(c.duration, 30));
    for (const s of t) expect(isKept(edl, s)).toBe(true);

    const tiny = clipEdl(whole, 3, 3.05);
    expect(times(tiny, 30)).toHaveLength(2);
    expect(frameDuration(1, 30, tiny.duration)).toBeCloseTo(0.05 - 1 / 30, 6);
  });

  it("rounding at joins: a join exactly on the frame grid of 29.97 fps lands on the next range", () => {
    const fps = 30000 / 1001;
    // 30 frames at 29.97 fps is 1.001 s.
    const edl = fromSpans(
      [
        { start: 0, end: 1.001 },
        { start: 3, end: 4 },
      ],
      10,
    );
    const t = times(edl, fps);
    expect(sourceFrame(t[29], fps)).toBe(29);
    expect(sourceFrame(t[30], fps)).toBe(Math.floor(3 * fps));
  });

  it("rounding at joins: float sums like 0.1 + 0.2 don't push a frame into the wrong range", () => {
    const edl = fromSpans(
      [
        { start: 0, end: 0.1 },
        { start: 0.5, end: 0.7 },
        { start: 1, end: 2 },
      ],
      10,
    );
    const t = times(edl, 30);
    expect(sourceFrame(t[3])).toBe(15); // clip time 0.1 → source 0.5
    expect(sourceFrame(t[9])).toBe(30); // clip time 0.3 → source 1, not the frame before
  });

  it("rounding at joins: a range starting on a source frame doesn't repeat one frame and skip the next", () => {
    // 0.7 + 1/30 rounds to 0.733333, a hair before source frame 22 starts at 0.7333…:
    // looking up at the exact edge would return frame 21 twice and never show 22.
    const edl = fromSpans(
      [
        { start: 0.7, end: 2.37 },
        { start: 3.115, end: 5.555 },
      ],
      10,
    );
    const shown = times(edl, 30).map((s) => sourceFrame(s));
    for (let i = 1; i < shown.length; i++) expect(shown[i]).not.toBe(shown[i - 1]);
    expect(shown.slice(0, 4)).toEqual([21, 22, 23, 24]);
  });

  it("looks a hair into the frame, but never past the end of its kept range", () => {
    const t = times(clipEdl(cut, 0, 10), 30);
    for (const s of t) expect(isKept(cut, s)).toBe(true);
    // The second frame starts 0.067 ms before the range ends: looking 0.1 ms in would leave the range.
    const edge = fromSpans([{ start: 1, end: 1.0334 }], 10);
    expect([...frameSourceTimes(edge, 30)]).toEqual([1.0001, 1.033333]);
  });

  it("never asks for a frame before the source's first one", () => {
    expect(times(clipEdl(whole, 0, 1), 30, 0.033)[0]).toBe(0.033);
  });
});

describe("audioSegments", () => {
  it("a clip with no cuts is one segment", () => {
    const { segments, totalSamples } = audioSegments(clipEdl(whole, 2, 5), 48_000);
    expect(segments).toEqual([{ srcStart: 96_000, outStart: 0, length: 144_000 }]);
    expect(totalSamples).toBe(144_000);
  });

  it("a clip with several cuts: segments tile the output with no gap or overlap", () => {
    const c = clipEdl(cut, 0, 10);
    const { segments, totalSamples } = audioSegments(c, 48_000);
    expect(segments).toEqual([
      { srcStart: 48_000, outStart: 0, length: 48_000 },
      { srcStart: 144_000, outStart: 48_000, length: 96_000 },
      { srcStart: 336_000, outStart: 144_000, length: 48_000 },
    ]);
    expect(totalSamples).toBe(4 * 48_000);
  });

  it("clips starting and ending on a cut start and end on kept audio", () => {
    expect(audioSegments(clipEdl(cut, 2.4, 6), 48_000).segments).toEqual([{ srcStart: 144_000, outStart: 0, length: 96_000 }]);
    const end = audioSegments(clipEdl(cut, 1.5, 6), 48_000);
    expect(end.segments[end.segments.length - 1]).toEqual({ srcStart: 144_000, outStart: 24_000, length: 96_000 });
  });

  it("a very short clip", () => {
    expect(audioSegments(clipEdl(whole, 3, 3.05), 44_100)).toEqual({
      segments: [{ srcStart: 132_300, outStart: 0, length: 2205 }],
      totalSamples: 2205,
    });
  });

  it("rounding at joins: off-grid joins stay within half a sample of their edited time and never accumulate", () => {
    const sr = 44_100;
    // 200 kept ranges of 33.3337 ms with 10 ms cuts between: lengths are never a whole number of samples.
    const spans = Array.from({ length: 200 }, (_, i) => ({ start: i * 0.0433337, end: i * 0.0433337 + 0.0333337 }));
    const edl = fromSpans(spans, 20);
    const { segments, totalSamples } = audioSegments(edl, sr);
    expect(segments).toHaveLength(200);
    let out = 0;
    segments.forEach((s, i) => {
      expect(s.outStart).toBe(out);
      expect(Math.abs(s.outStart - edl.ranges[i].offset * sr)).toBeLessThanOrEqual(0.5);
      out += s.length;
    });
    expect(totalSamples).toBe(out);
    expect(totalSamples).toBe(Math.round(edl.duration * sr));
    // Rounding each length separately would drift by up to 100 samples here.
  });

  it("audio and the frame on each join agree to within half a sample", () => {
    const fps = 30;
    const sr = 48_000;
    const c = clipEdl(cut, 0, 10);
    const { segments } = audioSegments(c, sr);
    segments.forEach((s, i) => {
      const n = Math.round(c.ranges[i].offset * fps);
      expect(Math.abs(s.outStart / sr - frameTime(n, fps))).toBeLessThanOrEqual(0.5 / sr);
    });
  });

  it("an empty clip has no audio", () => {
    expect(audioSegments(clipEdl(cut, 2.2, 2.8), 48_000)).toEqual({ segments: [], totalSamples: 0 });
  });
});

describe("videoBitrate", () => {
  it("is about 8 Mbps at 1080x1920 30 fps and scales with pixels per second", () => {
    expect(videoBitrate(1080, 1920, 30)).toBe(8_100_000);
    expect(videoBitrate(720, 1280, 30)).toBe(3_600_000);
    expect(videoBitrate(1080, 1920, 24)).toBeLessThan(videoBitrate(1080, 1920, 30));
    expect(videoBitrate(10, 10, 1)).toBe(500_000);
  });
});

describe("exportFileName", () => {
  it("ends in .mp4 exactly once", () => {
    expect(exportFileName("My clip")).toBe("My clip.mp4");
    expect(exportFileName("My clip.mp4")).toBe("My clip.mp4");
    expect(exportFileName("My clip.MP4")).toBe("My clip.mp4");
  });

  it("removes characters a file name can't have, and is never empty", () => {
    expect(exportFileName('a/b\\c:d*e?"f<g>h|i')).toBe("a b c d e f g h i.mp4");
    expect(exportFileName("  ")).toBe("clip.mp4");
    expect(exportFileName("...")).toBe("clip.mp4");
    expect(exportFileName("..hidden")).toBe("hidden.mp4");
    expect(exportFileName("x".repeat(300))).toHaveLength(124);
  });
});

describe("codecName", () => {
  it("names codecs the way people know them", () => {
    expect(codecName("avc")).toBe("H.264");
    expect(codecName("hevc")).toBe("HEVC (H.265)");
    expect(codecName("aac")).toBe("AAC");
    expect(codecName("pcm-s16")).toBe("PCM");
    expect(codecName("prores")).toBe("prores");
    expect(codecName(null)).toBe("an unknown codec");
  });
});
