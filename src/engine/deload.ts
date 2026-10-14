import { MUSCLES, type Muscle } from "@/data/schema";
import type { Config } from "./config";
import type { E1rmPoint } from "./e1rm";
import type { RationaleEntry } from "./types";

/** Plateaus, reactive deloads and mesocycle auto-tuning (ALGORITHMS §11; DELOAD-1, DELOAD-2). */

const WEEK_MS = 7 * 24 * 3600_000;

/** Least-squares slope of e1RM over time (kg per ms). */
export function slope(points: readonly { ts: number; e1rm: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((s, p) => s + p.ts, 0) / n;
  const my = points.reduce((s, p) => s + p.e1rm, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.ts - mx) * (p.e1rm - my);
    den += (p.ts - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Flat or falling e1RM over the last N exposures, spanning at least M weeks. HEURISTIC. */
export function isPlateau(history: readonly E1rmPoint[], cfg: Config): boolean {
  const recent = history.slice(-cfg.plateauExposures);
  if (recent.length < cfg.plateauExposures) return false;
  const span = recent.at(-1)!.ts - recent[0].ts;
  return span >= cfg.plateauMinWeeks * WEEK_MS && slope(recent) <= 0;
}

export interface DeloadCheck {
  /** Reactive trigger: suggest a deload week now (DELOAD-2). */
  trigger: boolean;
  /** Calendar reminder only; never schedules a deload on its own (DELOAD-1). */
  reminder: boolean;
  rationale: RationaleEntry[];
}

export function checkDeload(params: {
  plateauedAnchors: number;
  /** Readiness scores of the last 7 check-ins, most recent last. */
  recentReadiness: readonly number[];
  weeksSinceDeload: number | null;
  userRequested?: boolean;
  cfg: Config;
}): DeloadCheck {
  const { cfg } = params;
  const rationale: RationaleEntry[] = [];
  const lowDays = params.recentReadiness.slice(-7).filter((s) => s < cfg.readinessLow).length;
  if (params.plateauedAnchors >= cfg.plateauAnchors) {
    rationale.push({ rule: "DELOAD-1-PLATEAU", vars: { count: params.plateauedAnchors } });
  }
  if (lowDays >= cfg.lowReadinessDays)
    rationale.push({ rule: "DELOAD-1-READINESS", vars: { days: lowDays } });
  if (params.userRequested) rationale.push({ rule: "DELOAD-1-REQUEST", vars: {} });
  const trigger = rationale.length > 0;
  const reminder =
    !trigger &&
    params.weeksSinceDeload !== null &&
    params.weeksSinceDeload >= cfg.deloadReminderWeeks;
  if (reminder)
    rationale.push({ rule: "DELOAD-1-REMINDER", vars: { weeks: params.weeksSinceDeload ?? 0 } });
  return { trigger, reminder, rationale };
}

/** Deload week shape (DELOAD-2): fewer sets, more reserve, same exercises and loads. */
export function deloadModifiers(cfg: Config) {
  return { volumeMod: cfg.deloadVolume, minRir: cfg.deloadMinRir };
}

/** After a mesocycle, nudge each muscle's weekly target (HEURISTIC). */
export function tuneVolume(params: {
  current: Partial<Record<Muscle, number>>;
  improved: Partial<Record<Muscle, boolean>>;
  avgReadiness: number;
  cfg: Config;
}): Partial<Record<Muscle, number>> {
  const { cfg } = params;
  const next: Partial<Record<Muscle, number>> = {};
  for (const m of MUSCLES) {
    let adjust = params.current[m] ?? 1;
    const improved = params.improved[m];
    if (improved === true && params.avgReadiness >= cfg.tuneReadinessUp) {
      adjust = Math.min(cfg.tuneMax, adjust * cfg.tuneUp);
    } else if (improved === false && params.avgReadiness < cfg.tuneReadinessDown) {
      adjust = Math.max(cfg.tuneMin, adjust * cfg.tuneDown);
    }
    next[m] = Math.round(adjust * 1000) / 1000;
  }
  return next;
}
