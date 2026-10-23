import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatTime } from "@/lib/format";
import { looksLikeVideo } from "@/lib/probe";

describe("formatTime", () => {
  it("formats minutes and seconds", () => expect(formatTime(75)).toBe("1:15"));
  it("formats hours", () => expect(formatTime(3725)).toBe("1:02:05"));
  it("clamps bad input", () => expect(formatTime(NaN)).toBe("0:00"));
});

describe("formatDuration", () => {
  it("shows tenths under a minute", () => expect(formatDuration(4.24)).toBe("4.2s"));
  it("rounds up into minutes", () => expect(formatDuration(59.97)).toBe("1:00"));
  it("uses clock format from a minute", () => expect(formatDuration(75.4)).toBe("1:15"));
  it("clamps bad input", () => expect(formatDuration(-1)).toBe("0.0s"));
});

describe("formatBytes", () => {
  it("formats megabytes", () => expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB"));
  it("formats bytes", () => expect(formatBytes(10)).toBe("10 B"));
});

describe("looksLikeVideo", () => {
  it("accepts by mime type", () => expect(looksLikeVideo("x", "video/mp4")).toBe(true));
  it("accepts by extension when mime is empty", () => expect(looksLikeVideo("a.MKV", "")).toBe(true));
  it("rejects other files", () => expect(looksLikeVideo("a.txt", "text/plain")).toBe(false));
});
