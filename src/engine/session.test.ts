import { describe, expect, it } from "vitest";
import { MUSCLES } from "@/data/schema";
import { catalogOf, cfg, DAY, eq, ex, NOW, set } from "@/test/engine-fixtures";
import type { MuscleMap } from "./fatigue";
import type { PlannedExercise, SessionPlan } from "./plan";
import {
  applySwap,
  busyPattern,
  liveFromPlanned,
  rebalance,
  sessionVolume,
  setsRemaining,
  skipExercise,
  timeBucket,
  toLive,
} from "./session";

const full = (v: number) => Object.fromEntries(MUSCLES.map((m) => [m, v])) as MuscleMap;
const legPress = ex("leg_press", { quads: 1, glutes: 0.5 }, { pattern: "squat" });
const legExt = ex("leg_extension", { quads: 1 }, { pattern: "knee_extension" });
const bench = ex("bench", { chest: 1, triceps: 0.5 });
const fly = ex("fly", { chest: 1 }, { pattern: "chest_fly" });
const catalog = catalogOf(legPress, legExt, bench, fly);

const planned = (id: string, sets: number): PlannedExercise => ({
  exerciseId: id,
  equipmentId: "eq",
  sets,
  repRange: [8, 12],
  targetReps: 8,
  targetRir: 2,
  rirRange: [1, 3],
  restSeconds: 120,
  weightKg: 50,
  timed: false,
  warmups: [],
  role: "hypertrophy_compound",
  isAnchor: false,
  calibration: false,
  estimate: null,
  rationale: [],
});

const plan: SessionPlan = {
  createdAt: NOW,
  focus: "full",
  readiness: null,
  isDeload: false,
  exercises: [planned("leg_press", 3), planned("bench", 3)],
  plannedVolume: {},
  needs: { ...full(0), quads: 3, chest: 3 },
  caps: full(10),
  anchors: [],
  rationale: [],
};

describe("live session (§9, §12)", () => {
  it("tracks done and remaining sets", () => {
    const live = toLive(plan);
    const logs = [
      set("leg_press", 50, 10, 8, NOW),
      set("leg_press", 40, 10, 6, NOW, { is_warmup: true }),
    ];
    expect(setsRemaining(live.exercises[0], logs)).toBe(2);
    const v = sessionVolume(live, catalog, logs);
    expect(v.done.quads).toBe(1);
    expect(v.planned.quads).toBe(2);
    expect(v.planned.chest).toBe(3);
  });

  it("skip without replacing carries the missing volume to later sessions", () => {
    const live = skipExercise(toLive(plan), "leg_press", catalog, [
      set("leg_press", 50, 10, 8, NOW),
    ]);
    expect(live.exercises[0].status).toBe("skipped");
    expect(live.carry).toEqual({ quads: 2, glutes: 1 });
  });

  it("applies a swap in place of the removed exercise", () => {
    const live = applySwap(toLive(plan), "leg_press", [
      liveFromPlanned(planned("leg_extension", 3)),
    ]);
    expect(live.exercises.map((e) => [e.exerciseId, e.status])).toEqual([
      ["leg_press", "swapped_out"],
      ["leg_extension", "pending"],
      ["bench", "pending"],
    ]);
    expect(live.exercises[1].replaces).toBe("leg_press");
  });

  it("rebalances when a skip leaves a muscle under-dosed by more than one set", () => {
    const skipped = skipExercise(toLive(plan), "leg_press", catalog, []);
    const candidates = [legExt, fly].map((e) => ({ exercise: e, equipment: eq(), options: [] }));
    const picks = rebalance({
      live: skipped,
      catalog,
      logs: [],
      candidates,
      recovery: full(100),
      favourites: new Set(),
      freedSets: 3,
      cfg,
    });
    expect(picks.map((p) => p.candidate.exercise.id)).toEqual(["leg_extension"]);
    expect(picks[0].sets).toBe(3);
  });

  it("does nothing when nothing is under-dosed", () => {
    const candidates = [legExt].map((e) => ({ exercise: e, equipment: eq(), options: [] }));
    expect(
      rebalance({
        live: toLive(plan),
        catalog,
        logs: [],
        candidates,
        recovery: full(100),
        favourites: new Set(),
        freedSets: 3,
        cfg,
      }),
    ).toEqual([]);
  });

  it("detects a machine that's repeatedly busy at the same time (≥3 in 4 weeks)", () => {
    const weekday = new Date(NOW).getDay();
    const bucket = timeBucket(NOW);
    const swap = (daysAgo: number) => ({
      removed_equipment_id: "eq-1",
      reason: "busy",
      weekday,
      time_bucket: bucket,
      created_at: NOW - daysAgo * DAY,
    });
    expect(busyPattern([swap(7), swap(14)], "eq-1", NOW, cfg)).toBeNull();
    expect(busyPattern([swap(7), swap(14), swap(21)], "eq-1", NOW, cfg)).toEqual({
      weekday,
      bucket,
    });
    expect(busyPattern([swap(7), swap(14), swap(40)], "eq-1", NOW, cfg)).toBeNull();
  });
});
