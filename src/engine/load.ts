import type { Config } from "./config";
import type { Equipment } from "./types";

/** Load prescription and machine-specific rounding (ALGORITHMS §2, PROG-2, PROG-3). */

/**
 * What a machine can be set to: a linear range (min + k·increment, plus micro-plates),
 * or, when `weights_kg` is set, exactly those weights (e.g. a dumbbell rack).
 * `weights_kg` is optional so rows stored before it existed read as "no list".
 */
export type LoadRange = Pick<
  Equipment,
  "min_kg" | "max_kg" | "increment_kg" | "micro_increment_kg"
> & {
  weights_kg?: readonly number[] | null;
};

const EPS = 1e-9;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Load for a rep target at a given RIR: inverse Epley. */
export function targetLoad(e1rm: number, targetReps: number, targetRir: number): number {
  return e1rm / (1 + (targetReps + targetRir) / 30);
}

/** The exact weight list, if the equipment has one (ascending, positive). */
function weightList(eq: LoadRange): number[] | null {
  const list = eq.weights_kg?.filter((w) => Number.isFinite(w) && w > 0);
  return list && list.length > 0 ? [...new Set(list)].sort((a, b) => a - b) : null;
}

/** Lightest settable load: the first listed weight, else the range minimum. */
export function minLoad(eq: LoadRange): number {
  return weightList(eq)?.[0] ?? eq.min_kg;
}

/**
 * Every load the machine can be set to, ascending (ALGORITHMS §2): the exact
 * weight list when set, else stack/plate steps plus micro-plates.
 */
export function availableLoads(eq: LoadRange): number[] {
  const list = weightList(eq);
  if (list) return list;
  const loads = new Set<number>();
  const micro =
    eq.micro_increment_kg && eq.micro_increment_kg < eq.increment_kg ? eq.micro_increment_kg : null;
  for (let base = eq.min_kg; base <= eq.max_kg + EPS; base += eq.increment_kg) {
    loads.add(round2(base));
    if (micro) {
      for (
        let extra = micro;
        extra < eq.increment_kg - EPS && base + extra <= eq.max_kg + EPS;
        extra += micro
      ) {
        loads.add(round2(base + extra));
      }
    }
    if (loads.size > 5000) break; // guard against absurd ranges
  }
  return [...loads].sort((a, b) => a - b);
}

/**
 * Round DOWN to the nearest available load, clamped to the machine's range or
 * to the smallest listed weight (ALGORITHMS §2).
 */
export function roundToEquipment(load: number, eq: LoadRange): number {
  const loads = availableLoads(eq);
  let best = loads[0] ?? minLoad(eq);
  for (const l of loads) {
    if (l <= load + EPS) best = l;
    else break;
  }
  return best;
}

/**
 * Next load up (one equipment step, ALGORITHMS §9, PROG-1): the next listed weight when
 * the equipment has a list, or the same load at the machine's max.
 */
export function stepUp(load: number, eq: LoadRange): number {
  const loads = availableLoads(eq);
  return loads.find((l) => l > load + EPS) ?? loads.at(-1) ?? load;
}

export function stepDown(load: number, eq: LoadRange): number {
  const loads = availableLoads(eq);
  return [...loads].reverse().find((l) => l < load - EPS) ?? loads[0] ?? load;
}

export interface Prescription {
  weightKg: number;
  targetReps: number;
  /** Exact load the target implied before rounding. */
  idealKg: number;
}

/**
 * Prescribe a machine-settable load. If rounding down falls more than the
 * shortfall threshold below the ideal, keep the lighter load and ask for one
 * more rep instead of exceeding the target RPE. HEURISTIC threshold.
 */
export function prescribe(
  e1rm: number,
  targetReps: number,
  targetRir: number,
  eq: LoadRange,
  cfg: Config,
): Prescription {
  const idealKg = targetLoad(e1rm, targetReps, targetRir);
  const weightKg = roundToEquipment(idealKg, eq);
  const shortfall = idealKg > 0 ? (idealKg - weightKg) / idealKg : 0;
  return {
    weightKg,
    targetReps: shortfall > cfg.roundingShortfall ? targetReps + 1 : targetReps,
    idealKg,
  };
}
