/**
 * Helpers for handing the caption font to the export worker. A worker has its own
 * FontFaceSet and can't see the page's @font-face rules, so the page sends it the
 * rules (family, src, descriptors) and the worker loads the same files itself.
 */

/** A @font-face rule as plain data that can be posted to a worker. */
export interface FontFaceSource {
  family: string;
  /** CSS `src` value with absolute URLs, e.g. `url("https://…/inter.woff2") format("woff2")`. */
  src: string;
  descriptors: Record<string, string>;
}

/** The family names of a CSS font stack, unquoted: `'Inter', "Inter Fallback", sans-serif` → three names. */
export function familiesOf(stack: string): string[] {
  const out: string[] = [];
  for (const m of stack.matchAll(/\s*(?:"([^"]*)"|'([^']*)'|([^,]+))\s*(?:,|$)/g)) {
    const name = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (name) out.push(name);
  }
  return out;
}

/** Rewrites every url(...) in a CSS `src` value as an absolute URL, so it resolves the same inside a worker. */
export function absolutizeFontSrc(src: string, base: string): string {
  return src.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g, (whole, dq?: string, sq?: string, bare?: string) => {
    const url = dq ?? sq ?? bare ?? "";
    try {
      return `url("${new URL(url, base).href}")`;
    } catch {
      return whole;
    }
  });
}

/** CSS descriptor names on a @font-face rule and the FontFace constructor keys they map to. */
export const FONT_DESCRIPTORS: Record<string, string> = {
  "font-weight": "weight",
  "font-style": "style",
  "font-stretch": "stretch",
  "unicode-range": "unicodeRange",
  "font-display": "display",
  "font-feature-settings": "featureSettings",
  "ascent-override": "ascentOverride",
  "descent-override": "descentOverride",
  "line-gap-override": "lineGapOverride",
  "size-adjust": "sizeAdjust",
};

/**
 * Every distinct character the captions will draw, as the export would draw them.
 * FontFaceSet.load(font, text) uses this to fetch exactly the faces (unicode-range
 * subsets) the captions need before the first frame.
 */
export function captionCharacters(pages: readonly { words: readonly { text: string }[] }[], uppercase: boolean): string {
  const seen = new Set<string>();
  for (const page of pages) {
    for (const w of page.words) for (const ch of uppercase ? w.text.toUpperCase() : w.text) seen.add(ch);
  }
  seen.delete(" ");
  return [...seen].join("") || "A";
}
