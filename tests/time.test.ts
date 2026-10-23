import { describe, expect, it } from "vitest";
import { buildEdl, fromSpans, roundTime } from "@/lib/edl/edl";
import {
  editedToSource,
  isKept,
  playbackJump,
  rangeIndexAt,
  secondsUntilJump,
  snapToKept,
  sourceToEdited,
} from "@/lib/edl/time";
import type { Word } from "@/lib/transcript/types";

// Keeps 1-2, 3-5 and 7-8 of a 10s source: edited offsets 0, 1, 3; edited duration 4.
const edl = fromSpans(
  [
    { start: 1, end: 2 },
    { start: 3, end: 5 },
    { start: 7, end: 8 },
  ],
  10,
);
const empty = fromSpans([], 10);
const identity = fromSpans([{ start: 0, end: 10 }], 10);

describe("rangeIndexAt / isKept", () => {
  it("finds the containing range, treating ranges as half-open", () => {
    expect([0.5, 1, 1.99, 2, 3, 4.5, 6, 7.5, 8, 10].map((t) => rangeIndexAt(edl, t))).toEqual([
      -1, 0, 0, -1, 1, 1, -1, 2, -1, -1,
    ]);
    expect(isKept(edl, 1.5)).toBe(true);
    expect(isKept(edl, 2.5)).toBe(false);
    expect(isKept(empty, 1)).toBe(false);
  });
});

describe("sourceToEdited", () => {
  it("maps kept times by their range offset", () => {
    expect([1, 1.5, 3, 4, 7, 7.5].map((t) => sourceToEdited(edl, t))).toEqual([0, 0.5, 1, 2, 3, 3.5]);
  });

  it("maps a time in a cut to where playback resumes", () => {
    expect(sourceToEdited(edl, 0)).toBe(0);
    expect(sourceToEdited(edl, 2)).toBe(1);
    expect(sourceToEdited(edl, 2.5)).toBe(1);
    expect(sourceToEdited(edl, 6)).toBe(3);
  });

  it("maps anything after the last kept range to the edited duration", () => {
    expect(sourceToEdited(edl, 8)).toBe(4);
    expect(sourceToEdited(edl, 9.5)).toBe(4);
    expect(sourceToEdited(edl, 100)).toBe(4);
  });

  it("is the identity with no cuts and 0 when everything is cut", () => {
    expect(sourceToEdited(identity, 3.25)).toBe(3.25);
    expect(sourceToEdited(empty, 5)).toBe(0);
  });
});

describe("editedToSource", () => {
  it("maps edited times into the kept ranges", () => {
    expect([0, 0.5, 1.5, 2, 3.5].map((e) => editedToSource(edl, e))).toEqual([1, 1.5, 3.5, 4, 7.5]);
  });

  it("puts a join at the start of the following range", () => {
    expect(editedToSource(edl, 1)).toBe(3);
    expect(editedToSource(edl, 3)).toBe(7);
  });

  it("maps the edited end to the end of the last range and clamps outside values", () => {
    expect(editedToSource(edl, 4)).toBe(8);
    expect(editedToSource(edl, 99)).toBe(8);
    expect(editedToSource(edl, -1)).toBe(1);
  });

  it("is the identity with no cuts and 0 when everything is cut", () => {
    expect(editedToSource(identity, 6.5)).toBe(6.5);
    expect(editedToSource(empty, 2)).toBe(0);
  });
});

describe("round trips", () => {
  it("source -> edited -> source returns every kept time", () => {
    for (let ms = 0; ms <= 10000; ms++) {
      const t = ms / 1000;
      if (!isKept(edl, t)) continue;
      expect(editedToSource(edl, sourceToEdited(edl, t))).toBe(t);
    }
  });

  it("edited -> source -> edited returns every edited time", () => {
    for (let ms = 0; ms <= 4000; ms++) {
      const e = ms / 1000;
      expect(sourceToEdited(edl, editedToSource(edl, e))).toBe(e);
    }
  });

  it("source -> edited -> source lands on the resume point for cut times", () => {
    expect(editedToSource(edl, sourceToEdited(edl, 2.5))).toBe(3);
    expect(editedToSource(edl, sourceToEdited(edl, 0.2))).toBe(1);
  });

  it("round-trips an EDL built from awkwardly timed words without drift", () => {
    const words: Word[] = Array.from({ length: 400 }, (_, i) => ({
      id: `w${i}`,
      text: "x",
      start: roundTime(i * 0.317 + 0.013),
      end: roundTime(i * 0.317 + 0.251),
      confidence: 1,
    }));
    const deleted = new Set(words.filter((_, i) => i % 3 === 0 || i % 7 === 0).map((w) => w.id));
    const big = buildEdl(words, deleted, 130);
    for (const r of big.ranges) {
      for (const t of [r.start, (r.start + r.end) / 2, r.end - 0.001]) {
        const back = editedToSource(big, sourceToEdited(big, t));
        expect(Math.abs(back - t)).toBeLessThan(1e-6);
      }
    }
    // Offsets are exactly the running sum of lengths, so the last one adds up to the duration.
    const last = big.ranges[big.ranges.length - 1];
    expect(roundTime(last.offset + last.end - last.start)).toBe(big.duration);
  });
});

describe("snapToKept", () => {
  it("keeps kept times and moves cut times to the next kept range", () => {
    expect(snapToKept(edl, 1.5)).toBe(1.5);
    expect(snapToKept(edl, 0)).toBe(1);
    expect(snapToKept(edl, 2)).toBe(3);
    expect(snapToKept(edl, 9)).toBeNull();
    expect(snapToKept(empty, 0)).toBeNull();
  });
});

describe("secondsUntilJump", () => {
  it("counts down to the lookahead point before the next cut", () => {
    expect(secondsUntilJump(edl, 1.5, 0.03)).toBeCloseTo(0.47, 9);
    expect(secondsUntilJump(edl, 3, 0)).toBe(2);
  });

  it("is 0 when the jump is due now, including inside a cut", () => {
    expect(secondsUntilJump(edl, 1.98, 0.03)).toBe(0);
    expect(secondsUntilJump(edl, 2.5, 0.03)).toBe(0);
    expect(secondsUntilJump(edl, 9, 0.03)).toBe(0);
  });

  it("is null when the rest plays to the natural end", () => {
    expect(secondsUntilJump(identity, 4, 0.03)).toBeNull();
  });

  it("agrees with playbackJump just before and at the jump point", () => {
    const wait = secondsUntilJump(edl, 3.2, 0.03)!;
    expect(playbackJump(edl, 3.2 + wait - 0.001, 0.03)).toBeNull();
    expect(playbackJump(edl, 3.2 + wait + 1e-9, 0.03)).toBe(7);
  });
});

describe("playbackJump", () => {
  const LOOK = 0.03;

  it("lets playback continue inside a range", () => {
    expect(playbackJump(edl, 1.5, LOOK)).toBeNull();
    expect(playbackJump(edl, 1.96, LOOK)).toBeNull();
  });

  it("jumps to the next range just before a cut", () => {
    expect(playbackJump(edl, 1.975, LOOK)).toBe(3);
    expect(playbackJump(edl, 4.99, LOOK)).toBe(7);
  });

  it("jumps out of a cut, including the lead-in", () => {
    expect(playbackJump(edl, 0, LOOK)).toBe(1);
    expect(playbackJump(edl, 2.5, LOOK)).toBe(3);
  });

  it("ends at the last range when the tail is cut", () => {
    expect(playbackJump(edl, 7.98, LOOK)).toBe("end");
    expect(playbackJump(edl, 9, LOOK)).toBe("end");
    expect(playbackJump(empty, 0, LOOK)).toBe("end");
  });

  it("lets the video end naturally when the tail is kept", () => {
    expect(playbackJump(identity, 9.99, LOOK)).toBeNull();
  });

  it("caps the lookahead at half a short range so it still plays", () => {
    const short = fromSpans([{ start: 1, end: 1.04 }, { start: 2, end: 3 }], 5);
    expect(playbackJump(short, 1, LOOK)).toBeNull();
    expect(playbackJump(short, 1.01, LOOK)).toBeNull();
    expect(playbackJump(short, 1.02, LOOK)).toBe(2);
  });
});
