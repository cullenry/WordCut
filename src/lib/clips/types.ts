import { DEFAULT_CAPTIONS, type CaptionSettings } from "@/lib/captions/types";
import { DEFAULT_CROP, type Crop } from "./crop";

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
  /** The part of the source frame the clip shows, and so the clip's shape (see crop.ts). */
  crop: Crop;
  captions: CaptionSettings;
}

/** The parts of a clip an inspector edits. Only the keys present change. */
export interface ClipPatch {
  crop?: Crop;
  captions?: Partial<CaptionSettings>;
}

export const MAX_CLIP_NAME = 80;
/** A clip with less edited time than this is not worth making. */
export const MIN_CLIP_DURATION = 0.05;

export const newClip = (fields: Pick<Clip, "id" | "name" | "start" | "end">): Clip => ({
  ...fields,
  crop: { ...DEFAULT_CROP },
  captions: { ...DEFAULT_CAPTIONS },
});
