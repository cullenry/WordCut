export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

export class ProbeError extends Error {}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;

export function looksLikeVideo(name: string, mimeType: string): boolean {
  return mimeType.startsWith("video/") || VIDEO_EXT.test(name);
}

/**
 * Loads only the metadata of a local file via an object URL. The file is
 * never read into memory. Rejects with a friendly message when the browser
 * cannot decode the container or codec.
 */
export function probeVideo(file: File): Promise<{ url: string; meta: VideoMeta }> {
  return new Promise((resolve, reject) => {
    if (!looksLikeVideo(file.name, file.type)) {
      reject(new ProbeError("That does not look like a video file."));
      return;
    }
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    const fail = (msg: string) => {
      URL.revokeObjectURL(url);
      reject(new ProbeError(msg));
    };
    el.onloadedmetadata = () => {
      if (!Number.isFinite(el.duration) || el.videoWidth === 0) {
        fail("This file has no playable video track. Its codec may not be supported by your browser.");
        return;
      }
      resolve({
        url,
        meta: { duration: el.duration, width: el.videoWidth, height: el.videoHeight },
      });
    };
    el.onerror = () =>
      fail("Your browser cannot play this file. Try an H.264 MP4 or WebM, or use Chrome or Edge.");
    el.src = url;
  });
}
