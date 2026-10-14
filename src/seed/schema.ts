import { z } from "zod";
import { equipmentTypeSchema, movementPatternSchema, muscleSchema } from "@/data/schema";

/**
 * Static seed data, generated once during development and committed as JSON
 * (ALGORITHMS.md §0). Never generated at runtime.
 */

/** Body regions a pain report can flag; exercises list the regions they load (EVIDENCE §10 rule 6). */
export const BODY_REGIONS = [
  "neck",
  "shoulder",
  "elbow",
  "wrist",
  "upper_back",
  "lower_back",
  "hip",
  "knee",
  "ankle",
] as const;
export const bodyRegionSchema = z.enum(BODY_REGIONS);
export type BodyRegion = z.infer<typeof bodyRegionSchema>;

/** The implement an exercise is performed with; templates link exercises by implement. */
export const IMPLEMENTS = [
  "barbell",
  "ez_bar",
  "trap_bar",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "smith",
  "bodyweight",
] as const;
export const implementSchema = z.enum(IMPLEMENTS);
export type Implement = z.infer<typeof implementSchema>;

const slug = z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "snake_case slug");
const repPair = z
  .tuple([z.number().int().min(1), z.number().int().min(1)])
  .refine(([lo, hi]) => lo <= hi, "range must be [low, high]");

/** VOL-2 weights only: prime mover 1.0, synergist 0.5. */
const vector = z
  .partialRecord(muscleSchema, z.union([z.literal(1), z.literal(0.5)]))
  .refine((v) => Object.values(v).some((w) => w === 1), "needs at least one prime mover (1.0)");

export const seedExerciseSchema = z.object({
  id: slug,
  name: z.string().min(3),
  aliases: z.array(z.string()).default([]),
  pattern: movementPatternSchema,
  vector,
  kind: z.enum(["compound", "isolation"]),
  implement: implementSchema,
  /**
   * Equipment types required (ALGORITHMS §0 `equipmentTypes`). The first is the
   * primary type: the exercise must be linked to an active item of that type
   * (equipment_exercises). Any further types (e.g. a bench) must merely be
   * present and active at the gym. Empty = needs no equipment (push-up, plank),
   * so it is always available.
   */
  equipment_types: z.array(equipmentTypeSchema),
  /** HEURISTIC systemic cost per set: lower-body compound 1.5, upper compound 1.2, isolation 0.8. */
  fatigue_cost: z.number().min(0.5).max(2),
  rep_range: z.object({ strength: repPair, hypertrophy: repPair }),
  /** Held for time (plank, carries): rep_range is in seconds; excluded from e1RM and load progression. */
  timed: z.boolean().default(false),
  loading: z.enum(["external", "bodyweight", "assisted"]),
  unilateral: z.boolean(),
  /** Load entered per hand (dumbbells, kettlebells). */
  per_hand: z.boolean(),
  /** Never use for an AMRAP calibration set (ALGORITHMS §10): heavy barbell squat/bench/deadlift etc. */
  calibration_safe: z.boolean(),
  joints: z.array(bodyRegionSchema).min(1),
});
export type SeedExercise = z.infer<typeof seedExerciseSchema>;

export const seedExercisesSchema = z.array(seedExerciseSchema).min(120);

/** ALGORITHMS §13: machine-name keyword → candidate exercise ids. */
export const keywordEntrySchema = z.object({
  keywords: z.array(z.string().min(2)).min(1),
  exercise_ids: z.array(slug).min(1),
  /** Suggested equipment type when a machine name matches this entry. */
  equipment_type: equipmentTypeSchema,
});
export const keywordDictionarySchema = z.array(keywordEntrySchema).min(100);
export type KeywordEntry = z.infer<typeof keywordEntrySchema>;

/** ALGORITHMS §15: e1RM ratio between related exercises (target ≈ source × ratio). HEURISTIC. */
export const loadRatioSchema = z.object({
  from: slug,
  to: slug,
  ratio: z.number().positive(),
});
export const loadRatiosSchema = z.array(loadRatioSchema);

/** Starting points for registering gear quickly (PROMPT: "Seed equipment templates"). */
export const equipmentTemplateSchema = z.object({
  id: slug,
  name: z.string(),
  type: equipmentTypeSchema,
  min_kg: z.number().nonnegative(),
  max_kg: z.number().nonnegative(),
  increment_kg: z.number().positive(),
  micro_increment_kg: z.number().positive().nullable(),
  exercise_ids: z.array(slug),
});
export const equipmentTemplatesSchema = z.array(equipmentTemplateSchema).min(10);
export type EquipmentTemplate = z.infer<typeof equipmentTemplateSchema>;

export const brandsSchema = z.array(z.string().min(2)).min(10);
