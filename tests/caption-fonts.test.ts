import { describe, expect, it } from "vitest";
import { absolutizeFontSrc, captionCharacters, familiesOf } from "@/lib/captions/fonts";
import { captionFont, DEFAULT_FONT_FAMILY } from "@/lib/captions/render";

describe("familiesOf", () => {
  it("splits a font stack into unquoted names", () => {
    expect(familiesOf(`'Inter', 'Inter Fallback'`)).toEqual(["Inter", "Inter Fallback"]);
    expect(familiesOf(`__Inter_d65c78, system-ui, sans-serif`)).toEqual(["__Inter_d65c78", "system-ui", "sans-serif"]);
    expect(familiesOf(`"Segoe UI", Roboto`)).toEqual(["Segoe UI", "Roboto"]);
    expect(familiesOf(`"A, B", C`)).toEqual(["A, B", "C"]);
    expect(familiesOf("")).toEqual([]);
  });
});

describe("absolutizeFontSrc", () => {
  const base = "http://localhost:3000/_next/static/css/app.css";

  it("resolves every url() against the stylesheet", () => {
    expect(absolutizeFontSrc(`url(/_next/static/media/inter.woff2) format("woff2")`, base)).toBe(
      `url("http://localhost:3000/_next/static/media/inter.woff2") format("woff2")`,
    );
    expect(absolutizeFontSrc(`url("../media/a.woff2") format("woff2"), url('b.woff')`, base)).toBe(
      `url("http://localhost:3000/_next/static/media/a.woff2") format("woff2"), url("http://localhost:3000/_next/static/css/b.woff")`,
    );
  });

  it("leaves local() sources alone", () => {
    expect(absolutizeFontSrc(`local("Arial")`, base)).toBe(`local("Arial")`);
  });
});

describe("captionCharacters", () => {
  const pages = [{ words: [{ text: "Héllo" }, { text: "world!" }] }, { words: [{ text: "low" }] }];

  it("lists each character the captions draw once", () => {
    expect(captionCharacters(pages, false)).toBe("Hélowrd!");
  });

  it("upper-cases for styles that do", () => {
    expect(captionCharacters(pages, true)).toBe("HÉLOWRD!");
  });

  it("is never empty, so a font load always has something to load", () => {
    expect(captionCharacters([], false)).toBe("A");
  });
});

describe("captionFont", () => {
  it("is the font drawCaptions uses for the style", () => {
    expect(captionFont({ style: "bold", size: 1 }, "Inter")).toEqual({ font: "900 92px Inter", uppercase: true });
    expect(captionFont({ style: "minimal", size: 1.5 }, "Inter")).toEqual({ font: "600 87px Inter", uppercase: false });
    expect(captionFont({ style: "boxed", size: 1 }).font).toBe(`700 58px ${DEFAULT_FONT_FAMILY}`);
  });
});
