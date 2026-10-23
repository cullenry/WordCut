import { absolutizeFontSrc, familiesOf, FONT_DESCRIPTORS, type FontFaceSource } from "@/lib/captions/fonts";
import type { CaptionPage } from "@/lib/captions/group";
import { captionFont, DEFAULT_FONT_FAMILY } from "@/lib/captions/render";
import type { CaptionSettings } from "@/lib/captions/types";
import type { FontCheck } from "@/lib/media/export/protocol";

/**
 * The font stack captions are drawn with. Canvas can't use a CSS variable, so read
 * what next/font put in --font-inter (its hashed family name) and add the fallbacks.
 */
export function captionFontFamily(): string {
  if (typeof document === "undefined") return DEFAULT_FONT_FAMILY;
  const inter = getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim();
  return inter ? `${inter}, system-ui, sans-serif` : DEFAULT_FONT_FAMILY;
}

let loading: Promise<unknown> | null = null;

/** Canvas never triggers a font download by itself; ask for the weights the caption styles use. */
export function ensureCaptionFonts(family: string): Promise<unknown> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  loading ??= Promise.all([600, 700, 900].map((w) => document.fonts.load(`${w} 48px ${family}`, "Aa"))).catch(
    () => undefined,
  );
  return loading;
}

/**
 * The page's @font-face rules for the families in `stack`, with absolute URLs, so the
 * export worker can load the very same font files into its own FontFaceSet.
 */
export function captionFontFaces(stack: string): FontFaceSource[] {
  if (typeof document === "undefined") return [];
  const families = new Set(familiesOf(stack));
  const out: FontFaceSource[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // a cross-origin sheet
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = familiesOf(rule.style.getPropertyValue("font-family"))[0];
      if (!family || !families.has(family)) continue;
      const src = rule.style.getPropertyValue("src");
      if (!src) continue;
      const descriptors: Record<string, string> = {};
      for (const [css, key] of Object.entries(FONT_DESCRIPTORS)) {
        const v = rule.style.getPropertyValue(css).trim();
        if (v) descriptors[key] = v;
      }
      out.push({ family, src: absolutizeFontSrc(src, sheet.href ?? document.baseURI), descriptors });
    }
  }
  return out;
}

/**
 * Measures some of the clip's own caption text with the font the preview draws it in.
 * The worker measures the same string after loading the font itself; a different
 * width means the export would not look like the preview.
 */
export async function captionFontCheck(
  settings: Pick<CaptionSettings, "style" | "size">,
  pages: readonly CaptionPage[],
  family: string,
): Promise<FontCheck | null> {
  if (typeof document === "undefined") return null;
  const { font, uppercase } = captionFont(settings, family);
  const words = pages.flatMap((p) => p.words.map((w) => w.text)).slice(0, 12);
  if (words.length === 0) return null;
  const text = uppercase ? words.join(" ").toUpperCase() : words.join(" ");
  await document.fonts?.load(font, text).catch(() => undefined);
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  return { font, text, width: ctx.measureText(text).width };
}
