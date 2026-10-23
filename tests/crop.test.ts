import { describe, expect, it } from "vitest";
import {
  clampOffset,
  cropAxis,
  cropFraction,
  cropRect,
  offsetForCentre,
  windowStart,
} from "@/lib/clips/crop";

describe("cropRect", () => {
  it("centres a 9:16 window on a 16:9 source by default", () => {
    const r = cropRect(1920, 1080);
    expect(r.h).toBe(1080);
    expect(r.w).toBeCloseTo(607.5, 9);
    expect(r.y).toBe(0);
    expect(r.x).toBeCloseTo((1920 - 607.5) / 2, 9);
    expect(r.w / r.h).toBeCloseTo(9 / 16, 9);
  });

  it("pins to the left edge at offset -1 and the right edge at +1", () => {
    const left = cropRect(1920, 1080, -1);
    const right = cropRect(1920, 1080, 1);
    expect(left.x).toBe(0);
    expect(right.x + right.w).toBeCloseTo(1920, 9);
    expect(right.x).toBeCloseTo(1920 - 607.5, 9);
  });

  it("clamps offsets past either edge", () => {
    expect(cropRect(1920, 1080, -5)).toEqual(cropRect(1920, 1080, -1));
    expect(cropRect(1920, 1080, 9)).toEqual(cropRect(1920, 1080, 1));
    expect(cropRect(1920, 1080, NaN)).toEqual(cropRect(1920, 1080, 0));
  });

  it("moves linearly between the edges", () => {
    const a = cropRect(1920, 1080, -0.5).x;
    const b = cropRect(1920, 1080, 0).x;
    const c = cropRect(1920, 1080, 0.5).x;
    expect(b - a).toBeCloseTo(c - b, 9);
  });

  it("always stays inside the source", () => {
    for (const [w, h] of [[1920, 1080], [1280, 720], [1000, 1000], [3840, 1600], [1080, 2400]]) {
      for (const o of [-1, -0.3, 0, 0.7, 1]) {
        const r = cropRect(w, h, o);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(-1e-9);
        expect(r.x + r.w).toBeLessThanOrEqual(w + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(h + 1e-9);
      }
    }
  });

  it("uses the full frame of a source that is already 9:16", () => {
    expect(cropRect(1080, 1920, 0.8)).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
  });

  it("slides vertically on a source taller than 9:16", () => {
    expect(cropAxis(1080, 2400)).toBe("y");
    const top = cropRect(1080, 2400, -1);
    const bottom = cropRect(1080, 2400, 1);
    expect(top).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
    expect(bottom.y + bottom.h).toBeCloseTo(2400, 9);
  });

  it("returns an empty rect for a source with no size", () => {
    expect(cropRect(0, 0)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(cropRect(NaN, 1080)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("cropFraction / offsetForCentre / windowStart", () => {
  it("is the window's share of the source along the slack axis", () => {
    expect(cropFraction(1920, 1080)).toBeCloseTo(607.5 / 1920, 9);
    expect(cropFraction(1080, 1920)).toBe(1);
    expect(cropFraction(1080, 2400)).toBeCloseTo(1920 / 2400, 9);
  });

  it("round-trips a window position through an offset", () => {
    const f = cropFraction(1920, 1080);
    for (const o of [-1, -0.25, 0, 0.6, 1]) {
      const centre = windowStart(o, f) + f / 2;
      expect(offsetForCentre(centre, f)).toBeCloseTo(o, 9);
    }
  });

  it("pins when the pointer goes past either edge", () => {
    const f = cropFraction(1920, 1080);
    expect(offsetForCentre(-0.4, f)).toBe(-1);
    expect(offsetForCentre(1.7, f)).toBe(1);
    expect(offsetForCentre(0.5, f)).toBeCloseTo(0, 9);
  });

  it("has nothing to slide when the window fills the source", () => {
    expect(offsetForCentre(0.2, 1)).toBe(0);
    expect(windowStart(1, 1)).toBe(0);
  });

  it("clampOffset handles junk", () => {
    expect([clampOffset(2), clampOffset(-2), clampOffset(0.3), clampOffset(NaN), clampOffset(Infinity)]).toEqual([
      1, -1, 0.3, 0, 0,
    ]);
  });
});
