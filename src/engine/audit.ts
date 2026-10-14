import { MOVEMENT_PATTERNS, MUSCLES, type MovementPattern, type Muscle } from "@/data/schema";
import type { Candidate } from "./availability";
import { muscleLabel } from "./vector";
import type { Equipment, Goal } from "./types";

/**
 * "Check my gym" (PROMPT.md): what the registered equipment can train, and
 * what's missing. Reports only; never suggests exercises for equipment the
 * user doesn't have.
 */

/** Muscles where a direct isolation exercise matters for balanced development. */
const ISOLATION_WANTED: Partial<Record<Muscle, string>> = {
  quads: "quad isolation (e.g. knee extension)",
  hamstrings: "hamstring isolation (knee flexion)",
  biceps: "biceps isolation",
  triceps: "triceps isolation",
  side_delt: "side-delt isolation",
  rear_delt: "rear-delt isolation",
  calves: "calf isolation",
};

const KEY_PATTERNS: readonly MovementPattern[] = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "hinge",
  "lunge",
  "knee_flexion",
];

export interface GymAudit {
  /** Exercises available per muscle as a prime mover. */
  muscles: Record<Muscle, { prime: number; isolation: number }>;
  patterns: Record<MovementPattern, number>;
  gaps: string[];
  /** Registered equipment with no exercises linked, so it can never be programmed. */
  unlinked: Equipment[];
  unavailable: Equipment[];
}

export function auditGym(params: {
  candidates: readonly Candidate[];
  equipment: readonly Equipment[];
  links: ReadonlyArray<{ equipment_id: string; exercise_id: string }>;
  goal: Goal;
}): GymAudit {
  const muscles = Object.fromEntries(
    MUSCLES.map((m) => [m, { prime: 0, isolation: 0 }]),
  ) as GymAudit["muscles"];
  const patterns = Object.fromEntries(MOVEMENT_PATTERNS.map((p) => [p, 0])) as GymAudit["patterns"];
  for (const { exercise } of params.candidates) {
    patterns[exercise.pattern]++;
    for (const m of MUSCLES) {
      if (exercise.vector[m] !== 1) continue;
      muscles[m].prime++;
      if (exercise.kind === "isolation") muscles[m].isolation++;
    }
  }

  const gaps: string[] = [];
  for (const m of MUSCLES) {
    if (muscles[m].prime === 0) gaps.push(`Nothing trains your ${muscleLabel(m)} directly.`);
    else if (ISOLATION_WANTED[m] && muscles[m].isolation === 0)
      gaps.push(`No ${ISOLATION_WANTED[m]} available.`);
  }
  for (const p of KEY_PATTERNS) {
    if (patterns[p] === 0) gaps.push(`No ${p.replace(/_/g, " ")} movement available.`);
  }
  if (params.goal === "strength") {
    const heavy = params.candidates.filter(
      (c) =>
        c.exercise.kind === "compound" &&
        ["barbell", "trap_bar", "smith"].includes(c.exercise.implement),
    );
    if (heavy.length === 0)
      gaps.push("No barbell-style compound lifts available for heavy strength work (LOAD-1).");
  }

  const linked = new Set(params.links.map((l) => l.equipment_id));
  return {
    muscles,
    patterns,
    gaps,
    unlinked: params.equipment.filter((e) => e.status !== "archived" && !linked.has(e.id)),
    unavailable: params.equipment.filter((e) => e.status === "broken"),
  };
}
