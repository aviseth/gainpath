import { describe, expect, it } from "vitest";
import { catalogOf, cfg, ex, HOUR, NOW, set } from "@/test/engine-fixtures";
import { effortFactor, muscleFatigue, recovery, recoveryState } from "./fatigue";

const squat = ex("squat", { quads: 1, glutes: 1, adductors: 0.5 });
const curl = ex("curl", { biceps: 1 });
const catalog = catalogOf(squat, curl);

describe("fatigue / recovery (ALGORITHMS §5; REC-1, EFF-2) — HEURISTIC", () => {
  it("weights effort, with failure costing most (EFF-2) and missing RPE as RPE 8", () => {
    expect(effortFactor(10, cfg)).toBe(1.5);
    expect(effortFactor(9, cfg)).toBe(1.2);
    expect(effortFactor(8, cfg)).toBe(1);
    expect(effortFactor(7, cfg)).toBe(0.7);
    expect(effortFactor(null, cfg)).toBe(1);
  });

  it("decays with a 36 h half-life for large muscles and 24 h for small ones", () => {
    const f = muscleFatigue(
      [set("squat", 100, 5, 8, NOW - 36 * HOUR), set("curl", 20, 10, 8, NOW - 24 * HOUR)],
      catalog,
      NOW,
      {},
      cfg,
    );
    expect(f.quads).toBeCloseTo(0.5);
    expect(f.adductors).toBeCloseTo(0.5 * 2 ** (-36 / 24));
    expect(f.biceps).toBeCloseTo(0.5);
  });

  it("ignores warm-ups and adds today's soreness", () => {
    const f = muscleFatigue(
      [set("curl", 10, 10, 8, NOW, { is_warmup: true })],
      catalog,
      NOW,
      { biceps: 2 },
      cfg,
    );
    expect(f.biceps).toBe(3);
  });

  it("maps fatigue to 0–100% recovery against the cap", () => {
    const sets = Array.from({ length: 4 }, () => set("curl", 20, 10, 10, NOW));
    const r = recoveryState(sets, catalog, NOW, {}, cfg);
    expect(r.biceps).toBe(25); // 4 × 1.5 = 6 of 8
    expect(r.quads).toBe(100);
    expect(recovery({ ...muscleFatigue([], catalog, NOW, {}, cfg), chest: 20 }, cfg).chest).toBe(0);
  });
});
