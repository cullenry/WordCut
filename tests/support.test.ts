import { describe, expect, it } from "vitest";
import { browserSupport, missingWebCodecsApis, WEBCODECS_APIS } from "@/lib/media/support";

const withApis = (names: readonly string[], navigator: object = {}) => ({
  ...Object.fromEntries(names.map((n) => [n, class {}])),
  navigator,
});

describe("missingWebCodecsApis", () => {
  it("lists every API a bare scope lacks, in a stable order", () => {
    expect(missingWebCodecsApis({})).toEqual([...WEBCODECS_APIS]);
  });

  it("reports only what is missing", () => {
    // Older Safari: video codecs but no audio ones.
    expect(missingWebCodecsApis(withApis(["VideoDecoder", "VideoEncoder", "OffscreenCanvas"]))).toEqual([
      "AudioDecoder",
      "AudioEncoder",
    ]);
  });
});

describe("browserSupport", () => {
  it("is unsupported when any WebCodecs API is missing, whatever the browser", () => {
    expect(browserSupport(withApis(["VideoDecoder"], { userAgentData: {} }))).toBe("unsupported");
    expect(browserSupport({})).toBe("unsupported");
  });

  it("blames plain HTTP, not the browser, when the page isn't a secure context", () => {
    // Chrome on http://192.168.x.x hides WebCodecs entirely.
    expect(browserSupport({ isSecureContext: false, navigator: { userAgentData: {} } })).toBe("insecure");
    expect(browserSupport({ ...withApis(WEBCODECS_APIS, { userAgentData: {} }), isSecureContext: false })).toBe(
      "supported",
    );
  });

  it("is supported on Chromium, which exposes userAgentData", () => {
    expect(browserSupport(withApis(WEBCODECS_APIS, { userAgentData: { brands: [] } }))).toBe("supported");
  });

  it("is untested on other engines that have the APIs", () => {
    expect(browserSupport(withApis(WEBCODECS_APIS, { userAgent: "Firefox/140.0" }))).toBe("untested");
    expect(browserSupport({ ...withApis(WEBCODECS_APIS), navigator: undefined })).toBe("untested");
  });
});
