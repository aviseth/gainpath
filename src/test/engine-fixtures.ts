import type { Equipment, EquipmentType, MovementPattern } from "@/data/schema";
import { DEFAULT_CONFIG, type Config } from "@/engine/config";
import type { Exercise, SetLog, Vector } from "@/engine/types";

/** Small builders for engine tests. */

export const cfg: Config = { ...DEFAULT_CONFIG };
export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
export const NOW = Date.parse("2026-10-14T18:00:00Z");

export function ex(id: string, vector: Vector, overrides: Partial<Exercise> = {}): Exercise {
  const kind = overrides.kind ?? (Object.keys(vector).length > 1 ? "compound" : "isolation");
  return {
    id,
    name: id.replace(/_/g, " "),
    aliases: [],
    pattern: "horizontal_push" as MovementPattern,
    vector: vector as Exercise["vector"],
    kind,
    implement: "machine",
    equipment_types: ["selectorized"],
    fatigue_cost: kind === "compound" ? 1.2 : 0.8,
    rep_range: { strength: [5, 8], hypertrophy: [8, 12] },
    timed: false,
    loading: "external",
    unilateral: false,
    per_hand: false,
    calibration_safe: true,
    joints: ["shoulder"],
    ...overrides,
  };
}

let eqCounter = 0;
export function eq(
  type: EquipmentType = "selectorized",
  overrides: Partial<Equipment> = {},
): Equipment {
  eqCounter++;
  return {
    id: `eq-${String(eqCounter).padStart(3, "0")}`,
    user_id: "u",
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    gym_id: "gym-1",
    name: `${type} ${eqCounter}`,
    type,
    brand: null,
    model: null,
    min_kg: 5,
    max_kg: 100,
    increment_kg: 5,
    micro_increment_kg: null,
    weights_kg: null,
    photo_path: null,
    notes: null,
    status: "active",
    broken_since: null,
    status_reason: null,
    ...overrides,
  };
}

let setCounter = 0;
export function set(
  exerciseId: string,
  weightKg: number,
  reps: number,
  rpe: number | null,
  ts: number,
  overrides: Partial<SetLog> = {},
): SetLog {
  setCounter++;
  return {
    id: `set-${setCounter}`,
    user_id: "u",
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    session_id: overrides.session_id ?? `s-${new Date(ts).toISOString().slice(0, 10)}`,
    exercise_id: exerciseId,
    equipment_id: "eq-x",
    ts,
    weight_kg: weightKg,
    reps,
    rpe,
    rir: rpe === null ? null : 10 - rpe,
    is_warmup: false,
    is_amrap: false,
    predicted_rir: null,
    approximate: false,
    ...overrides,
  };
}

export const catalogOf = (...exercises: Exercise[]) => new Map(exercises.map((e) => [e.id, e]));
