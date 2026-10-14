import { describe, expect, it } from "vitest";
import { MUSCLES } from "@/data/schema";
import { cfg, eq, ex } from "@/test/engine-fixtures";
import { availableCandidates, type AvailabilityInput } from "./availability";
import type { MuscleMap } from "./fatigue";
import { findSubstitutes, type SwapInput } from "./swap";
import { add, scale } from "./vector";

const full = (v: number) => Object.fromEntries(MUSCLES.map((m) => [m, v])) as MuscleMap;

const squat = ex(
  "barbell_back_squat",
  { quads: 1, glutes: 1, adductors: 0.5 },
  { pattern: "squat", joints: ["knee", "hip", "lower_back"] },
);
const legPress = ex(
  "leg_press",
  { quads: 1, glutes: 0.5 },
  { pattern: "squat", joints: ["knee", "hip"] },
);
const hackSquat = ex(
  "hack_squat",
  { quads: 1, glutes: 0.5 },
  { pattern: "squat", joints: ["knee", "hip"] },
);
const legExt = ex("leg_extension", { quads: 1 }, { pattern: "knee_extension", joints: ["knee"] });
const hipThrust = ex(
  "machine_hip_thrust",
  { glutes: 1 },
  { pattern: "hip_extension", joints: ["hip"] },
);
const adductor = ex(
  "hip_adduction_machine",
  { adductors: 1 },
  { pattern: "hip_adduction", joints: ["hip"] },
);
const bench = ex("bench", { chest: 1, triceps: 0.5 }, { joints: ["shoulder", "elbow"] });

// One machine per exercise, all linked.
const machines = new Map(
  [legPress, hackSquat, legExt, hipThrust, adductor, bench].map((e) => [e.id, eq()]),
);
const links = [...machines].map(([exercise_id, m]) => ({ equipment_id: m.id, exercise_id }));
const gym = (overrides: Partial<AvailabilityInput> = {}) =>
  availableCandidates({
    catalog: [legPress, hackSquat, legExt, hipThrust, adductor, bench],
    equipment: [...machines.values()],
    links,
    ...overrides,
  });

const base = (overrides: Partial<SwapInput> = {}): SwapInput => ({
  removed: { exercise: legPress, plannedSets: 3, remainingSets: 3 },
  candidates: gym(),
  sessionOthers: [],
  caps: full(10),
  recovery: full(100),
  favourites: new Set(),
  cfg,
  ...overrides,
});

const optionIds = (r: ReturnType<typeof findSubstitutes>) =>
  r.options.map((o) => o.items.map((i) => i.exercise.id).join("+"));

describe("swap engine (ALGORITHMS §12)", () => {
  it("single swap: returns the closest exercise with a match % and set count", () => {
    const r = findSubstitutes(base());
    expect(r.options[0].kind).toBe("single");
    expect(r.options[0].items[0]).toMatchObject({ exercise: { id: "hack_squat" }, sets: 3 });
    expect(r.options[0].matchPct).toBe(100);
    expect(r.options[0].diffText).toBe("Same muscles");
    expect(r.options.length).toBeLessThanOrEqual(3);
  });

  it("prefers a single when one is at least 85% similar (no combo search)", () => {
    const r = findSubstitutes(
      base({ removed: { exercise: squat, plannedSets: 3, remainingSets: 3 } }),
    );
    expect(r.options.every((o) => o.kind === "single")).toBe(true);
    expect(r.options[0].matchPct).toBe(89); // leg press / hack squat vs squat
  });

  it("combo swap: splits sets across two exercises when no single is ≥ 85% similar", () => {
    const candidates = gym({ excludedExercises: new Set(["leg_press", "hack_squat"]) });
    const r = findSubstitutes(
      base({ removed: { exercise: squat, plannedSets: 3, remainingSets: 3 }, candidates }),
    );
    const top = r.options[0];
    expect(top.kind).toBe("combo");
    expect(top.items.map((i) => i.exercise.id).sort()).toEqual([
      "leg_extension",
      "machine_hip_thrust",
    ]);
    expect(top.items.map((i) => i.sets)).toEqual([2, 2]);
    expect(top.matchPct).toBe(94);
    expect(top.diffText).toBe("– less quads, glutes, adductors");
  });

  it("no equipment available: no options, skip-only", () => {
    const r = findSubstitutes(base({ candidates: [] }));
    expect(r).toEqual({ options: [], empty: "no_equipment" });
  });

  it("never offers exercises on broken equipment", () => {
    const hack = machines.get("hack_squat")!;
    const brokenGym = gym({
      equipment: [...machines.values()].map((m) =>
        m === hack ? { ...m, status: "broken" as const } : m,
      ),
    });
    expect(optionIds(findSubstitutes(base({ candidates: brokenGym })))).not.toContain("hack_squat");
  });

  it("respects permanent exclusions", () => {
    const r = findSubstitutes(
      base({ candidates: gym({ excludedExercises: new Set(["hack_squat"]) }) }),
    );
    expect(optionIds(r).join(" ")).not.toContain("hack_squat");
  });

  it("keeps total session volume per muscle within the per-session cap (VOL-4)", () => {
    const sessionOthers = [{ exercise: legExt, sets: 8 }]; // 8 quad sets already planned
    const r = findSubstitutes(base({ sessionOthers }));
    const baseVolume = scale(legExt.vector, 8);
    for (const o of r.options) {
      const volume = add(baseVolume, ...o.items.map((i) => scale(i.exercise.vector, i.sets)));
      for (const m of MUSCLES) expect(volume[m] ?? 0).toBeLessThanOrEqual(10);
    }
    expect(optionIds(r)).not.toContain("hack_squat"); // 3 more quad sets would make 11
  });

  it("excludes exercises already in the session and anything loading a pain-flagged region", () => {
    const r = findSubstitutes(base({ sessionOthers: [{ exercise: hackSquat, sets: 3 }] }));
    expect(optionIds(r).join(" ")).not.toContain("hack_squat");
    const pain = findSubstitutes(base({ candidates: gym({ painRegions: new Set(["knee"]) }) }));
    for (const o of pain.options)
      for (const i of o.items) expect(i.exercise.joints).not.toContain("knee");
  });

  it("penalises loading fatigued muscles and rewards same pattern / favourites", () => {
    const recovery = { ...full(100), quads: 20 };
    const r = findSubstitutes(base({ recovery, favourites: new Set(["hack_squat"]) }));
    expect(r.options[0].items[0].exercise.id).toBe("hack_squat");
  });

  it("is deterministic", () => {
    const a = optionIds(
      findSubstitutes(base({ removed: { exercise: squat, plannedSets: 4, remainingSets: 2 } })),
    );
    const b = optionIds(
      findSubstitutes(
        base({
          removed: { exercise: squat, plannedSets: 4, remainingSets: 2 },
          candidates: [...gym()].reverse(),
        }),
      ),
    );
    expect(a).toEqual(b);
  });
});
