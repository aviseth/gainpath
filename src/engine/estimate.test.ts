import { describe, expect, it } from "vitest";
import { catalogOf, cfg, eq, ex } from "@/test/engine-fixtures";
import { estimateStart } from "./estimate";

const bench = ex(
  "barbell_bench_press",
  { chest: 1, triceps: 0.5, front_delt: 0.5 },
  { implement: "barbell" },
);
const machinePress = ex("machine_chest_press", { chest: 1, triceps: 0.5, front_delt: 0.5 });
const dbPress = ex(
  "dumbbell_bench_press",
  { chest: 1, triceps: 0.5, front_delt: 0.5 },
  { implement: "dumbbell", per_hand: true },
);
const curl = ex("curl", { biceps: 1 }, { pattern: "elbow_flexion" });
const catalog = catalogOf(bench, machinePress, dbPress, curl);
const ratios = [
  { from: "barbell_bench_press", to: "machine_chest_press", ratio: 1 },
  { from: "barbell_bench_press", to: "dumbbell_bench_press", ratio: 0.38 },
];
const newMachine = eq("selectorized", { min_kg: 5, max_kg: 100, increment_kg: 5 });

describe("new exercise / machine estimates (ALGORITHMS §15)", () => {
  it("same exercise on another machine: × 0.85", () => {
    const r = estimateStart({
      exercise: machinePress,
      equipment: newMachine,
      known: [{ exerciseId: "machine_chest_press", equipmentId: "old", e1rm: 100, updatedAt: 1 }],
      catalog,
      ratios,
      cfg,
    });
    expect(r).toMatchObject({
      kind: "e1rm",
      e1rm: 85,
      uncertaintyPct: 15,
      source: "other_equipment",
    });
  });

  it("similar exercise: × ratio × 0.8 (e.g. DB press per hand ≈ 0.38 × bench)", () => {
    const r = estimateStart({
      exercise: dbPress,
      equipment: eq("free_weights"),
      known: [{ exerciseId: "barbell_bench_press", equipmentId: "bar", e1rm: 100, updatedAt: 1 }],
      catalog,
      ratios,
      cfg,
    });
    expect(r.kind).toBe("e1rm");
    if (r.kind === "e1rm") expect(r.e1rm).toBeCloseTo(100 * 0.38 * 0.8);
  });

  it("uses the inverse ratio in the other direction", () => {
    const r = estimateStart({
      exercise: bench,
      equipment: eq("free_weights"),
      known: [{ exerciseId: "dumbbell_bench_press", equipmentId: "db", e1rm: 38, updatedAt: 1 }],
      catalog,
      ratios,
      cfg,
    });
    if (r.kind !== "e1rm") throw new Error("expected e1rm");
    expect(r.e1rm).toBeCloseTo((38 / 0.38) * 0.8);
  });

  it("no usable history: equipment minimum + 2 steps at RIR 4", () => {
    const r = estimateStart({
      exercise: curl,
      equipment: newMachine,
      known: [],
      catalog,
      ratios,
      cfg,
    });
    expect(r).toEqual({ kind: "fallback", weightKg: 15, targetRir: 4 });
  });

  describe("no e1RM to borrow, but loads lifted on this equipment (HEURISTIC)", () => {
    const rack = eq("free_weights", {
      min_kg: 0.5,
      max_kg: 22,
      increment_kg: 2,
      weights_kg: [0.5, 1, 1.5, 2, 3, 6, 7, 8, 10, 12, 14],
    });
    const compoundLoads = [
      { kind: "compound" as const, weightKg: 10 },
      { kind: "compound" as const, weightKg: 7 },
      { kind: "compound" as const, weightKg: 14 },
    ];

    it("an isolation with only compound history starts at half the lightest compound load", () => {
      const r = estimateStart({
        exercise: curl,
        equipment: rack,
        known: [],
        catalog,
        ratios,
        equipmentLoads: compoundLoads,
        cfg,
      });
      // 7 × 0.5 = 3.5 → rounds down to the 3 kg dumbbell, instead of 1.5 kg (min + 2 steps).
      expect(r).toEqual({ kind: "fallback", weightKg: 3, targetRir: 4 });
    });

    it("prefers the lightest load of the same kind of exercise, unscaled", () => {
      const r = estimateStart({
        exercise: curl,
        equipment: rack,
        known: [],
        catalog,
        ratios,
        equipmentLoads: [...compoundLoads, { kind: "isolation", weightKg: 6 }],
        cfg,
      });
      expect(r).toEqual({ kind: "fallback", weightKg: 6, targetRir: 4 });
    });

    it("a compound uses the lightest compound load", () => {
      const r = estimateStart({
        exercise: dbPress,
        equipment: rack,
        known: [],
        catalog: catalogOf(curl, dbPress),
        ratios: [],
        equipmentLoads: compoundLoads,
        cfg,
      });
      expect(r).toEqual({ kind: "fallback", weightKg: 7, targetRir: 4 });
    });
  });
});
