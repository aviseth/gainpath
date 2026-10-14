import { describe, expect, it } from "vitest";
import { cfg, eq, ex } from "@/test/engine-fixtures";
import { warmupSets } from "./warmup";

const rack = eq("free_weights", { min_kg: 20, max_kg: 200, increment_kg: 2.5 });
const squat = ex("squat", { quads: 1, glutes: 1 }, { kind: "compound", implement: "barbell" });
const curl = ex("curl", { biceps: 1 }, { kind: "isolation" });

describe("warm-ups (ALGORITHMS §14) — HEURISTIC", () => {
  it("ramps 40%×8, 60%×5, 80%×2 for heavy compounds", () => {
    expect(
      warmupSets({
        exercise: squat,
        equipment: rack,
        workingKg: 100,
        e1rm: null,
        muscleAlreadyWarm: false,
        cfg,
      }),
    ).toEqual([
      { weightKg: 40, reps: 8 },
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 2 },
    ]);
  });

  it("skips steps below the equipment minimum", () => {
    const sets = warmupSets({
      exercise: squat,
      equipment: rack,
      workingKg: 45,
      e1rm: null,
      muscleAlreadyWarm: false,
      cfg,
    });
    expect(sets).toEqual([
      { weightKg: 25, reps: 5 }, // 60% = 27 → rounds down
      { weightKg: 35, reps: 2 },
    ]);
  });

  it("only does the 80% step when the muscles are already warm", () => {
    expect(
      warmupSets({
        exercise: squat,
        equipment: rack,
        workingKg: 100,
        e1rm: null,
        muscleAlreadyWarm: true,
        cfg,
      }),
    ).toEqual([{ weightKg: 80, reps: 2 }]);
  });

  it("skips isolations and light loads", () => {
    expect(
      warmupSets({
        exercise: curl,
        equipment: rack,
        workingKg: 100,
        e1rm: null,
        muscleAlreadyWarm: false,
        cfg,
      }),
    ).toEqual([]);
    expect(
      warmupSets({
        exercise: squat,
        equipment: rack,
        workingKg: 30,
        e1rm: 100,
        muscleAlreadyWarm: false,
        cfg,
      }),
    ).toEqual([]);
    expect(
      warmupSets({
        exercise: squat,
        equipment: rack,
        workingKg: 30,
        e1rm: 50,
        muscleAlreadyWarm: false,
        cfg,
      }),
    ).not.toEqual([]);
  });
});
