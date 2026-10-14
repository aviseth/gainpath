import { MUSCLES, type Muscle } from "@/data/schema";
import type { Config } from "./config";
import type { MuscleMap } from "./fatigue";
import type { Exercise, Experience, Goal, RationaleEntry, SetLog, Vector } from "./types";

/** Weekly volume targets and per-session distribution (ALGORITHMS §6; VOL-1..5, PHIL-1). */

const WEEK_MS = 7 * 24 * 3600_000;

/** Muscles that must be trained at least twice a week (PHIL-1). */
export const MAJOR_MUSCLES: readonly Muscle[] = [
  "chest",
  "lats",
  "upper_back",
  "side_delt",
  "rear_delt",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
];

const UPPER: ReadonlySet<Muscle> = new Set([
  "chest",
  "front_delt",
  "side_delt",
  "rear_delt",
  "lats",
  "upper_back",
  "biceps",
  "triceps",
  "forearms",
]);
const LOWER: ReadonlySet<Muscle> = new Set([
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "abductors",
  "calves",
]);

/** VOL-5 (HEURISTIC) base × goal factor × per-muscle auto-tuning (§11). */
export function weeklyTargets(
  goal: Goal,
  experience: Experience,
  userAdjust: Partial<Record<Muscle, number>>,
  cfg: Config,
): MuscleMap {
  const base = {
    novice: cfg.baseNovice,
    intermediate: cfg.baseIntermediate,
    advanced: cfg.baseAdvanced,
  }[experience];
  const factor = {
    hypertrophy: cfg.goalFactorHypertrophy,
    strength: cfg.goalFactorStrength,
    general: cfg.goalFactorGeneral,
  }[goal];
  return Object.fromEntries(
    MUSCLES.map((m) => [m, base * factor * (userAdjust[m] ?? 1)]),
  ) as MuscleMap;
}

/** Fractional sets per muscle over the rolling 7 days (VOL-2). Warm-ups don't count. */
export function weeklyDone(
  sets: SetLog[],
  exercises: ReadonlyMap<string, Exercise>,
  now: number,
): MuscleMap {
  const done = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as MuscleMap;
  for (const set of sets) {
    if (set.is_warmup || set.ts > now || set.ts <= now - WEEK_MS) continue;
    const exercise = exercises.get(set.exercise_id);
    if (!exercise) continue;
    for (const m of MUSCLES) done[m] += exercise.vector[m] ?? 0;
  }
  return done;
}

/** Sessions (days) in the last 7 days in which each muscle got ≥1 fractional set. */
export function weeklyExposures(
  sets: SetLog[],
  exercises: ReadonlyMap<string, Exercise>,
  now: number,
): MuscleMap {
  const perDay = new Map<string, Vector>();
  for (const set of sets) {
    if (set.is_warmup || set.ts > now || set.ts <= now - WEEK_MS) continue;
    const exercise = exercises.get(set.exercise_id);
    if (!exercise) continue;
    const key = set.session_id ?? new Date(set.ts).toISOString().slice(0, 10);
    const day = perDay.get(key) ?? {};
    for (const m of MUSCLES)
      if (exercise.vector[m]) day[m] = (day[m] ?? 0) + (exercise.vector[m] ?? 0);
    perDay.set(key, day);
  }
  const exposures = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as MuscleMap;
  for (const day of perDay.values())
    for (const m of MUSCLES) if ((day[m] ?? 0) >= 1) exposures[m]++;
  return exposures;
}

export type DayFocus = "full" | "upper" | "lower";

/** Split selection (HEURISTIC): only biases priority; deficits still drive the picks. */
export function dayFocus(sessionsPerWeek: number, sessionIndexThisWeek: number): DayFocus {
  if (sessionsPerWeek <= 3) return "full";
  if (sessionsPerWeek === 4) return sessionIndexThisWeek % 2 === 0 ? "upper" : "lower";
  return (["upper", "lower", "full"] as const)[sessionIndexThisWeek % 3];
}

export interface SessionNeedsInput {
  targets: MuscleMap;
  done: MuscleMap;
  exposures: MuscleMap;
  /** Volume skipped earlier this week to make up (ALGORITHMS §12 "skip without replacing"). */
  carryOver?: Vector;
  plannedSessionsThisWeek: number;
  completedThisWeek: number;
  /** Readiness (§4) and deload (§11) volume multipliers, combined. */
  volumeMod: number;
  /** Fraction of the week elapsed, 0–1. */
  weekProgress: number;
  focus: DayFocus;
  recovery: MuscleMap;
}

export interface SessionNeeds {
  needs: MuscleMap;
  /** Per-muscle session cap after the low-recovery soft limit (VOL-4, REC-1). */
  caps: MuscleMap;
  rationale: RationaleEntry[];
}

export function sessionNeeds(input: SessionNeedsInput, cfg: Config): SessionNeeds {
  const sessionsLeft = Math.max(1, input.plannedSessionsThisWeek - input.completedThisWeek);
  const needs = {} as MuscleMap;
  const caps = {} as MuscleMap;
  const rationale: RationaleEntry[] = [];
  for (const m of MUSCLES) {
    const deficit = Math.max(0, input.targets[m] - input.done[m]) + (input.carryOver?.[m] ?? 0);
    let need = (deficit / sessionsLeft) * input.volumeMod;
    // PHIL-1: a major muscle untouched by mid-week gets priority.
    if (MAJOR_MUSCLES.includes(m) && input.exposures[m] === 0 && input.weekProgress >= 0.5) {
      need *= cfg.minExposureBoost;
      if (need > 0) rationale.push({ rule: "PHIL-1", vars: { muscle: m } });
    }
    // HEURISTIC split bias: off-focus muscles keep half their priority.
    if ((input.focus === "upper" && LOWER.has(m)) || (input.focus === "lower" && UPPER.has(m)))
      need *= 0.5;
    // REC-1 soft limit: a poorly recovered muscle gets at most half the normal cap.
    let cap = cfg.sessionCapPerMuscle;
    if (input.recovery[m] < cfg.lowRecovery) {
      cap *= cfg.lowRecoverySetFraction;
      if (need > 0)
        rationale.push({ rule: "REC-1", vars: { muscle: m, recovery: input.recovery[m] } });
    }
    caps[m] = cap;
    needs[m] = Math.min(need, cap); // VOL-4: per-session plateau
  }
  return { needs, caps, rationale };
}
