import { describe, expect, it } from "vitest";
import { MUSCLES } from "@/data/schema";
import { EQUIPMENT_TEMPLATES, LOAD_RATIOS, SEED_EXERCISES } from "@/seed/catalog";
import { cfg, DAY, eq, NOW, set } from "@/test/engine-fixtures";
import { availableCandidates, BODYWEIGHT_EQUIPMENT_ID } from "./availability";
import { availableLoads } from "./load";
import { buildSessionPlan, type PlanInput } from "./plan";
import { computeReadiness } from "./readiness";
import type { Equipment } from "./types";

const catalog = new Map(SEED_EXERCISES.map((e) => [e.id, e]));

/** A typical commercial gym registered from templates. */
function templateGym(ids: string[]) {
  const equipment: Equipment[] = [];
  const links: Array<{ equipment_id: string; exercise_id: string }> = [];
  for (const id of ids) {
    const t = EQUIPMENT_TEMPLATES.find((x) => x.id === id)!;
    const item = eq(t.type, {
      name: t.name,
      min_kg: t.min_kg,
      max_kg: t.max_kg,
      increment_kg: t.increment_kg,
      micro_increment_kg: t.micro_increment_kg,
    });
    equipment.push(item);
    for (const exercise_id of t.exercise_ids) links.push({ equipment_id: item.id, exercise_id });
  }
  return { equipment, links };
}

const gym = templateGym([
  "barbell_power_rack",
  "adjustable_bench",
  "dumbbells_light",
  "functional_trainer",
  "lat_pulldown",
  "chest_press",
  "leg_extension",
  "seated_leg_curl",
  "leg_press_45",
  "hip_abduction_adduction",
  "standing_calf_raise",
  "pec_deck_rear_delt",
]);

function input(overrides: Partial<PlanInput> = {}, equipment = gym.equipment): PlanInput {
  return {
    now: NOW,
    profile: {
      goal: "hypertrophy",
      experience: "intermediate",
      sessions_per_week: 3,
      session_minutes: 60,
      time_saver_mode: false,
      calibration_offset: 0,
    },
    catalog,
    candidates: availableCandidates({ catalog: SEED_EXERCISES, equipment, links: gym.links }),
    history: [],
    soreness: {},
    readiness: computeReadiness({ sleepQuality: 3, energy: 3 }, cfg),
    userAdjust: {},
    plannedSessionsThisWeek: 3,
    completedThisWeek: 0,
    weekProgress: 0.1,
    favourites: new Set(),
    anchors: [],
    anchorInvalid: () => null,
    lastSessionExerciseIds: new Set(),
    isDeload: false,
    calibrationDue: false,
    knownE1rms: [],
    ratios: LOAD_RATIOS,
    cfg,
    ...overrides,
  };
}

const totalSets = (p: ReturnType<typeof buildSessionPlan>) =>
  p.exercises.reduce((s, e) => s + e.sets, 0);

describe("session plan (ALGORITHMS §4–§16, integration with seed data)", () => {
  const plan = buildSessionPlan(input());

  it("builds a full-body session using only registered equipment", () => {
    expect(plan.exercises.length).toBeGreaterThanOrEqual(4);
    const ids = new Set([...gym.equipment.map((e) => e.id), BODYWEIGHT_EQUIPMENT_ID]);
    for (const p of plan.exercises) expect(ids.has(p.equipmentId), p.exerciseId).toBe(true);
    const muscles = MUSCLES.filter((m) => (plan.plannedVolume[m] ?? 0) > 0);
    expect(muscles).toEqual(expect.arrayContaining(["chest", "quads", "lats"]));
  });

  it("fits the session length and per-session caps (VOL-4)", () => {
    const budget = Math.floor(
      (60 * 60) /
        (cfg.setWorkSeconds + (cfg.restHypertrophyCompound + cfg.restHypertrophyIsolation) / 2),
    );
    expect(totalSets(plan)).toBeLessThanOrEqual(budget);
    for (const m of MUSCLES)
      expect(plan.plannedVolume[m] ?? 0).toBeLessThanOrEqual(cfg.sessionCapPerMuscle + 1e-9);
  });

  it("prescribes loads the machine can actually be set to, with a cited rationale", () => {
    for (const p of plan.exercises) {
      expect(p.rationale.some((r) => r.rule.startsWith("REST-1"))).toBe(true);
      const machine = gym.equipment.find((e) => e.id === p.equipmentId);
      if (machine && p.weightKg !== null) expect(availableLoads(machine)).toContain(p.weightKg);
    }
  });

  it("is deterministic", () => {
    const again = buildSessionPlan(input());
    expect(again.exercises.map((e) => `${e.exerciseId}:${e.sets}:${e.weightKg}`)).toEqual(
      plan.exercises.map((e) => `${e.exerciseId}:${e.sets}:${e.weightKg}`),
    );
  });

  it("never uses a broken machine", () => {
    const pressId = gym.links.find((l) => l.exercise_id === "machine_chest_press")!.equipment_id;
    const equipment = gym.equipment.map((e) =>
      e.id === pressId ? { ...e, status: "broken" as const } : e,
    );
    const p = buildSessionPlan(
      input({
        candidates: availableCandidates({ catalog: SEED_EXERCISES, equipment, links: gym.links }),
      }),
    );
    expect(p.exercises.some((e) => e.equipmentId === pressId)).toBe(false);
  });

  it("deload week: fewer sets, ≥3 RIR, same loads (DELOAD-2)", () => {
    const deload = buildSessionPlan(input({ isDeload: true }));
    expect(totalSets(deload)).toBeLessThan(totalSets(plan));
    expect(deload.exercises.every((e) => e.targetRir >= 3)).toBe(true);
    expect(deload.rationale.some((r) => r.rule === "DELOAD-2")).toBe(true);
  });

  it("low readiness: less volume, more reserve, no load increases (READY-1, READY-3)", () => {
    const readiness = computeReadiness({ sleepQuality: 1, energy: 1, sleepHours: 4 }, cfg);
    const eqId = gym.links.find((l) => l.exercise_id === "leg_extension")!.equipment_id;
    const history = [0, 1, 2].map((i) =>
      set("leg_extension", 50, 15, 8, NOW - 3 * DAY + i * 60_000, { equipment_id: eqId }),
    );
    const keep = new Set([
      "leg_extension",
      "machine_chest_press",
      "lat_pulldown_wide",
      "seated_leg_curl",
    ]);
    const candidates = input().candidates.filter((c) => keep.has(c.exercise.id));
    const normal = buildSessionPlan(input({ history, candidates }));
    const tired = buildSessionPlan(input({ history, readiness, candidates }));
    expect(totalSets(tired)).toBeLessThan(totalSets(normal));
    const n = normal.exercises.find((e) => e.exerciseId === "leg_extension");
    const t = tired.exercises.find((e) => e.exerciseId === "leg_extension");
    expect(n?.weightKg).toBe(52.5); // top of the range → one step (2.5 kg add-on weight)
    expect(t?.weightKg).toBe(50);
  });

  it("marks one safe exercise for an AMRAP calibration set when due (EFF-3)", () => {
    const p = buildSessionPlan(input({ calibrationDue: true }));
    const calibration = p.exercises.filter((e) => e.calibration);
    expect(calibration).toHaveLength(1);
    expect(catalog.get(calibration[0].exerciseId)?.calibration_safe).toBe(true);
  });

  it("starts unfamiliar machines conservatively with an explicit uncertainty", () => {
    const withEstimate = plan.exercises.filter((e) => e.estimate);
    expect(withEstimate.length).toBeGreaterThan(0);
    for (const e of withEstimate) expect(e.rationale.some((r) => r.rule === "ESTIMATE")).toBe(true);
  });

  it("creates anchors for the mesocycle from today's compounds (§8)", () => {
    expect(plan.anchors.length).toBeGreaterThan(0);
    for (const a of plan.anchors)
      expect(plan.exercises.some((e) => e.exerciseId === a.exerciseId)).toBe(true);
  });
});
