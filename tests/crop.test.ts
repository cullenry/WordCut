import { describe, expect, it } from "vitest";
import {
  DEFAULT_CROP,
  MAX_ZOOM,
  clampOffset,
  cropAspectLabel,
  cropFromOffset,
  cropFromRect,
  cropRatio,
  cropRect,
  normalizeCrop,
  panCrop,
  resizeCrop,
  sameCrop,
  setCropAspect,
  zoomCrop,
  type Crop,
  type CropRect,
} from "@/lib/clips/crop";

const crop = (patch: Partial<Crop> = {}): Crop => ({ ...DEFAULT_CROP, ...patch });

const inside = (r: CropRect, w: number, h: number) => {
  expect(r.x).toBeGreaterThanOrEqual(-1e-9);
  expect(r.y).toBeGreaterThanOrEqual(-1e-9);
  expect(r.x + r.w).toBeLessThanOrEqual(w + 1e-9);
  expect(r.y + r.h).toBeLessThanOrEqual(h + 1e-9);
};

describe("cropRect", () => {
  it("centres the largest 9:16 window on a 16:9 source by default", () => {
    const r = cropRect(1920, 1080);
    expect(r.h).toBe(1080);
    expect(r.w).toBeCloseTo(607.5, 9);
    expect(r.y).toBe(0);
    expect(r.x).toBeCloseTo((1920 - 607.5) / 2, 9);
  });

  it("pins to the left edge at x = -1 and the right edge at x = 1", () => {
    expect(cropRect(1920, 1080, crop({ x: -1 })).x).toBe(0);
    const right = cropRect(1920, 1080, crop({ x: 1 }));
    expect(right.x + right.w).toBeCloseTo(1920, 9);
  });

  it("gives each preset its shape", () => {
    for (const [aspect, ratio] of [["9:16", 9 / 16], ["1:1", 1], ["4:5", 0.8], ["16:9", 16 / 9]] as const) {
      const r = cropRect(1920, 1080, crop({ aspect }));
      expect(r.w / r.h).toBeCloseTo(ratio, 9);
      inside(r, 1920, 1080);
    }
  });

  it("uses the whole frame for 'original' and a 16:9 preset on a 16:9 source", () => {
    expect(cropRect(1920, 1080, crop({ aspect: "original" }))).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    const r = cropRect(1920, 1080, crop({ aspect: "16:9", x: 1, y: -1 }));
    expect(r.w).toBeCloseTo(1920, 9);
    expect(r.h).toBeCloseTo(1080, 9);
  });

  it("shrinks around its position with zoom", () => {
    const r = cropRect(1920, 1080, crop({ aspect: "original", zoom: 2 }));
    expect(r).toEqual({ x: 480, y: 270, w: 960, h: 540 });
    const corner = cropRect(1920, 1080, crop({ aspect: "original", zoom: 2, x: 1, y: 1 }));
    expect(corner).toEqual({ x: 960, y: 540, w: 960, h: 540 });
  });

  it("takes a free window's ratio from the crop", () => {
    const r = cropRect(1920, 1080, crop({ aspect: "free", ratio: 2 }));
    expect(r).toEqual({ x: 0, y: 60, w: 1920, h: 960 });
  });

  it("slides vertically on a source taller than the window", () => {
    const top = cropRect(1080, 2400, crop({ y: -1 }));
    const bottom = cropRect(1080, 2400, crop({ y: 1 }));
    expect(top).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
    expect(bottom.y + bottom.h).toBeCloseTo(2400, 9);
  });

  it("always stays inside the source, whatever the crop", () => {
    for (const [w, h] of [[1920, 1080], [1000, 1000], [3840, 1600], [1080, 2400]]) {
      for (const aspect of ["9:16", "1:1", "4:5", "16:9", "original", "free"] as const) {
        for (const zoom of [1, 2.5, MAX_ZOOM]) {
          for (const o of [-1, 0.3, 1]) inside(cropRect(w, h, crop({ aspect, ratio: 3, zoom, x: o, y: -o })), w, h);
        }
      }
    }
  });

  it("returns an empty rect for a source with no size", () => {
    expect(cropRect(0, 0)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(cropRect(NaN, 1080)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("normalizeCrop / cropFromOffset / sameCrop", () => {
  it("repairs junk field by field", () => {
    expect(normalizeCrop(null)).toEqual(DEFAULT_CROP);
    expect(normalizeCrop({ aspect: "3:2", zoom: 99, x: -7, y: NaN, ratio: 0 })).toEqual({
      aspect: "9:16",
      ratio: 1,
      zoom: MAX_ZOOM,
      x: -1,
      y: 0,
    });
    expect(normalizeCrop({ aspect: "free", ratio: 40 }).ratio).toBe(5);
    expect(normalizeCrop({ zoom: 0.2 }).zoom).toBe(1);
  });

  it("turns an old 9:16 slider position into the same window", () => {
    const old = cropFromOffset(-0.6);
    expect(old.aspect).toBe("9:16");
    expect(cropRect(1920, 1080, old).x).toBeCloseTo(((1920 - 607.5) * 0.4) / 2, 9);
    expect(cropRect(1080, 2400, old).y).toBeCloseTo(((2400 - 1920) * 0.4) / 2, 9);
    expect(cropFromOffset(5).x).toBe(1);
  });

  it("compares every field", () => {
    expect(sameCrop(crop(), crop())).toBe(true);
    expect(sameCrop(crop(), crop({ zoom: 1.01 }))).toBe(false);
    expect(sameCrop(crop(), crop({ aspect: "1:1" }))).toBe(false);
  });

  it("clampOffset handles junk", () => {
    expect([clampOffset(2), clampOffset(-2), clampOffset(0.3), clampOffset(NaN), clampOffset(Infinity)]).toEqual([
      1, -1, 0.3, 0, 0,
    ]);
  });
});

describe("cropFromRect", () => {
  it("round-trips the window of any crop", () => {
    for (const c of [crop(), crop({ x: 0.4, zoom: 2, y: -0.5 }), crop({ aspect: "1:1", zoom: 3, x: -1, y: 1 })]) {
      const back = cropFromRect(1920, 1080, cropRect(1920, 1080, c), c.aspect);
      const a = cropRect(1920, 1080, back);
      const b = cropRect(1920, 1080, c);
      for (const k of ["x", "y", "w", "h"] as const) expect(a[k]).toBeCloseTo(b[k], 6);
    }
  });

  it("takes the ratio from the window when free", () => {
    const c = cropFromRect(1920, 1080, { x: 100, y: 100, w: 800, h: 400 }, "free");
    expect(c.ratio).toBeCloseTo(2, 9);
    const r = cropRect(1920, 1080, c);
    for (const [k, v] of [["x", 100], ["y", 100], ["w", 800], ["h", 400]] as const) expect(r[k]).toBeCloseTo(v, 6);
  });
});

describe("panCrop", () => {
  it("moves the window by source pixels and stops at the edges", () => {
    const c = crop({ aspect: "original", zoom: 2 });
    expect(cropRect(1920, 1080, panCrop(1920, 1080, c, 100, -50))).toEqual({ x: 580, y: 220, w: 960, h: 540 });
    const far = cropRect(1920, 1080, panCrop(1920, 1080, c, 5000, 5000));
    expect(far).toEqual({ x: 960, y: 540, w: 960, h: 540 });
  });

  it("only changes the position", () => {
    const c = crop({ zoom: 1.7 });
    const moved = panCrop(1920, 1080, c, 30, 0);
    expect({ ...moved, x: 0, y: 0 }).toEqual({ ...c, x: 0, y: 0 });
  });
});

describe("zoomCrop", () => {
  it("zooms about the window's centre", () => {
    const c = panCrop(1920, 1080, crop({ aspect: "original", zoom: 2 }), 200, 100);
    const before = cropRect(1920, 1080, c);
    const after = cropRect(1920, 1080, zoomCrop(1920, 1080, c, 4));
    expect(after.w).toBeCloseTo(480, 9);
    expect(after.x + after.w / 2).toBeCloseTo(before.x + before.w / 2, 6);
    expect(after.y + after.h / 2).toBeCloseTo(before.y + before.h / 2, 6);
  });

  it("is pushed back inside when zooming out near an edge", () => {
    const c = crop({ aspect: "original", zoom: 4, x: 1, y: 1 });
    const out = cropRect(1920, 1080, zoomCrop(1920, 1080, c, 1.5));
    inside(out, 1920, 1080);
    expect(out.x + out.w).toBeCloseTo(1920, 6);
  });

  it("clamps the zoom", () => {
    expect(zoomCrop(1920, 1080, crop(), 50).zoom).toBe(MAX_ZOOM);
    expect(zoomCrop(1920, 1080, crop(), 0.1).zoom).toBe(1);
  });
});

describe("setCropAspect", () => {
  it("starts a preset from its largest window, centred where the old one was", () => {
    const c = crop({ x: -1 });
    const sq = setCropAspect(1920, 1080, c, "1:1");
    const r = cropRect(1920, 1080, sq);
    expect(sq.zoom).toBe(1);
    expect(r.w).toBeCloseTo(1080, 9);
    // The 9:16 window's centre was at 303.75, too near the edge for a square: pinned left.
    expect(r.x).toBe(0);
  });

  it("keeps the window as it is when going free", () => {
    const c = crop({ zoom: 2, x: 0.3 });
    const free = setCropAspect(1920, 1080, c, "free");
    expect(free.aspect).toBe("free");
    const a = cropRect(1920, 1080, free);
    const b = cropRect(1920, 1080, c);
    for (const k of ["x", "y", "w", "h"] as const) expect(a[k]).toBeCloseTo(b[k], 6);
  });

  it("does nothing for the same aspect", () => {
    const c = crop({ zoom: 2 });
    expect(setCropAspect(1920, 1080, c, "9:16")).toBe(c);
  });
});

describe("resizeCrop", () => {
  const src = [1920, 1080] as const;

  it("keeps a fixed aspect and the opposite corner when dragging a corner", () => {
    const c = crop({ aspect: "original", zoom: 2 }); // 480,270 960x540
    const r = cropRect(...src, resizeCrop(...src, c, "se", 480 + 480, 270 + 200));
    expect(r.x).toBeCloseTo(480, 6);
    expect(r.y).toBeCloseTo(270, 6);
    // The pointer went 480 across and 200 down; across is further at 16:9, so it wins.
    expect(r.w).toBeCloseTo(480, 6);
    expect(r.w / r.h).toBeCloseTo(16 / 9, 9);
  });

  it("grows a fixed aspect about the centre line from an edge grip", () => {
    const c = crop({ aspect: "original", zoom: 2 });
    const r = cropRect(...src, resizeCrop(...src, c, "s", 960, 270 + 720));
    expect(r.y).toBeCloseTo(270, 6);
    expect(r.h).toBeCloseTo(720, 6);
    expect(r.x + r.w / 2).toBeCloseTo(960, 6);
  });

  it("moves each side on its own when free", () => {
    const c = cropFromRect(...src, { x: 100, y: 100, w: 800, h: 400 }, "free");
    const r = cropRect(...src, resizeCrop(...src, c, "e", 1500, 9999));
    expect(r.x).toBeCloseTo(100, 6);
    expect(r.w).toBeCloseTo(1400, 6);
    expect(r.h).toBeCloseTo(400, 6);
    const r2 = cropRect(...src, resizeCrop(...src, c, "nw", 0, 50));
    expect(r2.x).toBeCloseTo(0, 6);
    expect(r2.y).toBeCloseTo(50, 6);
    expect(r2.x + r2.w).toBeCloseTo(900, 6);
    expect(r2.y + r2.h).toBeCloseTo(500, 6);
  });

  it("never leaves the source or shrinks past the zoom limit", () => {
    const c = crop({ aspect: "1:1", zoom: 2 });
    const big = cropRect(...src, resizeCrop(...src, c, "se", 99999, 99999));
    inside(big, ...src);
    const tiny = resizeCrop(...src, c, "se", -99999, -99999);
    expect(tiny.zoom).toBeCloseTo(MAX_ZOOM, 6);
    for (const h of ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const) {
      inside(cropRect(...src, resizeCrop(...src, crop({ aspect: "free", ratio: 1.3 }), h, -500, 3000)), ...src);
    }
  });
});

describe("cropRatio / cropAspectLabel", () => {
  it("reads the ratio of each kind", () => {
    expect(cropRatio(crop(), 1920, 1080)).toBeCloseTo(9 / 16, 9);
    expect(cropRatio(crop({ aspect: "original" }), 1440, 1080)).toBeCloseTo(4 / 3, 9);
    expect(cropRatio(crop({ aspect: "free", ratio: 2.35 }), 1920, 1080)).toBe(2.35);
  });

  it("names presets, known ratios and free ones", () => {
    expect(cropAspectLabel(crop({ aspect: "4:5" }), 1920, 1080)).toBe("4:5");
    expect(cropAspectLabel(crop({ aspect: "original" }), 1920, 1080)).toBe("16:9");
    expect(cropAspectLabel(crop({ aspect: "free", ratio: 2.35 }), 1920, 1080)).toBe("2.35:1");
    expect(cropAspectLabel(crop({ aspect: "free", ratio: 0.5 }), 1920, 1080)).toBe("1:2");
  });
});
