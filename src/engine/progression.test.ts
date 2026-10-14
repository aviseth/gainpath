import { describe, expect, it } from "vitest";
import { cfg, DAY, eq, NOW, set } from "@/test/engine-fixtures";
import { adjustAfterSet, nextExposure } from "./progression";

const stack = eq("selectorized", { min_kg: 5, max_kg: 150, increment_kg: 2.5 });
const sets = (weight: number, reps: number[], rpe: number | null, ts: number) =>
  reps.map((r, i) => set("press", weight, r, rpe, ts + i * 60_000));

const base = {
  repRange: [8, 12] as [number, number],
  targetRir: 2,
  equipment: stack,
  allowIncrease: true,
  calibrationOffset: 0,
  cfg,
};

describe("double progression (ALGORITHMS §9; PROG-1, PROG-2)", () => {
  it("adds one equipment step when every set hit the top of the range at target effort", () => {
    const r = nextExposure({ ...base, lastSets: sets(60, [12, 12, 12], 8, NOW) });
    expect(r).toMatchObject({ weightKg: 62.5, targetReps: 8 });
    expect(r.rationale[0].rule).toBe("PROG-1");
  });

  it("doesn't increase when the top reps came too close to failure", () => {
    const r = nextExposure({ ...base, lastSets: sets(60, [12, 12, 12], 10, NOW) });
    expect(r.weightKg).toBe(60);
  });

  it("caps increases at +5% (PROG-2 HEURISTIC): a big step waits for rep overflow", () => {
    const coarse = eq("selectorized", { min_kg: 10, max_kg: 100, increment_kg: 10 });
    const r = nextExposure({
      ...base,
      equipment: coarse,
      lastSets: sets(40, [12, 12, 12], 8, NOW),
    });
    expect(r.weightKg).toBe(40);
    expect(r.targetReps).toBe(13);
    expect(r.rationale[0].rule).toBe("PROG-2");
    const overflow = nextExposure({
      ...base,
      equipment: coarse,
      lastSets: sets(40, [14, 14, 14], 8, NOW),
    });
    expect(overflow.weightKg).toBe(50);
  });

  it("drops ~8% after reps fell below the range on two consecutive exposures", () => {
    const r = nextExposure({
      ...base,
      previousSets: sets(60, [7, 6, 6], 9, NOW - 3 * DAY),
      lastSets: sets(60, [7, 7, 6], 9, NOW),
    });
    expect(r.weightKg).toBe(55); // 60 × 0.92 = 55.2 → 55
    expect(r.rationale[0].rule).toBe("PROG-1-REDUCE");
  });

  it("otherwise keeps the load and aims for one more rep", () => {
    const r = nextExposure({ ...base, lastSets: sets(60, [10, 9, 9], 8, NOW) });
    expect(r).toMatchObject({ weightKg: 60, targetReps: 11 });
  });

  it("never increases load on a low-readiness day (§4)", () => {
    const r = nextExposure({
      ...base,
      allowIncrease: false,
      lastSets: sets(60, [12, 12, 12], 8, NOW),
    });
    expect(r.weightKg).toBe(60);
  });
});

describe("in-session adjustment (ALGORITHMS §9)", () => {
  const p = {
    targetReps: 10,
    repRange: [8, 12] as [number, number],
    targetRir: 2,
    e1rm: 80,
    equipment: stack,
    alreadyBumped: false,
    heavyCompound: false,
    setsRemaining: 2,
    calibrationOffset: 0,
    cfg,
  };

  it("lowers the load when a set was ≥1.5 RPE harder than planned", () => {
    const r = adjustAfterSet({ ...p, weightKg: 60, reps: 10, rpe: 10 });
    expect(r.nextWeightKg).toBeLessThan(60);
    expect(r.rationale[0].rule).toBe("PROG-1-INSESSION-DOWN");
  });

  it("bumps one step (once per exercise) when much easier and at the top of the range", () => {
    const r = adjustAfterSet({ ...p, weightKg: 50, reps: 12, rpe: 6 });
    expect(r).toMatchObject({ nextWeightKg: 52.5, bumped: true });
    expect(
      adjustAfterSet({ ...p, weightKg: 50, reps: 12, rpe: 6, alreadyBumped: true }).nextWeightKg,
    ).toBe(50);
  });

  it("keeps the load when the set matched the plan, or has no RPE", () => {
    expect(adjustAfterSet({ ...p, weightKg: 60, reps: 10, rpe: 8 }).nextWeightKg).toBe(60);
    expect(adjustAfterSet({ ...p, weightKg: 60, reps: 10, rpe: null }).nextWeightKg).toBe(60);
  });

  it("drops a set after failure on a heavy compound (EFF-2)", () => {
    const r = adjustAfterSet({ ...p, heavyCompound: true, weightKg: 60, reps: 10, rpe: 10 });
    expect(r.dropSet).toBe(true);
    expect(adjustAfterSet({ ...p, weightKg: 60, reps: 10, rpe: 10 }).dropSet).toBe(false);
  });
});
