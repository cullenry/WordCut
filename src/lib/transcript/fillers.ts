import type { Word } from "./types";

/**
 * Hesitation sounds, matched as whole words after stripping punctuation, so
 * "umbrella", "herd" and "ahead" are safe. Elongations ("ummm", "ahhh") match too.
 * "uh-huh" and "mm-hmm" are answers, not hesitations, and are not matched.
 */
const HESITATION = /^(?:u+h*m+|u+h+|e+r+m*|a+h+|h+m+|mh?m+)$/;

/**
 * Filler phrases that are often real words ("I like it", "as you know"), so
 * they are only suggested on request. Longer phrases win over their prefixes.
 */
export const FILLER_PHRASES: readonly string[] = [
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "you see",
  "like",
  "basically",
  "actually",
  "literally",
];

export type FillerKind = "hesitation" | "phrase";

/** A run of consecutive words that looks like a filler. */
export interface FillerMatch {
  /** Stable across re-detection: the first word's id. */
  key: string;
  kind: FillerKind;
  /** Word indexes, inclusive. */
  startIndex: number;
  endIndex: number;
  ids: string[];
  text: string;
  /** Source seconds. */
  start: number;
  end: number;
}

export interface FillerOptions {
  /** Also match FILLER_PHRASES. Off by default. */
  phrases?: boolean;
}

/** Lower-case, curly apostrophes straightened, punctuation trimmed off both ends. */
export function normalizeWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
}

export const isHesitation = (text: string): boolean => HESITATION.test(normalizeWord(text));

const PHRASES_BY_FIRST = (() => {
  const map = new Map<string, string[][]>();
  for (const phrase of FILLER_PHRASES) {
    const tokens = phrase.split(" ");
    map.set(tokens[0], [...(map.get(tokens[0]) ?? []), tokens]);
  }
  for (const list of map.values()) list.sort((a, b) => b.length - a.length);
  return map;
})();

/**
 * Fillers in reading order, never overlapping. Words in `deleted` are skipped,
 * and a phrase is only matched if none of its words is deleted.
 */
export function findFillers(
  words: readonly Word[],
  deleted: ReadonlySet<string>,
  { phrases = false }: FillerOptions = {},
): FillerMatch[] {
  const out: FillerMatch[] = [];
  const norm = words.map((w) => normalizeWord(w.text));

  const match = (startIndex: number, length: number, kind: FillerKind) => {
    const run = words.slice(startIndex, startIndex + length);
    out.push({
      key: `f:${run[0].id}`,
      kind,
      startIndex,
      endIndex: startIndex + length - 1,
      ids: run.map((w) => w.id),
      text: run.map((w) => w.text).join(" "),
      start: run[0].start,
      end: run[length - 1].end,
    });
  };

  for (let i = 0; i < words.length; i++) {
    if (deleted.has(words[i].id)) continue;
    if (HESITATION.test(norm[i])) {
      match(i, 1, "hesitation");
      continue;
    }
    if (!phrases) continue;
    const hit = PHRASES_BY_FIRST.get(norm[i])?.find((tokens) =>
      tokens.every((t, k) => norm[i + k] === t && !deleted.has(words[i + k].id)),
    );
    if (hit) {
      match(i, hit.length, "phrase");
      i += hit.length - 1;
    }
  }
  return out;
}
