import { z } from "zod";

/**
 * Data model shared by Dexie (local, primary store), Supabase (cloud backup) and
 * JSON export/import. See PLAN.md §2.
 *
 * Every synced record carries the base fields below. `updated_at` is a client
 * clock in ms and decides last-write-wins; `deleted_at` is a soft delete
 * (tombstone) so deletions propagate through sync and import.
 */

export const MUSCLES = [
  "chest",
  "front_delt",
  "side_delt",
  "rear_delt",
  "lats",
  "upper_back",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "abductors",
  "calves",
  "abs",
] as const;
export const muscleSchema = z.enum(MUSCLES);
export type Muscle = z.infer<typeof muscleSchema>;

/** Fractional weights per VOL-2: prime mover 1.0, synergist 0.5. */
export const muscleVectorSchema = z.partialRecord(
  muscleSchema,
  z.union([z.literal(1), z.literal(0.5)]),
);
export type MuscleVector = z.infer<typeof muscleVectorSchema>;

export const EQUIPMENT_TYPES = [
  "selectorized",
  "plate_loaded",
  "cable_station",
  "free_weights",
  "bench_rack",
  "bodyweight_station",
] as const;
export const equipmentTypeSchema = z.enum(EQUIPMENT_TYPES);
export type EquipmentType = z.infer<typeof equipmentTypeSchema>;

export const MOVEMENT_PATTERNS = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "hinge",
  "lunge",
  "knee_extension",
  "knee_flexion",
  "hip_abduction",
  "hip_adduction",
  "hip_extension",
  "elbow_flexion",
  "elbow_extension",
  "shoulder_abduction",
  "shoulder_flexion",
  "rear_delt_fly",
  "chest_fly",
  "calf_raise",
  "core_flexion",
  "core_anti_extension",
  "core_rotation",
  "carry",
  "wrist",
] as const;
export const movementPatternSchema = z.enum(MOVEMENT_PATTERNS);
export type MovementPattern = z.infer<typeof movementPatternSchema>;

const id = z.string().min(1);
const epochMs = z.number().int().nonnegative();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const baseRecordSchema = z.object({
  id,
  user_id: z.string().min(1),
  created_at: epochMs,
  updated_at: epochMs,
  deleted_at: epochMs.nullable(),
});

const repRange = z.tuple([z.number().int().positive(), z.number().int().positive()]);

export const tableSchemas = {
  profiles: baseRecordSchema.extend({
    goal: z.enum(["strength", "hypertrophy", "general"]),
    experience: z.enum(["novice", "intermediate", "advanced"]),
    sessions_per_week: z.number().int().min(1).max(7),
    session_minutes: z.number().int().min(15).max(180),
    time_saver_mode: z.boolean(),
    calibration_offset: z.number().min(-2).max(2),
    config_overrides: z.record(z.string(), z.number()),
    current_gym_id: z.string().nullable(),
  }),
  gyms: baseRecordSchema.extend({
    name: z.string().min(1),
    is_default: z.boolean(),
  }),
  equipment: baseRecordSchema.extend({
    gym_id: id,
    name: z.string().min(1),
    type: equipmentTypeSchema,
    brand: z.string().nullable(),
    model: z.string().nullable(),
    min_kg: z.number().nonnegative(),
    max_kg: z.number().nonnegative(),
    increment_kg: z.number().positive(),
    micro_increment_kg: z.number().positive().nullable(),
    photo_path: z.string().nullable(),
    notes: z.string().nullable(),
    status: z.enum(["active", "broken", "archived"]),
    broken_since: epochMs.nullable(),
    status_reason: z.string().nullable(),
  }),
  /** Custom exercises only; the seed catalogue is static JSON (ALGORITHMS §0). */
  exercises: baseRecordSchema.extend({
    name: z.string().min(1),
    pattern: movementPatternSchema,
    vector: muscleVectorSchema.refine((v) => Object.keys(v).length > 0, {
      message: "a custom exercise needs at least one muscle (VOL-2)",
    }),
    kind: z.enum(["compound", "isolation"]),
    equipment_types: z.array(equipmentTypeSchema).min(1),
    fatigue_cost: z.number().positive(),
    rep_range: z.object({ strength: repRange, hypertrophy: repRange }),
  }),
  equipment_exercises: baseRecordSchema.extend({
    equipment_id: id,
    exercise_id: id,
  }),
  exercise_prefs: baseRecordSchema.extend({
    exercise_id: z.string().nullable(),
    equipment_id: z.string().nullable(),
    kind: z.enum(["exclude", "favourite", "deprioritise"]),
    // For "deprioritise": the busy time slot as "weekday:bucket" (ALGORITHMS §12).
    // For "exclude": the user's optional reason.
    reason: z.string().nullable(),
  }),
  temp_exclusions: baseRecordSchema.extend({
    date: isoDate,
    equipment_id: z.string().nullable(),
    exercise_id: z.string().nullable(),
    body_region: z.string().nullable(),
    reason: z.enum(["busy", "feel", "pain", "free_text"]),
  }),
  sessions: baseRecordSchema.extend({
    gym_id: id,
    date: isoDate,
    status: z.enum(["planned", "active", "done", "skipped"]),
    readiness_score: z.number().min(0).max(100).nullable(),
    is_deload: z.boolean(),
    is_calibration: z.boolean(),
    plan: z.unknown(),
    rationale: z.unknown(),
  }),
  set_logs: baseRecordSchema.extend({
    session_id: z.string().nullable(),
    exercise_id: id,
    equipment_id: id,
    ts: epochMs,
    weight_kg: z.number().nonnegative(),
    reps: z.number().int().nonnegative(),
    rpe: z.number().min(6).max(10).nullable(),
    rir: z.number().min(0).nullable(),
    is_warmup: z.boolean(),
    is_amrap: z.boolean(),
    predicted_rir: z.number().min(0).nullable(),
    approximate: z.boolean(),
  }),
  e1rm_estimates: baseRecordSchema.extend({
    exercise_id: id,
    equipment_id: id,
    value_kg: z.number().nonnegative(),
    uncertainty_pct: z.number().nonnegative(),
    updated_from_set_id: z.string().nullable(),
    history: z.unknown(),
  }),
  swaps: baseRecordSchema.extend({
    session_id: id,
    removed_exercise_id: id,
    removed_equipment_id: z.string().nullable(),
    reason: z.enum(["busy", "broken", "feel", "dislike", "pain", "free_text", "skip"]),
    accepted_option: z.unknown(),
    weekday: z.number().int().min(0).max(6),
    time_bucket: z.number().int().min(0).max(11),
  }),
  checkins: baseRecordSchema.extend({
    date: isoDate,
    sleep_quality: z.number().int().min(1).max(5),
    energy: z.number().int().min(1).max(5),
    sleep_hours: z.number().min(0).max(24).nullable(),
    soreness: z.partialRecord(muscleSchema, z.number().int().min(0).max(3)),
  }),
  wearable_daily: baseRecordSchema.extend({
    date: isoDate,
    source: z.enum(["google_health", "ingest"]),
    hrv_ms: z.number().positive().nullable(),
    resting_hr: z.number().positive().nullable(),
    sleep_hours: z.number().min(0).max(24).nullable(),
  }),
  anchors: baseRecordSchema.extend({
    muscle_region: z.string().min(1),
    exercise_id: id,
    equipment_id: z.string().nullable(),
    mesocycle_start: epochMs,
  }),
  mesocycles: baseRecordSchema.extend({
    start: epochMs,
    end: epochMs.nullable(),
    user_adjust: z.partialRecord(muscleSchema, z.number().min(0.7).max(1.5)),
  }),
  ai_cache: baseRecordSchema.extend({
    kind: z.enum(["machine_name", "photo_hash", "weekly_review", "constraint"]),
    key: z.string().min(1),
    value: z.unknown(),
  }),
} as const;

export type TableName = keyof typeof tableSchemas;
export const TABLE_NAMES = Object.keys(tableSchemas) as TableName[];

export type BaseRecord = z.infer<typeof baseRecordSchema>;
export type RecordOf<T extends TableName> = z.infer<(typeof tableSchemas)[T]>;

/** A record as stored in Dexie: adds the local-only `dirty` flag (1 = not yet pushed). */
export type Stored<T extends TableName> = RecordOf<T> & { dirty: 0 | 1 };

export type Profile = RecordOf<"profiles">;
export type Gym = RecordOf<"gyms">;
export type Equipment = RecordOf<"equipment">;
export type CustomExercise = RecordOf<"exercises">;
export type SetLog = RecordOf<"set_logs">;
