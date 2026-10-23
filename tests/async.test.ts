import { describe, expect, it } from "vitest";
import { createLimiter, delay } from "@/lib/async";

describe("createLimiter", () => {
  it("never runs more than the limit at once and returns results", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((v) =>
        limit(async () => {
          active++;
          peak = Math.max(peak, active);
          await delay(5);
          active--;
          return v * 2;
        }),
      ),
    );
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });

  it("keeps going after a task fails", async () => {
    const limit = createLimiter(1);
    const failing = limit(async () => {
      throw new Error("boom");
    });
    const ok = limit(async () => "ok");
    await expect(failing).rejects.toThrow("boom");
    await expect(ok).resolves.toBe("ok");
  });

  it("rejects a zero limit", () => expect(() => createLimiter(0)).toThrow());
});

describe("delay", () => {
  it("rejects when aborted", async () => {
    const ctrl = new AbortController();
    const p = delay(1000, ctrl.signal);
    ctrl.abort(new Error("stop"));
    await expect(p).rejects.toThrow("stop");
  });
});
