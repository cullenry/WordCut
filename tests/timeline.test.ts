import { describe, expect, it } from "vitest";
import { formatTime } from "@/lib/format";
import { tickStep, timelineTicks } from "@/lib/timeline";

const labels = (duration: number, max = 10) => timelineTicks(duration, max).map(formatTime);

describe("timelineTicks", () => {
  it("lands every tick on a whole second", () => {
    for (const d of [3.4, 4.85, 9.99, 37.2, 61.5, 600.7, 3725.3]) {
      for (const t of timelineTicks(d, 10)) expect(Number.isInteger(t)).toBe(true);
    }
  });

  it("never repeats a label (the old axis printed 0:00 twice on a short clip)", () => {
    for (const d of [0.4, 1.2, 2, 3.4, 4.85, 5, 7.3, 12, 59.9, 125, 3601]) {
      const l = labels(d);
      expect(new Set(l).size).toBe(l.length);
    }
  });

  it("always starts at 0 and stays inside the video", () => {
    for (const d of [0.5, 4.85, 75, 4000]) {
      const t = timelineTicks(d, 10);
      expect(t[0]).toBe(0);
      expect(t.at(-1)!).toBeLessThanOrEqual(d);
    }
  });

  it("uses one-second steps for a short video", () => {
    expect(timelineTicks(4.85, 10)).toEqual([0, 1, 2, 3, 4]);
    expect(labels(4.85)).toEqual(["0:00", "0:01", "0:02", "0:03", "0:04"]);
  });

  it("steps by tidy amounts as the video gets longer", () => {
    expect(tickStep(9, 10)).toBe(1);
    expect(tickStep(60, 10)).toBe(10);
    expect(tickStep(600, 10)).toBe(120);
    expect(tickStep(3600, 10)).toBe(600);
    expect(tickStep(40000, 10)).toBe(7200);
  });

  it("respects the room available", () => {
    expect(timelineTicks(60, 4).length).toBeLessThanOrEqual(4);
    expect(timelineTicks(60, 20).length).toBeGreaterThan(timelineTicks(60, 4).length);
    expect(timelineTicks(60, 1).length).toBeGreaterThanOrEqual(1);
  });

  it("is empty with nothing to show", () => {
    expect(timelineTicks(0, 10)).toEqual([]);
    expect(timelineTicks(NaN, 10)).toEqual([]);
    expect(timelineTicks(-3, 10)).toEqual([]);
  });

  it("shows only 0 for a video under a second", () => {
    expect(timelineTicks(0.4, 10)).toEqual([0]);
  });
});
