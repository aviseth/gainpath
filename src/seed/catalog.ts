import type { CustomExercise, Muscle } from "@/data/schema";
import type { Exercise } from "@/engine/types";
import brandsJson from "./data/brands.json";
import exercisesJson from "./data/exercises.json";
import keywordsJson from "./data/keywords.json";
import ratiosJson from "./data/load-ratios.json";
import templatesJson from "./data/equipment-templates.json";
import {
  brandsSchema,
  equipmentTemplatesSchema,
  keywordDictionarySchema,
  loadRatiosSchema,
  seedExercisesSchema,
  type BodyRegion,
  type Implement,
} from "./schema";

/** Static catalogue, parsed once (ALGORITHMS §0: committed JSON, never generated at runtime). */

export const SEED_EXERCISES: readonly Exercise[] = seedExercisesSchema.parse(exercisesJson);
export const KEYWORDS = keywordDictionarySchema.parse(keywordsJson);
export const LOAD_RATIOS = loadRatiosSchema.parse(ratiosJson);
export const EQUIPMENT_TEMPLATES = equipmentTemplatesSchema.parse(templatesJson);
export const BRANDS = brandsSchema.parse(brandsJson);

const IMPLEMENT_BY_TYPE: Record<string, Implement> = {
  selectorized: "machine",
  plate_loaded: "machine",
  cable_station: "cable",
  free_weights: "dumbbell",
  bench_rack: "barbell",
  bodyweight_station: "bodyweight",
};

/** Joints a custom exercise loads, inferred from its muscles (used for pain filtering). */
const JOINTS_BY_MUSCLE: Record<Muscle, BodyRegion[]> = {
  chest: ["shoulder", "elbow"],
  front_delt: ["shoulder"],
  side_delt: ["shoulder"],
  rear_delt: ["shoulder"],
  lats: ["shoulder", "elbow"],
  upper_back: ["shoulder", "upper_back"],
  biceps: ["elbow", "wrist"],
  triceps: ["elbow"],
  forearms: ["wrist", "elbow"],
  quads: ["knee", "hip"],
  hamstrings: ["knee", "hip"],
  glutes: ["hip"],
  adductors: ["hip"],
  abductors: ["hip"],
  calves: ["ankle"],
  abs: ["lower_back"],
};

/** Normalise a user's custom exercise into the catalogue shape. */
export function customToExercise(custom: CustomExercise): Exercise {
  const muscles = Object.keys(custom.vector) as Muscle[];
  const joints = [...new Set(muscles.flatMap((m) => JOINTS_BY_MUSCLE[m]))];
  return {
    id: custom.id,
    name: custom.name,
    aliases: [],
    pattern: custom.pattern,
    vector: custom.vector as Exercise["vector"],
    kind: custom.kind,
    implement: IMPLEMENT_BY_TYPE[custom.equipment_types[0]] ?? "machine",
    equipment_types: custom.equipment_types,
    fatigue_cost: custom.fatigue_cost,
    rep_range: {
      strength: custom.rep_range.strength as [number, number],
      hypertrophy: custom.rep_range.hypertrophy as [number, number],
    },
    timed: false,
    loading: "external",
    unilateral: false,
    per_hand: false,
    // Unknown machines are treated like other machines: fine for a calibration AMRAP if isolation.
    calibration_safe: custom.kind === "isolation",
    joints: joints.length > 0 ? joints : ["shoulder"],
    custom: true,
  };
}

/** Seed + custom exercises (custom ids are uuids, so they never collide with seed slugs). */
export function buildCatalog(customs: readonly CustomExercise[]): Map<string, Exercise> {
  const catalog = new Map<string, Exercise>(SEED_EXERCISES.map((e) => [e.id, e]));
  for (const custom of customs)
    if (custom.deleted_at === null) catalog.set(custom.id, customToExercise(custom));
  return catalog;
}
