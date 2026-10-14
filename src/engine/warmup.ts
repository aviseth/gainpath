import type { Config } from "./config";
import { roundToEquipment } from "./load";
import type { Equipment, Exercise } from "./types";

/** Warm-up ramps (ALGORITHMS §14). HEURISTIC throughout. */

export interface WarmupSet {
  weightKg: number;
  reps: number;
}

const RAMP: ReadonlyArray<[number, number]> = [
  [0.4, 8],
  [0.6, 5],
  [0.8, 2],
];

export function warmupSets(params: {
  exercise: Exercise;
  equipment: Pick<Equipment, "min_kg" | "max_kg" | "increment_kg" | "micro_increment_kg"> | null;
  workingKg: number;
  e1rm: number | null;
  /** A compound earlier in the session already warmed up the same muscles. */
  muscleAlreadyWarm: boolean;
  cfg: Config;
}): WarmupSet[] {
  const { exercise, equipment, workingKg, e1rm, cfg } = params;
  if (exercise.kind !== "compound" || exercise.loading !== "external" || !equipment) return [];
  const heavyEnough =
    workingKg >= cfg.warmupMinKg || (e1rm !== null && workingKg >= e1rm * cfg.warmupMinPct);
  if (!heavyEnough) return [];
  const ramp = params.muscleAlreadyWarm ? RAMP.slice(-1) : RAMP;
  const sets: WarmupSet[] = [];
  for (const [pct, reps] of ramp) {
    const ideal = workingKg * pct;
    if (ideal < equipment.min_kg) continue; // skip steps below what the machine can do
    const weightKg = roundToEquipment(ideal, equipment);
    if (weightKg >= workingKg || sets.some((s) => s.weightKg === weightKg)) continue;
    sets.push({ weightKg, reps });
  }
  return sets;
}
