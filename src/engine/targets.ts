import type { Config } from "./config";
import type { Exercise, Goal, RationaleEntry } from "./types";

/** Goal-specific reps, effort and rest (ALGORITHMS §3; LOAD-1, EFF-1, REST-1). */

export type Role =
  "strength_main" | "strength_accessory" | "hypertrophy_compound" | "hypertrophy_isolation";

/** RIR bands from ALGORITHMS §3 (EFF-1: hypertrophy closer to failure; strength 2–4 RIR suffices). */
const RIR: Record<Role, [number, number]> = {
  strength_main: [2, 3],
  strength_accessory: [1, 3],
  hypertrophy_compound: [1, 3],
  hypertrophy_isolation: [0, 2],
};

/** Fallback rep bands (LOAD-1) when an exercise has no range of its own. */
const REPS: Record<Role, [number, number]> = {
  strength_main: [3, 6],
  strength_accessory: [6, 10],
  hypertrophy_compound: [6, 12],
  hypertrophy_isolation: [10, 15],
};

export function roleFor(exercise: Exercise, goal: Goal, isMainLift: boolean): Role {
  if (goal === "strength")
    return isMainLift && exercise.kind === "compound" ? "strength_main" : "strength_accessory";
  return exercise.kind === "compound" ? "hypertrophy_compound" : "hypertrophy_isolation";
}

export interface Targets {
  role: Role;
  repRange: [number, number];
  rirRange: [number, number];
  /** Planning point inside the RIR band. */
  targetRir: number;
  restSeconds: number;
  rationale: RationaleEntry[];
}

export function targetsFor(
  exercise: Exercise,
  goal: Goal,
  isMainLift: boolean,
  cfg: Config,
  timeSaver = false,
): Targets {
  const role = roleFor(exercise, goal, isMainLift);
  const range = goal === "strength" ? exercise.rep_range.strength : exercise.rep_range.hypertrophy;
  const repRange: [number, number] = range ?? REPS[role];
  const rirRange = RIR[role];
  const rest = {
    strength_main: cfg.restStrengthMain,
    strength_accessory: cfg.restStrengthAccessory,
    hypertrophy_compound: cfg.restHypertrophyCompound,
    hypertrophy_isolation: cfg.restHypertrophyIsolation,
  }[role];
  // REST-1: never below 90 s unless the user chose time-saver mode, and then say so.
  const restSeconds = timeSaver ? cfg.restTimeSaver : Math.max(90, rest);
  return {
    role,
    repRange,
    rirRange,
    targetRir: (rirRange[0] + rirRange[1]) / 2,
    restSeconds,
    rationale: [{ rule: timeSaver ? "REST-1-TIMESAVER" : "REST-1", vars: { rest: restSeconds } }],
  };
}
