import type { Config } from "./config";
import { adjustedRir, epley } from "./e1rm";
import { roundToEquipment, stepUp, targetLoad } from "./load";
import type { Equipment, RationaleEntry, SetLog } from "./types";

/** Double progression and in-session adjustment (ALGORITHMS §9; PROG-1, PROG-2, EFF-2). */

type LoadRange = Pick<Equipment, "min_kg" | "max_kg" | "increment_kg" | "micro_increment_kg">;

/** HEURISTIC: when one equipment step exceeds the +5% cap, require this many reps past the top first. */
export const OVERFLOW_REPS = 2;

export interface NextExposure {
  weightKg: number;
  targetReps: number;
  rationale: RationaleEntry[];
}

const working = (sets: SetLog[]) => sets.filter((s) => !s.is_warmup).sort((a, b) => a.ts - b.ts);

function meanRir(
  sets: SetLog[],
  targetRir: number,
  calibrationOffset: number,
  cfg: Config,
): number {
  // A set logged without RPE is assumed to be on target (we can't judge it).
  const rirs = sets.map((s) =>
    s.rpe === null ? targetRir : adjustedRir(s.rpe, s.reps, calibrationOffset, cfg),
  );
  return rirs.reduce((a, b) => a + b, 0) / rirs.length;
}

/**
 * Plan the next exposure from the last two (most recent last). `lastSets` are
 * the working sets of the most recent exposure on this exercise + machine.
 */
export function nextExposure(params: {
  lastSets: SetLog[];
  previousSets?: SetLog[];
  repRange: [number, number];
  targetRir: number;
  equipment: LoadRange;
  allowIncrease: boolean;
  calibrationOffset: number;
  cfg: Config;
}): NextExposure {
  const { repRange, targetRir, equipment: eq, cfg } = params;
  const [bottom, top] = repRange;
  const last = working(params.lastSets);
  if (last.length === 0) throw new Error("nextExposure needs at least one working set");
  const load = last[0].weight_kg;
  const effortOk =
    meanRir(last, targetRir, params.calibrationOffset, cfg) >= targetRir - cfg.rirTolerance;
  const allTop = last.every((s) => s.reps >= top);

  if (allTop && effortOk && params.allowIncrease) {
    const next = stepUp(load, eq);
    const withinCap = next <= load * (1 + cfg.maxLoadIncrease) + 1e-9; // PROG-2 HEURISTIC cap
    if (next > load && (withinCap || last.every((s) => s.reps >= top + OVERFLOW_REPS))) {
      return {
        weightKg: next,
        targetReps: bottom,
        rationale: [
          { rule: "PROG-1", vars: { reps: last[0].reps, rpe: last[0].rpe ?? "–", load: next } },
        ],
      };
    }
    // The smallest step is too big a jump: keep the load and build reps past the top.
    return {
      weightKg: load,
      targetReps: Math.min(last[0].reps + 1, top + OVERFLOW_REPS),
      rationale: [{ rule: "PROG-2", vars: { load, step: Math.round((next - load) * 100) / 100 } }],
    };
  }

  const shortOf = (sets: SetLog[]) =>
    sets.length > 0 &&
    sets.some((s) => s.reps < bottom) &&
    meanRir(sets, targetRir, params.calibrationOffset, cfg) <= targetRir + cfg.rirTolerance;
  const previous = working(params.previousSets ?? []);
  if (shortOf(last) && shortOf(previous) && previous[0]?.weight_kg === load) {
    const reduced = roundToEquipment(load * cfg.loadReduceFactor, eq);
    return {
      weightKg: reduced,
      targetReps: bottom,
      rationale: [{ rule: "PROG-1-REDUCE", vars: { load: reduced } }],
    };
  }

  const reps = Math.min(top, Math.max(bottom, last[0].reps + 1));
  return {
    weightKg: load,
    targetReps: reps,
    rationale: [{ rule: "PROG-1-HOLD", vars: { load, reps } }],
  };
}

export interface InSessionAdjustment {
  /** Load for the remaining sets of this exercise. */
  nextWeightKg: number;
  /** EFF-2: drop one planned set after an all-out set on a heavy compound. */
  dropSet: boolean;
  bumped: boolean;
  /** Updated e1RM estimate for the rest of this session. */
  e1rm: number;
  rationale: RationaleEntry[];
}

/** After each logged working set (ALGORITHMS §9). */
export function adjustAfterSet(params: {
  weightKg: number;
  reps: number;
  rpe: number | null;
  targetReps: number;
  repRange: [number, number];
  targetRir: number;
  e1rm: number | null;
  equipment: LoadRange;
  alreadyBumped: boolean;
  heavyCompound: boolean;
  setsRemaining: number;
  calibrationOffset: number;
  cfg: Config;
}): InSessionAdjustment {
  const { cfg, equipment: eq } = params;
  const keep = (rationale: RationaleEntry[] = []): InSessionAdjustment => ({
    nextWeightKg: params.weightKg,
    dropSet: false,
    bumped: false,
    e1rm: params.e1rm ?? epley(params.weightKg, params.reps),
    rationale,
  });
  if (params.rpe === null) return keep();

  const observedRir = adjustedRir(params.rpe, params.reps, params.calibrationOffset, cfg);
  const delta = params.targetRir - observedRir; // positive = harder than planned
  const observedE1 = epley(params.weightKg, params.reps + observedRir);
  const expectedE1 = params.e1rm ?? observedE1;
  const result = keep();
  result.e1rm = observedE1;

  if (delta >= cfg.inSessionDelta || observedE1 < expectedE1 * (1 - cfg.inSessionE1rmDrop)) {
    const lower = roundToEquipment(targetLoad(observedE1, params.targetReps, params.targetRir), eq);
    if (lower < params.weightKg) {
      result.nextWeightKg = lower;
      result.rationale.push({
        rule: "PROG-1-INSESSION-DOWN",
        vars: { load: lower, rpe: params.rpe },
      });
    }
  } else if (
    delta <= -cfg.inSessionDelta &&
    params.reps >= params.repRange[1] &&
    !params.alreadyBumped
  ) {
    const higher = stepUp(params.weightKg, eq);
    if (higher > params.weightKg) {
      result.nextWeightKg = higher;
      result.bumped = true;
      result.rationale.push({
        rule: "PROG-1-INSESSION-UP",
        vars: { load: higher, rpe: params.rpe },
      });
    }
  }
  // EFF-2: an all-out set on a heavy compound costs recovery; trim the remaining work.
  if (observedRir <= 0 && params.heavyCompound && params.setsRemaining > 0) {
    result.dropSet = true;
    result.rationale.push({ rule: "EFF-2", vars: {} });
  }
  return result;
}
