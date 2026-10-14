import type { Config } from "./config";
import type { RationaleEntry } from "./types";

/**
 * Readiness score (ALGORITHMS §4). Every weight is HEURISTIC. Inputs are
 * optional and drop out when missing; the manual check-in alone is enough
 * (READY-3). Wearable data is a soft modifier against the user's own baseline
 * only, and never overrides in-session RPE (READY-2).
 */

export interface ReadinessInput {
  sleepQuality?: number | null; // 1–5
  energy?: number | null; // 1–5
  sleepHours?: number | null;
  /** Today's HRV and the previous days' values within the baseline window. */
  hrv?: { today: number | null; baseline: number[] };
  restingHr?: { today: number | null; baseline: number[] };
}

export type ReadinessBand = "normal" | "reduced" | "low";

export interface Readiness {
  score: number;
  band: ReadinessBand;
  volumeMod: number;
  rirAdd: number;
  allowLoadIncrease: boolean;
  rationale: RationaleEntry[];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** z-score against a baseline, or null without enough history or variance. */
export function zScore(today: number | null, baseline: number[], minDays: number): number | null {
  if (today === null || baseline.length < minDays) return null;
  const mean = baseline.reduce((s, x) => s + x, 0) / baseline.length;
  const variance = baseline.reduce((s, x) => s + (x - mean) ** 2, 0) / (baseline.length - 1 || 1);
  const sd = Math.sqrt(variance);
  return sd > 0 ? (today - mean) / sd : null;
}

export function computeReadiness(input: ReadinessInput, cfg: Config): Readiness {
  const rationale: RationaleEntry[] = [];
  let score = cfg.readinessBase;
  if (input.sleepQuality != null)
    score += (input.sleepQuality - 3) * cfg.readinessSleepQualityWeight;
  if (input.energy != null) score += (input.energy - 3) * cfg.readinessEnergyWeight;

  // READY-1: acute sleep loss (≤6 h) modestly impairs performance.
  if (input.sleepHours != null && input.sleepHours <= cfg.shortSleepHours) {
    score -= cfg.shortSleepPenalty;
    rationale.push({ rule: "READY-1", vars: { hours: input.sleepHours } });
  }

  // READY-2: soft modifiers against the 14-day personal baseline.
  if (input.hrv) {
    const z = zScore(input.hrv.today, input.hrv.baseline, cfg.baselineMinDays);
    if (z !== null) {
      score += clamp(z, -cfg.zClamp, cfg.zClamp) * cfg.hrvWeight;
      if (z <= -1) rationale.push({ rule: "READY-2", vars: { z: Math.round(z * 10) / 10 } });
    }
  }
  if (input.restingHr) {
    const z = zScore(input.restingHr.today, input.restingHr.baseline, cfg.baselineMinDays);
    if (z !== null) score -= clamp(z, -cfg.zClamp, cfg.zClamp) * cfg.restingHrWeight;
  }

  score = Math.round(clamp(score, 0, 100));
  if (score >= cfg.readinessNormal) {
    return { score, band: "normal", volumeMod: 1, rirAdd: 0, allowLoadIncrease: true, rationale };
  }
  const low = score < cfg.readinessLow;
  const volumeMod = low ? cfg.lowVolumeMod : cfg.reducedVolumeMod;
  rationale.push({
    rule: "READY-3",
    vars: { score, pct: Math.round((1 - volumeMod) * 100), band: low ? "low" : "reduced" },
  });
  return {
    score,
    band: low ? "low" : "reduced",
    volumeMod,
    rirAdd: low ? cfg.lowRirAdd : cfg.reducedRirAdd,
    allowLoadIncrease: !low,
    rationale,
  };
}
