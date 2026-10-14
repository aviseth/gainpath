import { MUSCLES } from "@/data/schema";
import type { Candidate } from "./availability";
import type { Config } from "./config";
import type { MuscleMap } from "./fatigue";
import { add, cosine, scale } from "./vector";
import type { Vector } from "./types";

/** Greedy, deterministic exercise selection (ALGORITHMS §7). */

export interface SelectionInput {
  candidates: readonly Candidate[];
  needs: MuscleMap;
  caps: MuscleMap;
  recovery: MuscleMap;
  setBudget: number;
  favourites: ReadonlySet<string>;
  /** Current mesocycle anchors (§8): exercise ids. */
  anchors: ReadonlySet<string>;
  lastSessionExerciseIds: ReadonlySet<string>;
  /** Score penalty for a machine, e.g. often busy at this time (§12). */
  equipmentPenalty?: (equipmentId: string | null) => number;
  cfg: Config;
}

export interface Selection {
  candidate: Candidate;
  sets: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Sets suggested for an exercise to cover its most-needed muscle (§7). */
export function setsFor(vector: Vector, needs: MuscleMap, min: number, max: number): number {
  let want = 0;
  for (const m of MUSCLES) {
    const w = vector[m] ?? 0;
    if (w > 0) want = Math.max(want, needs[m] / w);
  }
  return clamp(Math.round(want), min, max);
}

export function selectExercises(input: SelectionInput): Selection[] {
  const { cfg } = input;
  const needs = { ...input.needs };
  let budget = Math.floor(input.setBudget);
  let sessionVolume: Vector = {};
  const chosen: Selection[] = [];
  const usedPatterns = new Set<string>();
  const minSets = Math.max(1, Math.round(cfg.minSetsPerExercise));

  while (budget >= minSets && MUSCLES.some((m) => needs[m] > cfg.minNeed)) {
    let best: { selection: Selection; score: number; coverage: number } | null = null;
    for (const candidate of input.candidates) {
      const { exercise } = candidate;
      if (chosen.some((c) => c.candidate.exercise.id === exercise.id)) continue;
      const sets = setsFor(
        exercise.vector,
        needs,
        minSets,
        Math.min(cfg.maxSetsPerExercise, budget),
      );
      let coverage = 0;
      let overshoot = 0;
      let capViolations = 0;
      for (const m of MUSCLES) {
        const dose = (exercise.vector[m] ?? 0) * sets;
        if (dose === 0) continue;
        coverage += Math.min(dose, needs[m]) * (input.recovery[m] / 100);
        overshoot += Math.max(0, dose - needs[m]);
        if ((sessionVolume[m] ?? 0) + dose > input.caps[m] + 1e-9) capViolations++;
      }
      const isAnchor = input.anchors.has(exercise.id);
      const score =
        coverage -
        cfg.wOvershoot * (overshoot + capViolations * 10) -
        cfg.wFatigue * exercise.fatigue_cost * sets +
        (input.favourites.has(exercise.id) ? cfg.wFavourite : 0) +
        (isAnchor ? cfg.wAnchor : 0) -
        (usedPatterns.has(exercise.pattern) ? cfg.wSamePattern : 0) -
        (input.lastSessionExerciseIds.has(exercise.id) && !isAnchor ? cfg.wUsedLastSession : 0) -
        (input.equipmentPenalty?.(candidate.equipment?.id ?? null) ?? 0);
      const better =
        !best ||
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) <= 1e-9 &&
          exercise.id < best.selection.candidate.exercise.id);
      if (better) best = { selection: { candidate, sets }, score, coverage };
    }
    // Stop once nothing left actually covers an outstanding need.
    if (!best || best.coverage <= 0) break;
    const { candidate, sets } = best.selection;
    chosen.push(best.selection);
    usedPatterns.add(candidate.exercise.pattern);
    const dose = scale(candidate.exercise.vector, sets);
    sessionVolume = add(sessionVolume, dose);
    for (const m of MUSCLES) needs[m] = Math.max(0, needs[m] - (dose[m] ?? 0));
    budget -= sets;
  }
  return orderSession(chosen, cfg);
}

/**
 * Compounds before isolations, heavier first, then avoid back-to-back
 * exercises that hit nearly the same muscles where a reorder allows (§7).
 */
export function orderSession(selections: Selection[], cfg: Config): Selection[] {
  const sorted = [...selections].sort((a, b) => {
    const ka = a.candidate.exercise.kind === "compound" ? 0 : 1;
    const kb = b.candidate.exercise.kind === "compound" ? 0 : 1;
    if (ka !== kb) return ka - kb;
    const fa = a.candidate.exercise.fatigue_cost;
    const fb = b.candidate.exercise.fatigue_cost;
    if (fa !== fb) return fb - fa;
    return a.candidate.exercise.id.localeCompare(b.candidate.exercise.id);
  });
  const vec = (i: number) => sorted[i]?.candidate.exercise.vector;
  const similar = (a: number, b: number) =>
    a >= 0 && b < sorted.length && cosine(vec(a)!, vec(b)!) > cfg.adjacentCosine;
  for (let i = 1; i < sorted.length; i++) {
    if (!similar(i - 1, i)) continue;
    const kind = sorted[i].candidate.exercise.kind;
    // Prefer pulling a later exercise of the same kind forward…
    const j = sorted.findIndex(
      (s, k) => k > i && s.candidate.exercise.kind === kind && !similar(i - 1, k),
    );
    if (j > i) {
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      continue;
    }
    // …otherwise move this one earlier within its kind group, between dissimilar neighbours.
    const item = sorted[i];
    const rest = sorted.filter((_, k) => k !== i);
    for (let p = 0; p < i; p++) {
      if (rest[p].candidate.exercise.kind !== kind) continue;
      const before = rest[p - 1]?.candidate.exercise.vector;
      const after = rest[p].candidate.exercise.vector;
      const fits =
        (!before || cosine(before, item.candidate.exercise.vector) <= cfg.adjacentCosine) &&
        cosine(after, item.candidate.exercise.vector) <= cfg.adjacentCosine;
      if (fits) {
        rest.splice(p, 0, item);
        sorted.splice(0, sorted.length, ...rest);
        break;
      }
    }
  }
  return sorted;
}
