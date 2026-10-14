import { MUSCLES, type Muscle } from "@/data/schema";
import type { Config } from "./config";
import type { Exercise, SetLog } from "./types";

/**
 * Per-muscle fatigue and recovery (ALGORITHMS §5; REC-1, EFF-2).
 * HEURISTIC model: used only to rank exercises and soft-limit volume, never
 * to forbid training a muscle (PHIL-1).
 */

const LARGE: ReadonlySet<Muscle> = new Set([
  "quads",
  "hamstrings",
  "glutes",
  "lats",
  "chest",
  "upper_back",
]);

export function effortFactor(rpe: number | null, cfg: Config): number {
  if (rpe === null) return cfg.effortUnknown;
  if (rpe >= 10) return cfg.effortRpe10; // EFF-2: failure slows recovery
  if (rpe >= 9) return cfg.effortRpe9;
  if (rpe >= 8) return cfg.effortRpe8;
  return cfg.effortLow;
}

export function halfLifeHours(m: Muscle, cfg: Config): number {
  return LARGE.has(m) ? cfg.halfLifeLarge : cfg.halfLifeSmall;
}

export type MuscleMap = Record<Muscle, number>;

const zeros = (): MuscleMap => Object.fromEntries(MUSCLES.map((m) => [m, 0])) as MuscleMap;

export function muscleFatigue(
  sets: SetLog[],
  exercises: ReadonlyMap<string, Exercise>,
  now: number,
  soreness: Partial<Record<Muscle, number>>,
  cfg: Config,
): MuscleMap {
  const fatigue = zeros();
  // Beyond ~10 half-lives the contribution is negligible.
  const horizon = now - cfg.halfLifeLarge * 10 * 3600_000;
  for (const set of sets) {
    if (set.is_warmup || set.ts > now || set.ts < horizon) continue;
    const exercise = exercises.get(set.exercise_id);
    if (!exercise) continue;
    const effort = effortFactor(set.rpe, cfg);
    const hours = (now - set.ts) / 3600_000;
    for (const m of MUSCLES) {
      const w = exercise.vector[m];
      if (w) fatigue[m] += w * effort * 2 ** (-hours / halfLifeHours(m, cfg));
    }
  }
  for (const m of MUSCLES) fatigue[m] += (soreness[m] ?? 0) * cfg.sorenessWeight;
  return fatigue;
}

/** 0–100 per muscle; 100 = fully recovered. */
export function recovery(fatigue: MuscleMap, cfg: Config): MuscleMap {
  const out = zeros();
  for (const m of MUSCLES)
    out[m] = Math.round(100 * (1 - Math.min(fatigue[m] / cfg.fatigueCap, 1)));
  return out;
}

export function recoveryState(
  sets: SetLog[],
  exercises: ReadonlyMap<string, Exercise>,
  now: number,
  soreness: Partial<Record<Muscle, number>>,
  cfg: Config,
): MuscleMap {
  return recovery(muscleFatigue(sets, exercises, now, soreness, cfg), cfg);
}
