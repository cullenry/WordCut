export const CAPTION_STYLES = ["bold", "minimal", "boxed"] as const;
export type CaptionStyleId = (typeof CAPTION_STYLES)[number];

export const CAPTION_POSITIONS = ["top", "middle", "bottom"] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];

/** Caption settings of one clip. `color` is the highlight on the word being spoken. */
export interface CaptionSettings {
  enabled: boolean;
  style: CaptionStyleId;
  position: CaptionPosition;
  /** Multiplier on the style's base font size. */
  size: number;
  /** `#rrggbb`. */
  color: string;
}

export const SIZE_MIN = 0.6;
export const SIZE_MAX = 1.6;

export const DEFAULT_CAPTIONS: CaptionSettings = {
  enabled: true,
  style: "bold",
  position: "bottom",
  size: 1,
  color: "#FFD60A",
};

export const CAPTION_COLORS: readonly { name: string; value: string }[] = [
  { name: "Yellow", value: "#FFD60A" },
  { name: "Lime", value: "#A3E635" },
  { name: "Cyan", value: "#22D3EE" },
  { name: "Pink", value: "#FF5C93" },
  { name: "Orange", value: "#FF8A3D" },
  { name: "Violet", value: "#A78BFA" },
];

export const clampSize = (size: number): number =>
  Number.isFinite(size) ? Math.min(Math.max(size, SIZE_MIN), SIZE_MAX) : DEFAULT_CAPTIONS.size;

/** Fills gaps and drops bad values, so saved or hand-edited settings can never break the renderer. */
export function normalizeCaptions(input: unknown): CaptionSettings {
  const d = DEFAULT_CAPTIONS;
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : d.enabled,
    style: CAPTION_STYLES.includes(o.style as CaptionStyleId) ? (o.style as CaptionStyleId) : d.style,
    position: CAPTION_POSITIONS.includes(o.position as CaptionPosition) ? (o.position as CaptionPosition) : d.position,
    size: typeof o.size === "number" ? clampSize(o.size) : d.size,
    color: typeof o.color === "string" && parseHex(o.color) ? o.color.trim().toUpperCase() : d.color,
  };
}

/** `#rgb` or `#rrggbb` as [r, g, b], or null. */
export function parseHex(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Black or white, whichever reads better on top of `color` (WCAG relative luminance). */
export function readableOn(color: string): "#000000" | "#ffffff" {
  const rgb = parseHex(color);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#000000" : "#ffffff";
}
