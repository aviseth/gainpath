import { MUSCLES, type Muscle } from "@/data/schema";
import { BODYWEIGHT_EQUIPMENT_ID } from "./availability";
import type { Config } from "./config";
import { e1rmHistory } from "./e1rm";
import type { MuscleMap } from "./fatigue";
import type { Exercise, SetLog } from "./types";

/**
 * Data for the Progress screen (PROMPT "Progress"). Pure functions over set
 * logs: e1RM per exercise × equipment (PROMPT: a chest press on one brand ≠
 * another), fractional weekly volume per muscle (VOL-2) and weekly totals.
 */

const DAY = 24 * 3600_000;

export interface E1rmSeries {
  key: string;
  exerciseId: string;
  equipmentId: string;
  points: Array<{ ts: number; e1rm: number; best: number }>;
  latest: number;
  /** Change over the series, as a fraction of the first point. */
  change: number;
  lastTs: number;
}

export function e1rmSeries(
  sets: readonly SetLog[],
  calibrationOffset: number,
  cfg: Config,
): E1rmSeries[] {
  const groups = new Map<string, SetLog[]>();
  for (const set of sets) {
    if (set.is_warmup || set.weight_kg <= 0) continue;
    const key = `${set.exercise_id}|${set.equipment_id}`;
    groups.set(key, [...(groups.get(key) ?? []), set]);
  }
  const out: E1rmSeries[] = [];
  for (const [key, group] of groups) {
    const history = e1rmHistory(group, calibrationOffset, cfg);
    if (history.length === 0) continue;
    const first = history[0].e1rm;
    const latest = history.at(-1)!.e1rm;
    const [exerciseId, equipmentId] = key.split("|");
    out.push({
      key,
      exerciseId,
      equipmentId,
      points: history.map((p) => ({ ts: p.ts, e1rm: p.e1rm, best: p.sessionBest })),
      latest,
      change: first > 0 ? latest / first - 1 : 0,
      lastTs: history.at(-1)!.ts,
    });
  }
  return out.sort((a, b) => b.lastTs - a.lastTs);
}

/** Local Monday 00:00 of the week containing ts. */
export function mondayOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export interface WeekVolume {
  weekStart: number;
  perMuscle: MuscleMap;
  total: number;
  sessions: number;
}

/** Fractional working sets per muscle per calendar week, oldest first, including empty weeks. */
export function weeklyVolume(
  sets: readonly SetLog[],
  exercises: ReadonlyMap<string, Exercise>,
  now: number,
  weeks: number,
): WeekVolume[] {
  const current = mondayOf(now);
  const starts: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) starts.push(mondayOf(current - i * 7 * DAY + DAY));
  const byWeek = new Map(
    starts.map((s) => [
      s,
      {
        weekStart: s,
        perMuscle: Object.fromEntries(MUSCLES.map((m) => [m, 0])) as MuscleMap,
        total: 0,
        sessions: new Set<string>(),
      },
    ]),
  );
  for (const set of sets) {
    if (set.is_warmup || set.ts > now) continue;
    const week = byWeek.get(mondayOf(set.ts));
    const exercise = exercises.get(set.exercise_id);
    if (!week || !exercise) continue;
    for (const [m, w] of Object.entries(exercise.vector) as Array<[Muscle, number]>)
      week.perMuscle[m] += w;
    week.total += 1;
    week.sessions.add(set.session_id ?? new Date(set.ts).toDateString());
  }
  return [...byWeek.values()].map((w) => ({ ...w, sessions: w.sessions.size }));
}

export const isBodyweight = (equipmentId: string) => equipmentId === BODYWEIGHT_EQUIPMENT_ID;
