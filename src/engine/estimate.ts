import type { Config } from "./config";
import { availableLoads } from "./load";
import { cosine } from "./vector";
import type { Equipment, Exercise } from "./types";

/**
 * Starting load for an exercise/machine pair with no history (ALGORITHMS §15).
 * Conservative by design, with an explicit uncertainty margin (PROMPT:
 * "Machine-specific history"); the first working set then recalibrates (§9).
 */

export interface KnownE1rm {
  exerciseId: string;
  equipmentId: string;
  e1rm: number;
  /** When the estimate was last updated; newer wins among equals. */
  updatedAt: number;
}

export interface LoadRatio {
  from: string;
  to: string;
  ratio: number;
}

export type Estimate =
  | {
      kind: "e1rm";
      e1rm: number;
      uncertaintyPct: number;
      source: "other_equipment" | "similar_exercise";
      fromExerciseId: string;
    }
  | { kind: "fallback"; weightKg: number; targetRir: number };

function ratioBetween(from: Exercise, to: Exercise, ratios: readonly LoadRatio[]): number | null {
  const direct = ratios.find((r) => r.from === from.id && r.to === to.id);
  if (direct) return direct.ratio;
  const inverse = ratios.find((r) => r.from === to.id && r.to === from.id);
  if (inverse) return 1 / inverse.ratio;
  // Same implement and pattern loads similarly enough to borrow 1:1 (still discounted below).
  return from.implement === to.implement && from.per_hand === to.per_hand ? 1 : null;
}

export function estimateStart(params: {
  exercise: Exercise;
  equipment: Pick<
    Equipment,
    "id" | "min_kg" | "max_kg" | "increment_kg" | "micro_increment_kg"
  > | null;
  known: readonly KnownE1rm[];
  catalog: ReadonlyMap<string, Exercise>;
  ratios: readonly LoadRatio[];
  cfg: Config;
}): Estimate {
  const { exercise, equipment, known, cfg } = params;
  const newest = (list: readonly KnownE1rm[]) =>
    [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0];

  // 1. Same exercise on another machine: discount for machine differences.
  const sameExercise = known.filter(
    (k) => k.exerciseId === exercise.id && k.equipmentId !== equipment?.id,
  );
  if (sameExercise.length > 0) {
    const source = newest(sameExercise);
    return {
      kind: "e1rm",
      e1rm: source.e1rm * cfg.otherEquipmentFactor,
      uncertaintyPct: Math.round((1 - cfg.otherEquipmentFactor) * 100),
      source: "other_equipment",
      fromExerciseId: exercise.id,
    };
  }

  // 2. A similar exercise (same pattern, similar muscles) via the seeded ratio table.
  let best: { e1rm: number; similarity: number; from: string } | null = null;
  for (const k of known) {
    const other = params.catalog.get(k.exerciseId);
    if (!other || other.id === exercise.id || other.pattern !== exercise.pattern) continue;
    const similarity = cosine(other.vector, exercise.vector);
    if (similarity < cfg.similarExerciseCosine) continue;
    const ratio = ratioBetween(other, exercise, params.ratios);
    if (ratio === null) continue;
    const e1rm = k.e1rm * ratio * cfg.similarExerciseFactor;
    if (!best || similarity > best.similarity) best = { e1rm, similarity, from: other.id };
  }
  if (best) {
    return {
      kind: "e1rm",
      e1rm: best.e1rm,
      uncertaintyPct: Math.round((1 - cfg.similarExerciseFactor) * 100) + 10,
      source: "similar_exercise",
      fromExerciseId: best.from,
    };
  }

  // 3. Nothing to go on: a few steps above the machine's minimum, well short of failure.
  const loads = equipment ? availableLoads(equipment) : [0];
  const index = Math.min(loads.length - 1, Math.max(0, Math.round(cfg.fallbackSteps)));
  return { kind: "fallback", weightKg: loads[index] ?? 0, targetRir: cfg.fallbackRir };
}
