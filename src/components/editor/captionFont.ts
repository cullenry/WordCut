import { DEFAULT_FONT_FAMILY } from "@/lib/captions/render";

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
