/** Browser APIs the editor needs: decoders to read audio for transcription, encoders and OffscreenCanvas to export. */
export const WEBCODECS_APIS = ["VideoDecoder", "VideoEncoder", "AudioDecoder", "AudioEncoder", "OffscreenCanvas"] as const;
export type WebCodecsApi = (typeof WEBCODECS_APIS)[number];

export function missingWebCodecsApis(scope: object = globalThis): WebCodecsApi[] {
  return WEBCODECS_APIS.filter((name) => !(name in scope));
}

/**
 * - "insecure": the page is on plain HTTP (not localhost), where every browser hides WebCodecs.
 * - "unsupported": WebCodecs is missing, so transcription and export can't work.
 * - "untested": the APIs exist but this isn't a Chromium browser, which is all WordCut is tested on.
 * - "supported": Chrome, Edge or another Chromium browser.
 */
export type BrowserSupport = "supported" | "untested" | "unsupported" | "insecure";

/** Chromium is the only engine that exposes navigator.userAgentData, so it needs no user-agent sniffing. */
export function browserSupport(
  scope: { navigator?: object; isSecureContext?: boolean } & object = globalThis,
): BrowserSupport {
  if (missingWebCodecsApis(scope).length > 0) return scope.isSecureContext === false ? "insecure" : "unsupported";
  return scope.navigator && "userAgentData" in scope.navigator ? "supported" : "untested";
}
