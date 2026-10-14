import type { Config } from "./config";
import type { SetLog } from "./types";

/**
 * Estimated one-rep max (ALGORITHMS §1, PROG-3). Tracked per exercise per
 * equipment and never transferred across exercises.
 */

/** Reps in reserve from RPE (EFF-3: RPE 10 = 0 RIR), plus the user's calibration offset. */
export function adjustedRir(
  rpe: number,
  reps: number,
  calibrationOffset: number,
  cfg: Config,
): number {
  // EFF-3: calibration only applies where RPE is reasonably accurate (≤12 reps).
  const offset = reps <= cfg.calibrationMaxReps ? calibrationOffset : 0;
  return Math.max(0, 10 - rpe + offset);
}

/** Epley e1RM for one set, or null if the set can't support an estimate (PROG-3). */
export function setE1rm(
  set: Pick<SetLog, "weight_kg" | "reps" | "rpe" | "is_warmup">,
  calibrationOffset: number,
  cfg: Config,
): number | null {
  if (set.is_warmup || set.rpe === null || set.reps < 1) return null;
  // PROG-3: accuracy degrades above ~10 reps; EFF-3: RPE below 6 is too far from failure to trust.
  if (set.reps > cfg.e1rmMaxReps || set.rpe < cfg.e1rmMinRpe) return null;
  if (set.weight_kg <= 0) return null;
  const repsToFailure = set.reps + adjustedRir(set.rpe, set.reps, calibrationOffset, cfg);
  return epley(set.weight_kg, repsToFailure);
}

export function epley(weightKg: number, repsToFailure: number): number {
  return weightKg * (1 + repsToFailure / 30);
}

/** One smoothing step with the outlier guard (ALGORITHMS §1). HEURISTIC α and caps. */
export function smoothE1rm(previous: number | null, sessionBest: number, cfg: Config): number {
  if (previous === null || previous <= 0) return sessionBest;
  if (sessionBest > previous * (1 + cfg.e1rmOutlierJump)) {
    return previous * (1 + cfg.e1rmOutlierAccept); // HEURISTIC: accept only part of a sudden jump
  }
  return (1 - cfg.e1rmAlpha) * previous + cfg.e1rmAlpha * sessionBest;
}

export interface E1rmPoint {
  ts: number;
  sessionBest: number;
  e1rm: number;
}

const sessionKey = (s: SetLog) => s.session_id ?? new Date(s.ts).toISOString().slice(0, 10);

/**
 * Rolling, outlier-robust e1RM history for one exercise on one machine: each
 * session's input is the best of the last N session bests, then smoothed.
 * Returns one point per session that had a usable set (oldest first).
 */
export function e1rmHistory(sets: SetLog[], calibrationOffset: number, cfg: Config): E1rmPoint[] {
  const sessions = new Map<string, { ts: number; best: number }>();
  for (const set of [...sets].sort((a, b) => a.ts - b.ts)) {
    const value = setE1rm(set, calibrationOffset, cfg);
    if (value === null) continue;
    const key = sessionKey(set);
    const current = sessions.get(key);
    if (!current) sessions.set(key, { ts: set.ts, best: value });
    else current.best = Math.max(current.best, value);
  }
  const bests = [...sessions.values()].sort((a, b) => a.ts - b.ts);
  const points: E1rmPoint[] = [];
  let e1rm: number | null = null;
  bests.forEach((session, i) => {
    const window = bests.slice(Math.max(0, i - cfg.e1rmSessionWindow + 1), i + 1);
    const input = Math.max(...window.map((s) => s.best));
    e1rm = smoothE1rm(e1rm, input, cfg);
    points.push({ ts: session.ts, sessionBest: session.best, e1rm });
  });
  return points;
}

export function currentE1rm(sets: SetLog[], calibrationOffset: number, cfg: Config): number | null {
  return e1rmHistory(sets, calibrationOffset, cfg).at(-1)?.e1rm ?? null;
}
