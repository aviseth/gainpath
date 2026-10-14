import { describe, expect, it } from "vitest";
import { cfg, DAY, NOW, set } from "@/test/engine-fixtures";
import { adjustedRir, currentE1rm, e1rmHistory, epley, setE1rm, smoothE1rm } from "./e1rm";

describe("e1RM (ALGORITHMS §1, PROG-3)", () => {
  it("uses Epley on reps-to-failure = reps + RIR (EFF-3: RIR = 10 − RPE)", () => {
    expect(setE1rm(set("x", 100, 5, 8, NOW), 0, cfg)).toBeCloseTo(100 * (1 + 7 / 30));
    expect(epley(100, 0)).toBe(100);
  });

  it("only updates from sets ≤ 10 reps with an RPE of at least 6 (PROG-3)", () => {
    expect(setE1rm(set("x", 60, 11, 9, NOW), 0, cfg)).toBeNull();
    expect(setE1rm(set("x", 60, 8, null, NOW), 0, cfg)).toBeNull();
    expect(setE1rm(set("x", 60, 8, 5, NOW), 0, cfg)).toBeNull();
    expect(setE1rm(set("x", 60, 8, 9, NOW, { is_warmup: true }), 0, cfg)).toBeNull();
    expect(setE1rm(set("x", 60, 10, 9, NOW), 0, cfg)).not.toBeNull();
  });

  it("applies the RIR calibration offset only to sets of ≤ 12 reps (EFF-3)", () => {
    expect(adjustedRir(8, 10, 1, cfg)).toBe(3);
    expect(adjustedRir(8, 15, 1, cfg)).toBe(2);
    expect(adjustedRir(10, 5, -1, cfg)).toBe(0); // never negative
  });

  it("smooths with EWMA α = 0.3 and caps outlier jumps at +5% (HEURISTIC)", () => {
    expect(smoothE1rm(null, 120, cfg)).toBe(120);
    expect(smoothE1rm(100, 105, cfg)).toBeCloseTo(0.7 * 100 + 0.3 * 105);
    expect(smoothE1rm(100, 130, cfg)).toBeCloseTo(105);
  });

  it("feeds each update the best of the last 3 session bests", () => {
    const sets = [
      set("x", 100, 5, 10, NOW - 20 * DAY), // e1RM 116.7
      set("x", 90, 5, 10, NOW - 13 * DAY), // worse day
      set("x", 90, 5, 10, NOW - 6 * DAY),
    ];
    const history = e1rmHistory(sets, 0, cfg);
    expect(history).toHaveLength(3);
    // The bad days don't drag the estimate down: the window still holds the 116.7 best.
    expect(history[1].e1rm).toBeCloseTo(history[0].e1rm);
    expect(currentE1rm(sets, 0, cfg)).toBeCloseTo(history[2].e1rm);
  });

  it("returns null with no usable sets", () => {
    expect(currentE1rm([set("x", 50, 15, 8, NOW)], 0, cfg)).toBeNull();
  });
});
