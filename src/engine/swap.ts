import { MUSCLES } from "@/data/schema";
import type { Candidate } from "./availability";
import type { Config } from "./config";
import type { MuscleMap } from "./fatigue";
import { add, cosine, describeDiff, l1, scale, subtract } from "./vector";
import type { Equipment, Exercise, RationaleEntry, Vector } from "./types";

/**
 * Swap engine (ALGORITHMS §12): replace an exercise with the closest single
 * exercise, or a pair whose summed fractional volume best matches it, using
 * only what's available right now, within per-session caps (VOL-4).
 */

export interface SwapItem {
  exercise: Exercise;
  equipment: Equipment | null;
  sets: number;
}

export interface SwapOption {
  kind: "single" | "combo";
  items: SwapItem[];
  similarity: number;
  matchPct: number;
  /** option volume − target volume, per muscle. */
  diff: Vector;
  diffText: string;
  rationale: RationaleEntry[];
}

export interface SwapResult {
  options: SwapOption[];
  /** Why there is nothing to offer; "skip without replacing" is always available. */
  empty?: "no_equipment" | "caps";
}

export interface SwapInput {
  removed: { exercise: Exercise; plannedSets: number; remainingSets: number };
  /** Available right now (gym, status, exclusions, temp exclusions and pain already applied). */
  candidates: readonly Candidate[];
  /** Other exercises still in the session and their sets, for the VOL-4 cap check. */
  sessionOthers: ReadonlyArray<{ exercise: Exercise; sets: number }>;
  caps: MuscleMap;
  recovery: MuscleMap;
  favourites: ReadonlySet<string>;
  cfg: Config;
}

function withinCaps(volume: Vector, caps: MuscleMap): boolean {
  return MUSCLES.every((m) => (volume[m] ?? 0) <= caps[m] + 1e-9);
}

/** Share of an exercise's stimulus landing on poorly recovered muscles (0–1). */
function fatiguedOverlap(exercise: Exercise, recovery: MuscleMap, cfg: Config): number {
  let total = 0;
  let fatigued = 0;
  for (const m of MUSCLES) {
    const w = exercise.vector[m] ?? 0;
    total += w;
    if (recovery[m] < cfg.lowRecovery) fatigued += w;
  }
  return total === 0 ? 0 : fatigued / total;
}

const idsOf = (items: SwapItem[]) => items.map((i) => i.exercise.id).join("+");

export function findSubstitutes(input: SwapInput): SwapResult {
  const { removed, cfg } = input;
  const S = removed.remainingSets;
  const target = scale(removed.exercise.vector, S);
  const inSession = new Set([
    removed.exercise.id,
    ...input.sessionOthers.map((o) => o.exercise.id),
  ]);
  const pool = input.candidates.filter((c) => !inSession.has(c.exercise.id));
  if (pool.length === 0 || S <= 0) return { options: [], empty: "no_equipment" };

  const base = add(...input.sessionOthers.map((o) => scale(o.exercise.vector, o.sets)));
  const option = (kind: SwapOption["kind"], items: SwapItem[], similarity: number): SwapOption => {
    const volume = add(...items.map((i) => scale(i.exercise.vector, i.sets)));
    const diff = subtract(volume, target);
    const matchPct = Math.round(similarity * 100);
    const diffText = describeDiff(diff);
    return {
      kind,
      items,
      similarity,
      matchPct,
      diff,
      diffText,
      rationale: [
        {
          rule: "SWAP",
          vars: { match: matchPct, original: removed.exercise.name, diff: diffText },
        },
      ],
    };
  };

  // Singles: similarity plus small bonuses/penalties.
  const singles: Array<{ option: SwapOption; score: number }> = [];
  for (const c of pool) {
    const sets = Math.min(
      removed.plannedSets + 1,
      Math.max(1, Math.round(l1(target) / Math.max(l1(c.exercise.vector), 1e-9))),
    );
    if (!withinCaps(add(base, scale(c.exercise.vector, sets)), input.caps)) continue;
    const similarity = cosine(target, c.exercise.vector);
    if (similarity <= 0) continue;
    const score =
      similarity +
      (c.exercise.pattern === removed.exercise.pattern ? cfg.swapPatternBonus : 0) -
      cfg.swapFatiguePenalty * fatiguedOverlap(c.exercise, input.recovery, cfg) +
      (input.favourites.has(c.exercise.id) ? cfg.swapFavouriteBonus : 0);
    singles.push({
      option: option(
        "single",
        [{ exercise: c.exercise, equipment: c.equipment, sets }],
        similarity,
      ),
      score,
    });
  }
  singles.sort(
    (a, b) => b.score - a.score || idsOf(a.option.items).localeCompare(idsOf(b.option.items)),
  );

  // Ranking uses the best raw similarity, not the bonus-adjusted order.
  const bestSingleSim = Math.max(0, ...singles.map((s) => s.option.similarity));
  if (bestSingleSim >= cfg.swapSingleThreshold) {
    return { options: singles.slice(0, 3).map((s) => s.option) };
  }

  // Combos (1 → 2): split the sets so the summed volume best matches the target.
  const K = [...pool]
    .map((c) => ({ c, sim: cosine(target, c.exercise.vector) }))
    .filter((x) => x.sim > 0)
    .sort((a, b) => b.sim - a.sim || a.c.exercise.id.localeCompare(b.c.exercise.id))
    .slice(0, cfg.swapComboK)
    .map((x) => x.c);
  const combos: Array<{ option: SwapOption; err: number; fatigue: number }> = [];
  for (let i = 0; i < K.length; i++) {
    for (let j = i + 1; j < K.length; j++) {
      const [a, b] = [K[i], K[j]];
      for (const total of [S, S + 1]) {
        for (let sa = 1; sa < total; sa++) {
          const sb = total - sa;
          const v = add(scale(a.exercise.vector, sa), scale(b.exercise.vector, sb));
          if (!withinCaps(add(base, v), input.caps)) continue;
          const similarity = cosine(target, v);
          if (similarity <= bestSingleSim + cfg.swapComboMargin) continue;
          let err = 0;
          for (const m of MUSCLES) {
            const d = (target[m] ?? 0) - (v[m] ?? 0);
            err += d * d + 0.5 * Math.max(0, -d); // penalise off-target volume
          }
          combos.push({
            option: option(
              "combo",
              [
                { exercise: a.exercise, equipment: a.equipment, sets: sa },
                { exercise: b.exercise, equipment: b.equipment, sets: sb },
              ],
              similarity,
            ),
            err,
            fatigue: a.exercise.fatigue_cost * sa + b.exercise.fatigue_cost * sb,
          });
        }
      }
    }
  }
  combos.sort(
    (x, y) =>
      y.option.similarity - x.option.similarity ||
      x.err - y.err ||
      x.fatigue - y.fatigue ||
      idsOf(x.option.items).localeCompare(idsOf(y.option.items)),
  );
  // Keep one split per pair (the best), so the top 3 aren't the same two exercises.
  const seenPairs = new Set<string>();
  const uniqueCombos = combos.filter((c) => {
    const key = c.option.items.map((i) => i.exercise.id).join("+");
    if (seenPairs.has(key)) return false;
    seenPairs.add(key);
    return true;
  });

  const options = [...uniqueCombos.map((c) => c.option), ...singles.map((s) => s.option)].slice(
    0,
    3,
  );
  return options.length > 0 ? { options } : { options: [], empty: "caps" };
}
