import { describe, expect, it } from "vitest";
import { cfg, DAY, NOW } from "@/test/engine-fixtures";
import { checkDeload, isPlateau, slope, tuneVolume } from "./deload";

const points = (values: number[], gapDays = 7) =>
  values.map((e1rm, i) => ({
    ts: NOW - (values.length - 1 - i) * gapDays * DAY,
    e1rm,
    sessionBest: e1rm,
  }));

describe("plateau, deload and auto-tuning (ALGORITHMS §11; DELOAD-1, DELOAD-2)", () => {
  it("computes a least-squares slope", () => {
    expect(slope(points([100, 101, 102, 103]))).toBeGreaterThan(0);
    expect(slope(points([100, 100, 100, 100]))).toBe(0);
  });

  it("flags a plateau: flat/declining over 4 exposures spanning ≥3 weeks", () => {
    expect(isPlateau(points([100, 101, 100, 99]), cfg)).toBe(true);
    expect(isPlateau(points([100, 101, 102, 104]), cfg)).toBe(false);
    expect(isPlateau(points([100, 100, 100, 100], 2), cfg)).toBe(false); // only 6 days
    expect(isPlateau(points([100, 100, 100]), cfg)).toBe(false);
  });

  it("triggers reactively, never on the calendar alone (DELOAD-1/2)", () => {
    const base = { recentReadiness: [70, 72, 68], weeksSinceDeload: 3, cfg };
    expect(checkDeload({ ...base, plateauedAnchors: 2 }).trigger).toBe(true);
    expect(
      checkDeload({ ...base, plateauedAnchors: 0, recentReadiness: [45, 40, 48, 49, 70] }).trigger,
    ).toBe(true);
    expect(checkDeload({ ...base, plateauedAnchors: 0, userRequested: true }).trigger).toBe(true);
    const calendar = checkDeload({ ...base, plateauedAnchors: 0, weeksSinceDeload: 9 });
    expect(calendar).toMatchObject({ trigger: false, reminder: true });
  });

  it("tunes per-muscle volume ±10% within [0.7, 1.5] (HEURISTIC)", () => {
    const up = tuneVolume({
      current: { chest: 1.45 },
      improved: { chest: true },
      avgReadiness: 65,
      cfg,
    });
    expect(up.chest).toBe(1.5);
    const down = tuneVolume({
      current: { quads: 1 },
      improved: { quads: false },
      avgReadiness: 50,
      cfg,
    });
    expect(down.quads).toBe(0.9);
    const hold = tuneVolume({
      current: { quads: 1 },
      improved: { quads: false },
      avgReadiness: 58,
      cfg,
    });
    expect(hold.quads).toBe(1);
  });
});
