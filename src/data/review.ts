import { MUSCLES } from "@/data/schema";
import { e1rmSeries, mondayOf, weeklyVolume } from "@/engine/progress";
import { computeReadiness } from "@/engine/readiness";
import { weeklyTargets } from "@/engine/volume";
import type { LiftwiseDB } from "./db";
import type { TrainingContext } from "./training";

/**
 * The engine-computed summary the weekly review narrates (ALGORITHMS §18).
 * Every number the AI may quote is in here; it computes none of its own.
 */

const DAY = 24 * 3600_000;
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
export const isoDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The last fully completed calendar week (Monday start). */
export function lastWeekStart(now: number): number {
  return mondayOf(mondayOf(now) - DAY);
}

export async function buildWeeklySummary(db: LiftwiseDB, ctx: TrainingContext, start: number) {
  const end = start + 7 * DAY;
  const sets = (await db.set_logs.toArray()).filter((s) => s.deleted_at === null && s.ts < end);
  const week = weeklyVolume(sets, ctx.catalog, end - 1, 1)[0];
  const targets = weeklyTargets(ctx.profile.goal, ctx.profile.experience, ctx.userAdjust, ctx.cfg);

  const strength = e1rmSeries(sets, ctx.profile.calibration_offset, ctx.cfg)
    .map((s) => {
      const before = s.points.filter((p) => p.ts < start).at(-1)?.e1rm ?? null;
      const during = s.points.filter((p) => p.ts >= start && p.ts < end).at(-1)?.e1rm ?? null;
      return { s, before, during };
    })
    .filter((x) => x.during !== null)
    .map(({ s, before, during }) => ({
      exercise: ctx.catalog.get(s.exerciseId)?.name ?? s.exerciseId,
      equipment: ctx.equipmentById.get(s.equipmentId)?.name ?? null,
      e1rm_kg: round(during!),
      change_vs_before_pct: before ? round((during! / before - 1) * 100) : null,
    }));

  const checkins = (await db.checkins.toArray())
    .filter((c) => c.deleted_at === null && c.date >= isoDate(start) && c.date < isoDate(end))
    .map(
      (c) =>
        computeReadiness(
          { sleepQuality: c.sleep_quality, energy: c.energy, sleepHours: c.sleep_hours },
          ctx.cfg,
        ).score,
    );
  const sessions = (await db.sessions.toArray()).filter(
    (s) => s.deleted_at === null && s.date >= isoDate(start) && s.date < isoDate(end),
  );

  return {
    week_start: isoDate(start),
    goal: ctx.profile.goal,
    experience: ctx.profile.experience,
    sessions: {
      planned_per_week: ctx.profile.sessions_per_week,
      completed: sessions.filter((s) => s.status === "done").length,
      skipped: sessions.filter((s) => s.status === "skipped").length,
    },
    volume_sets_vs_target: MUSCLES.map((m) => ({
      muscle: m,
      sets: round(week.perMuscle[m]),
      target: round(targets[m]),
    })),
    total_working_sets: week.total,
    strength,
    readiness: checkins.length
      ? {
          checkins: checkins.length,
          average_score: round(checkins.reduce((a, b) => a + b, 0) / checkins.length, 2),
        }
      : null,
    deload: {
      active: ctx.deload.active,
      suggested: ctx.deload.check.trigger,
      reminder: ctx.deload.check.reminder,
    },
  };
}
