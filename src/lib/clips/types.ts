import { DEFAULT_CAPTIONS, type CaptionSettings } from "@/lib/captions/types";

/**
 * A clip: a range of the source video with a name. It stores source seconds
 * only; the cuts and trimmed pauses inside it come from the EDL, so a clip
 * always follows the current edits and its length is the edited length.
 */
export interface Clip {
  id: string;
  name: string;
  /** Source seconds, [start, end). */
  start: number;
  end: number;
  /** Where the 9:16 crop sits on the slack axis: -1 = left/top edge, 0 = centre, 1 = right/bottom edge. */
  cropOffset: number;
  captions: CaptionSettings;
}

/** The parts of a clip an inspector edits. Only the keys present change. */
export interface ClipPatch {
  cropOffset?: number;
  captions?: Partial<CaptionSettings>;
}

export const MAX_CLIP_NAME = 80;
/** A clip with less edited time than this is not worth making. */
export const MIN_CLIP_DURATION = 0.05;

export const newClip = (fields: Pick<Clip, "id" | "name" | "start" | "end">): Clip => ({
  ...fields,
  cropOffset: 0,
  captions: { ...DEFAULT_CAPTIONS },
});
