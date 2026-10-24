import { describe, expect, it } from "vitest";
import { renderClipFrame } from "@/lib/captions/frame";
import { groupCaptionPages, type CaptionWord } from "@/lib/captions/group";
import { blockTop, DESIGN_H, DESIGN_W, layoutPage } from "@/lib/captions/layout";
import { drawCaptions, paintCaptions, popScale, type Ctx2D } from "@/lib/captions/render";
import { drawCaptionSample } from "@/lib/captions/sample";
import { captionPagesFor } from "@/lib/captions/words";
import { DEFAULT_CAPTIONS, type CaptionSettings } from "@/lib/captions/types";
import { DEFAULT_CROP } from "@/lib/clips/crop";
import { clipEdl } from "@/lib/clips/range";
import { buildEdl } from "@/lib/edl/edl";
import { makeWords } from "./helpers";

interface Drawn {
  text: string;
  /** Absolute canvas position of the text's left edge and middle, after every transform. */
  x: number;
  y: number;
  /** Font size on the canvas, after transforms. */
  px: number;
  fill: string;
}

/** A recording stand-in for a 2D context: 0.6 em per character, tracks translate and scale. */
class FakeCtx {
  font = "700 58px Inter";
  fillStyle: unknown = "";
  strokeStyle: unknown = "";
  lineWidth = 1;
  [k: string]: unknown;
  texts: Drawn[] = [];
  strokes: string[] = [];
  boxes: { fill: string }[] = [];
  images: number[][] = [];
  rects: number[][] = [];
  private m = { a: 1, d: 1, e: 0, f: 0 };
  private stack: (typeof this.m)[] = [];
  private pathOpen = false;

  private get px() {
    return Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
  }
  save() {
    this.stack.push({ ...this.m });
  }
  restore() {
    this.m = this.stack.pop()!;
  }
  translate(x: number, y: number) {
    this.m.e += x * this.m.a;
    this.m.f += y * this.m.d;
  }
  scale(a: number, d: number) {
    this.m.a *= a;
    this.m.d *= d;
  }
  measureText(t: string) {
    return { width: t.length * this.px * 0.6 };
  }
  fillText(text: string, x: number, y: number) {
    this.texts.push({
      text,
      x: this.m.e + x * this.m.a,
      y: this.m.f + y * this.m.d,
      px: this.px * this.m.a,
      fill: String(this.fillStyle),
    });
  }
  strokeText(text: string) {
    this.strokes.push(text);
  }
  beginPath() {
    this.pathOpen = true;
  }
  moveTo() {}
  arcTo() {}
  closePath() {}
  fill() {
    if (this.pathOpen) this.boxes.push({ fill: String(this.fillStyle) });
    this.pathOpen = false;
  }
  fillRect(...a: number[]) {
    this.rects.push(a);
  }
  drawImage(_img: unknown, ...a: number[]) {
    this.images.push(a);
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
}

const ctxOf = () => new FakeCtx() as unknown as Ctx2D & FakeCtx;

const speak = (texts: string[], dur = 0.3, gap = 0.1): CaptionWord[] =>
  texts.map((text, i) => ({ id: `w${i}`, text, start: i * (dur + gap), end: i * (dur + gap) + dur }));

const settings = (patch: Partial<CaptionSettings> = {}): CaptionSettings => ({ ...DEFAULT_CAPTIONS, ...patch });
const pagesOf = (texts: string[]) => groupCaptionPages(speak(texts));

describe("drawCaptions", () => {
  const pages = pagesOf(["make", "it", "count"]); // one line, words start at 0, 0.4, 0.8

  it("draws nothing when captions are off, or between pages", () => {
    const off = ctxOf();
    drawCaptions(off, pages, 0.5, settings({ enabled: false }));
    expect(off.texts).toEqual([]);
    const gap = ctxOf();
    drawCaptions(gap, pages, 9, settings());
    drawCaptions(gap, pages, -1, settings());
    expect(gap.texts).toEqual([]);
  });

  it("draws every word of the page in order, in the style's case", () => {
    const bold = ctxOf();
    drawCaptions(bold, pages, 0.5, settings({ style: "bold" }));
    expect(bold.texts.map((t) => t.text)).toEqual(["MAKE", "IT", "COUNT"]);
    const minimal = ctxOf();
    drawCaptions(minimal, pages, 0.5, settings({ style: "minimal" }));
    expect(minimal.texts.map((t) => t.text)).toEqual(["make", "it", "count"]);
  });

  it("highlights only the word being spoken, in the chosen colour", () => {
    for (const style of ["bold", "minimal"] as const) {
      const c = ctxOf();
      drawCaptions(c, pages, 0.5, settings({ style, color: "#22D3EE" }));
      expect(c.texts.map((t) => t.fill === "#22D3EE")).toEqual([false, true, false]);
      const early = ctxOf();
      drawCaptions(early, pages, 0.1, settings({ style, color: "#22D3EE" }));
      expect(early.texts.map((t) => t.fill === "#22D3EE")).toEqual([true, false, false]);
    }
  });

  it("boxed: a box behind each line, and an accent box behind the active word with readable text", () => {
    const c = ctxOf();
    drawCaptions(c, pages, 0.5, settings({ style: "boxed", color: "#FFD60A" }));
    expect(c.boxes.map((b) => b.fill)).toEqual(["rgba(14, 14, 20, 0.84)", "#FFD60A"]);
    expect(c.texts.map((t) => t.fill)).toEqual(["#ffffff", "#000000", "#ffffff"]);
  });

  it("bold: outlines every word", () => {
    const c = ctxOf();
    drawCaptions(c, pages, 0.5, settings({ style: "bold" }));
    expect(c.strokes).toEqual(["MAKE", "IT", "COUNT"]);
  });

  it("never shows a cut word", () => {
    const words = makeWords([
      ["so", 1, 1.3],
      ["um", 1.5, 1.8],
      ["this", 2, 2.3],
      ["works", 2.5, 2.9],
    ]);
    const deleted = new Set(["w1"]);
    const edl = buildEdl(words, deleted, 6);
    const clip = clipEdl(edl, 0.88, 3.02);
    const cut = captionPagesFor(words, deleted, clip, 0.88, 3.02);
    for (const style of ["bold", "minimal", "boxed"] as const) {
      for (let t = 0; t < clip.duration; t += 0.05) {
        const c = ctxOf();
        drawCaptions(c, cut, t, settings({ style }));
        expect(c.texts.map((x) => x.text.toLowerCase())).not.toContain("um");
      }
    }
  });

  it("keeps the layout still while the highlight moves", () => {
    const xs = (t: number) => {
      const c = ctxOf();
      drawCaptions(c, pages, t, settings({ style: "minimal" }));
      return c.texts.map((x) => [x.x, x.y]);
    };
    expect(xs(0.1)).toEqual(xs(0.5));
    expect(xs(0.5)).toEqual(xs(0.9));
  });

  it("centres each line on the canvas", () => {
    const c = ctxOf();
    drawCaptions(c, pagesOf(["one", "two"]), 0.1, settings({ style: "minimal" }));
    const [a, b] = c.texts;
    const left = a.x;
    const right = b.x + "two".length * b.px * 0.6;
    expect((left + right) / 2).toBeCloseTo(DESIGN_W / 2, 6);
  });

  it("stacks a second line below the first", () => {
    const c = ctxOf();
    drawCaptions(c, pagesOf("one two three four five six".split(" ")), 0.1, settings({ style: "minimal" }));
    const ys = [...new Set(c.texts.map((t) => t.y))];
    expect(ys).toHaveLength(2);
    expect(ys[1]).toBeGreaterThan(ys[0]);
  });

  it("places the block at the top, middle or bottom", () => {
    const yOf = (position: CaptionSettings["position"]) => {
      const c = ctxOf();
      drawCaptions(c, pages, 0.1, settings({ style: "minimal", position }));
      return c.texts[0].y;
    };
    const [top, middle, bottom] = [yOf("top"), yOf("middle"), yOf("bottom")];
    expect(top).toBeLessThan(DESIGN_H * 0.25);
    expect(middle).toBeGreaterThan(DESIGN_H * 0.45);
    expect(middle).toBeLessThan(DESIGN_H * 0.55);
    expect(bottom).toBeGreaterThan(DESIGN_H * 0.65);
    expect(top).toBeLessThan(middle);
    expect(middle).toBeLessThan(bottom);
  });

  it("scales the font with the size setting", () => {
    const px = (size: number) => {
      const c = ctxOf();
      drawCaptions(c, pages, 0.1, settings({ style: "minimal", size }));
      return c.texts[0].px;
    };
    expect(px(1.5)).toBeCloseTo(px(1) * 1.5, 6);
    expect(px(0.6)).toBeLessThan(px(1));
  });

  it("shrinks a very long word to fit instead of running off the canvas", () => {
    const long = "pneumonoultramicroscopicsilicovolcanoconiosis";
    const long2 = pagesOf(["a", long]);
    for (const style of ["bold", "minimal", "boxed"] as const) {
      const normal = ctxOf();
      drawCaptions(normal, pagesOf(["a", "b"]), 0.1, settings({ style }));
      const c = ctxOf();
      drawCaptions(c, long2, 0.1, settings({ style }));
      expect(c.texts[0].px).toBeLessThan(normal.texts[0].px);
      for (const t of c.texts) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x + t.text.length * t.px * 0.6).toBeLessThanOrEqual(DESIGN_W + 1e-6);
      }
    }
  });

  it("scales from the design space to any canvas size, so preview and export lay out alike", () => {
    const full = ctxOf();
    const half = ctxOf();
    paintCaptions(full, 1080, 1920, pages, 0.5, settings({ style: "boxed" }));
    paintCaptions(half, 540, 960, pages, 0.5, settings({ style: "boxed" }));
    expect(half.texts.map((t) => t.text)).toEqual(full.texts.map((t) => t.text));
    half.texts.forEach((t, i) => {
      expect(t.x * 2).toBeCloseTo(full.texts[i].x, 6);
      expect(t.y * 2).toBeCloseTo(full.texts[i].y, 6);
      expect(t.px * 2).toBeCloseTo(full.texts[i].px, 6);
    });
  });
});

describe("paintCaptions on other shapes", () => {
  const pages = pagesOf(["make", "it", "count"]);

  it("never stretches: a landscape canvas gets the type its height allows, centred", () => {
    const tall = ctxOf();
    const wide = ctxOf();
    paintCaptions(tall, 1080, 1920, pages, 0.5, settings({ style: "minimal" }));
    paintCaptions(wide, 1920, 1080, pages, 0.5, settings({ style: "minimal" }));
    const k = 1080 / 1920;
    wide.texts.forEach((t, i) => {
      expect(t.px).toBeCloseTo(tall.texts[i].px * k, 6);
      expect(t.y).toBeCloseTo(tall.texts[i].y * k, 6);
      // The 9:16 design frame sits in the middle of the wide canvas.
      expect(t.x).toBeCloseTo((1920 - 1080 * k) / 2 + tall.texts[i].x * k, 6);
    });
  });

  it("puts a square canvas's captions at the same height fraction", () => {
    const tall = ctxOf();
    const square = ctxOf();
    paintCaptions(tall, 1080, 1920, pages, 0.5, settings({ position: "bottom" }));
    paintCaptions(square, 1080, 1080, pages, 0.5, settings({ position: "bottom" }));
    expect(square.texts[0].y / 1080).toBeCloseTo(tall.texts[0].y / 1920, 6);
  });
});

describe("popScale", () => {
  it("starts large and settles to 1", () => {
    expect(popScale(0)).toBeCloseTo(1.12, 9);
    expect(popScale(0.06)).toBeGreaterThan(1);
    expect(popScale(0.06)).toBeLessThan(popScale(0.01));
    expect(popScale(0.12)).toBe(1);
    expect(popScale(5)).toBe(1);
  });
  it("is 1 before the word starts or for junk", () => {
    expect(popScale(-0.5)).toBe(1);
    expect(popScale(NaN)).toBe(1);
  });
});

describe("layoutPage", () => {
  const measure = (t: string) => t.length * 10;
  const page = groupCaptionPages(speak(["ab", "cde", "f"]))[0];

  it("lays words left to right with a space between", () => {
    const l = layoutPage(page, measure, { uppercase: false, maxWidth: 1000, space: 4 });
    expect(l.scale).toBe(1);
    expect(l.lines[0].words.map((w) => [w.text, w.x, w.width])).toEqual([
      ["ab", 0, 20],
      ["cde", 24, 30],
      ["f", 58, 10],
    ]);
    expect(l.lines[0].width).toBe(68);
  });

  it("shrinks everything when a line is too wide, but never below the floor", () => {
    expect(layoutPage(page, measure, { uppercase: false, maxWidth: 34, space: 4 }).scale).toBeCloseTo(0.5, 9);
    expect(layoutPage(page, measure, { uppercase: false, maxWidth: 1, space: 4 }).scale).toBe(0.25);
  });

  it("upper-cases when asked", () => {
    expect(layoutPage(page, measure, { uppercase: true, maxWidth: 999, space: 0 }).lines[0].words[0].text).toBe("AB");
  });

  it("anchors top and bottom edges so the block grows inward", () => {
    expect(blockTop("top", 100)).toBe(blockTop("top", 300));
    expect(blockTop("bottom", 100) + 100).toBe(blockTop("bottom", 300) + 300);
    expect(blockTop("middle", 200)).toBe((DESIGN_H - 200) / 2);
  });
});

describe("renderClipFrame", () => {
  const frame = (patch = {}) => ({
    image: {} as CanvasImageSource,
    imageWidth: 1920,
    imageHeight: 1080,
    crop: DEFAULT_CROP,
    pages: pagesOf(["make", "it", "count"]),
    time: 0.5,
    settings: settings({ style: "minimal" }),
    ...patch,
  });

  it("draws the cropped video over the whole canvas, then the captions", () => {
    const c = ctxOf();
    renderClipFrame(c, 540, 960, frame({ crop: { ...DEFAULT_CROP, x: -1 } }));
    expect(c.images).toHaveLength(1);
    const [sx, sy, sw, sh, dx, dy, dw, dh] = c.images[0];
    expect([sx, sy, sh]).toEqual([0, 0, 1080]);
    expect(sw).toBeCloseTo(607.5, 9);
    expect([dx, dy, dw, dh]).toEqual([0, 0, 540, 960]);
    expect(c.texts.length).toBe(3);
  });

  it("moves the crop with the offset", () => {
    const x = (offset: number) => {
      const c = ctxOf();
      renderClipFrame(c, 540, 960, frame({ crop: { ...DEFAULT_CROP, x: offset } }));
      return c.images[0][0];
    };
    expect(x(-1)).toBe(0);
    expect(x(0)).toBeCloseTo(656.25, 9);
    expect(x(1)).toBeCloseTo(1312.5, 9);
  });

  it("draws a zoomed, square crop", () => {
    const c = ctxOf();
    renderClipFrame(c, 500, 500, frame({ crop: { ...DEFAULT_CROP, aspect: "1:1", zoom: 2, x: 1, y: -1 } }));
    expect(c.images[0]).toEqual([1920 - 540, 0, 540, 540, 0, 0, 500, 500]);
  });

  it("skips the captions when they are off, but still draws the video", () => {
    const c = ctxOf();
    renderClipFrame(c, 540, 960, frame({ settings: settings({ enabled: false }) }));
    expect(c.images).toHaveLength(1);
    expect(c.texts).toEqual([]);
  });

  it("draws nothing for the image if the source has no size yet", () => {
    const c = ctxOf();
    renderClipFrame(c, 540, 960, frame({ imageWidth: 0, imageHeight: 0 }));
    expect(c.images).toEqual([]);
  });
});

describe("drawCaptionSample", () => {
  it("uses the real painter, with the style and colour of the card", () => {
    const c = ctxOf();
    drawCaptionSample(c, 300, 72, settings({ style: "bold", color: "#FF5C93" }));
    expect(c.texts.map((t) => t.text)).toEqual(["SAY", "IT", "OUT", "LOUD"]);
    expect(c.texts.map((t) => t.fill)).toEqual(["#ffffff", "#FF5C93", "#ffffff", "#ffffff"]);
    for (const t of c.texts) {
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(72);
    }
  });
});
