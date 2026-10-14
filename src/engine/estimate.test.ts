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
});
