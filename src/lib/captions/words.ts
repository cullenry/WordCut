import type { Edl } from "@/lib/edl/edl";
import { sourceToEdited } from "@/lib/edl/time";
import type { Word } from "@/lib/transcript/types";
import { groupCaptionPages, type CaptionPage, type CaptionWord, type GroupOptions } from "./group";

/**
 * The words a clip shows, on the clip's own timeline. `clipEdl` is the clip's
 * EDL (see clipEdl in clips/range), so cut words are gone and everything after a
 * cut or trimmed pause has moved up: a caption never has a gap where video was cut.
 * A word belongs to the clip if its midpoint is inside [start, end).
 */
export function captionWordsFor(
  words: readonly Word[],
  deleted: ReadonlySet<string>,
  clipEdl: Edl,
  start: number,
  end: number,
): CaptionWord[] {
  const out: CaptionWord[] = [];
  for (const w of words) {
    const mid = (w.start + w.end) / 2;
    if (mid < start || mid >= end || deleted.has(w.id)) continue;
    const text = w.text.trim();
    if (!text) continue;
    const s = sourceToEdited(clipEdl, w.start);
    out.push({ id: w.id, text, start: s, end: Math.max(s, sourceToEdited(clipEdl, w.end)) });
  }
  return out;
}

/** Caption pages for a clip: the words above, grouped into short lines. */
export function captionPagesFor(
  words: readonly Word[],
  deleted: ReadonlySet<string>,
  clipEdl: Edl,
  start: number,
  end: number,
  grouping?: Partial<GroupOptions>,
): CaptionPage[] {
  return groupCaptionPages(captionWordsFor(words, deleted, clipEdl, start, end), grouping);
}
