import type { CaptionPage } from "@/lib/captions/group";
import type { FontFaceSource } from "@/lib/captions/fonts";
import type { CaptionSettings } from "@/lib/captions/types";
import type { Edl } from "@/lib/edl/edl";
import type { ResolutionId } from "./plan";

/** Messages between the editor and the export worker. Everything here is structured-cloneable. */

export type VideoCodecId = "avc" | "hevc" | "vp9" | "av1";
export type AudioCodecId = "aac" | "opus";

export interface VideoEncoderChoice {
  codec: VideoCodecId;
  bitrate: number;
  /** True when the browser reported a hardware encoder for this config. */
  hardware: boolean;
}

export interface AudioEncoderChoice {
  codec: AudioCodecId;
  sampleRate: number;
  channels: number;
  bitrate: number;
}

export type ProbeResult =
  | {
      ok: true;
      frameRate: number;
      /** Measured average, before capping. Null if it couldn't be measured. */
      sourceFrameRate: number | null;
      videoCodec: string;
      /** Null when the source has no audio track. */
      audio: { codec: string; encoder: AudioEncoderChoice } | null;
      /** The encoder each resolution would use, or null if none works at that size. */
      encoders: Record<ResolutionId, VideoEncoderChoice | null>;
    }
  | { ok: false; reason: string };

export interface FontCheck {
  font: string;
  text: string;
  /** Width the page measured, after loading the font. */
  width: number;
}

export interface ExportJob {
  file: File;
  /** The clip's EDL (see clipEdl): ranges in source time, offsets in clip time. */
  clipEdl: Edl;
  pages: CaptionPage[];
  captions: CaptionSettings;
  cropOffset: number;
  width: number;
  height: number;
  frameRate: number;
  video: VideoEncoderChoice;
  audio: AudioEncoderChoice | null;
  fontFamily: string;
  fontFaces: FontFaceSource[];
  fontCheck: FontCheck | null;
}

export interface ExportResult {
  buffer: ArrayBuffer;
  duration: number;
  frames: number;
  audioSamples: number;
  /** Null when there was nothing to check (captions off) or the check passed. */
  fontWarning: string | null;
}

export type WorkerRequest = { type: "probe"; file: File } | { type: "export"; job: ExportJob };

export type WorkerResponse =
  | { type: "probe"; result: ProbeResult }
  | { type: "progress"; framesDone: number; totalFrames: number; samplesDone: number; totalSamples: number }
  | { type: "done"; result: ExportResult }
  | { type: "error"; message: string };
