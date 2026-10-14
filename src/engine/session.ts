import { MUSCLES } from "@/data/schema";
import type { Candidate } from "./availability";
import { selectExercises, type Selection } from "./builder";
import type { Config } from "./config";
import type { MuscleMap } from "./fatigue";
import type { PlannedExercise, SessionPlan } from "./plan";
import { add, scale } from "./vector";
import type { Exercise, SetLog, Vector } from "./types";

/**
 * A session in progress (ALGORITHMS §9, §12). Stored as JSON on the session
 * row so it syncs; set logs live in their own table.
 */

export type LiveStatus = "pending" | "done" | "skipped" | "swapped_out";

export interface LiveExercise extends PlannedExercise {
  status: LiveStatus;
  /** Load for the next working set (in-session adjustments change it). */
  currentWeightKg: number | null;
  /** Working sets planned now (EFF-2 can drop one). */
  setsTarget: number;
  bumped: boolean;
  /** Best e1RM seen this session, for in-session adjustments. */
  sessionE1rm: number | null;
  /** Calibration: the user's predicted RIR for the AMRAP set. */
  predictedRir?: number | null;
  /** Set when this exercise replaced another via a swap. */
  replaces?: string;
}

export interface LiveSession {
  version: 1;
  meta: Omit<SessionPlan, "exercises">;
  exercises: LiveExercise[];
  startedAt: number | null;
  finishedAt: number | null;
  /** Volume skipped without replacing, owed to later sessions this week (§12). */
  carry: Vector;
}

export function toLive(plan: SessionPlan): LiveSession {
  const { exercises, ...meta } = plan;
  return {
    version: 1,
    meta,
    exercises: exercises.map(liveFromPlanned),
    startedAt: null,
    finishedAt: null,
    carry: {},
  };
}

export function liveFromPlanned(p: PlannedExercise): LiveExercise {
  return {
    ...p,
    status: "pending",
    currentWeightKg: p.weightKg,
    setsTarget: p.sets,
    bumped: false,
    sessionE1rm: null,
  };
}

const working = (logs: readonly SetLog[], ex: LiveExercise) =>
  logs.filter((l) => l.exercise_id === ex.exerciseId && !l.is_warmup && l.deleted_at === null);

export function setsDone(ex: LiveExercise, logs: readonly SetLog[]): number {
  return working(logs, ex).length;
}

export function setsRemaining(ex: LiveExercise, logs: readonly SetLog[]): number {
  if (ex.status === "skipped" || ex.status === "swapped_out") return 0;
  return Math.max(0, ex.setsTarget - setsDone(ex, logs));
}

/** Volume done so far plus volume still planned (fractional, VOL-2). */
export function sessionVolume(
  live: LiveSession,
  catalog: ReadonlyMap<string, Exercise>,
  logs: readonly SetLog[],
): { done: Vector; planned: Vector } {
  let done: Vector = {};
  let planned: Vector = {};
  for (const ex of live.exercises) {
    const exercise = catalog.get(ex.exerciseId);
    if (!exercise) continue;
    done = add(done, scale(exercise.vector, setsDone(ex, logs)));
    planned = add(planned, scale(exercise.vector, setsRemaining(ex, logs)));
  }
  return { done, planned };
}

/** Skip without replacing: the remaining volume is owed to later sessions this week. */
export function skipExercise(
  live: LiveSession,
  exerciseId: string,
  catalog: ReadonlyMap<string, Exercise>,
  logs: readonly SetLog[],
): LiveSession {
  const target = live.exercises.find((e) => e.exerciseId === exerciseId && e.status === "pending");
  const exercise = catalog.get(exerciseId);
  if (!target || !exercise) return live;
  const owed = scale(exercise.vector, setsRemaining(target, logs));
  return {
    ...live,
    carry: add(live.carry, owed),
    exercises: live.exercises.map((e) => (e === target ? { ...e, status: "skipped" } : e)),
  };
}

/** Replace an exercise with the accepted swap option's exercises, right after it. */
export function applySwap(
  live: LiveSession,
  removedId: string,
  replacements: LiveExercise[],
): LiveSession {
  const index = live.exercises.findIndex(
    (e) => e.exerciseId === removedId && e.status === "pending",
  );
  if (index === -1) return live;
  const exercises = [...live.exercises];
  exercises[index] = { ...exercises[index], status: "swapped_out" };
  exercises.splice(index + 1, 0, ...replacements.map((r) => ({ ...r, replaces: removedId })));
  return { ...live, exercises };
}

/**
 * After skips/swaps, top up muscles that are now under-dosed for today by
 * more than one set (PROMPT.md: "rebalance remaining exercises"). Uses the
 * same greedy builder on what's left of the budget.
 */
export function rebalance(params: {
  live: LiveSession;
  catalog: ReadonlyMap<string, Exercise>;
  logs: readonly SetLog[];
  candidates: readonly Candidate[];
  recovery: MuscleMap;
  favourites: ReadonlySet<string>;
  /** Sets removed by the skip/swap that triggered this, i.e. the budget to refill. */
  freedSets: number;
  cfg: Config;
}): Selection[] {
  const { live, cfg } = params;
  const { done, planned } = sessionVolume(live, params.catalog, params.logs);
  const covered = add(done, planned);
  const needs = {} as MuscleMap;
  let underDosed = false;
  for (const m of MUSCLES) {
    const gap = Math.max(0, (live.meta.needs[m] ?? 0) - (covered[m] ?? 0));
    needs[m] = gap > 1 ? gap : 0;
    if (gap > 1) underDosed = true;
  }
  if (!underDosed || params.freedSets < cfg.minSetsPerExercise) return [];
  const used = new Set(live.exercises.map((e) => e.exerciseId));
  const caps = {} as MuscleMap;
  for (const m of MUSCLES)
    caps[m] = Math.max(0, (live.meta.caps[m] ?? cfg.sessionCapPerMuscle) - (covered[m] ?? 0));
  return selectExercises({
    candidates: params.candidates.filter((c) => !used.has(c.exercise.id)),
    needs,
    caps,
    recovery: params.recovery,
    setBudget: params.freedSets,
    favourites: params.favourites,
    anchors: new Set(),
    lastSessionExerciseIds: new Set(),
    cfg,
  });
}

/** 2-hour time-of-day bucket (0–11) used for busy-machine detection (§12). */
export function timeBucket(ts: number): number {
  return Math.floor(new Date(ts).getHours() / 2);
}

/**
 * ≥3 "busy" swaps of the same machine in the same weekday + 2 h bucket within
 * 4 weeks → suggest deprioritising it then (ALGORITHMS §12). HEURISTIC.
 */
export function busyPattern(
  swaps: ReadonlyArray<{
    removed_equipment_id: string | null;
    reason: string;
    weekday: number;
    time_bucket: number;
    created_at: number;
  }>,
  equipmentId: string,
  now: number,
  cfg: Config,
): { weekday: number; bucket: number } | null {
  const since = now - cfg.busyWindowDays * 24 * 3600_000;
  const weekday = new Date(now).getDay();
  const bucket = timeBucket(now);
  const count = swaps.filter(
    (s) =>
      s.reason === "busy" &&
      s.removed_equipment_id === equipmentId &&
      s.weekday === weekday &&
      s.time_bucket === bucket &&
      s.created_at >= since,
  ).length;
  return count >= cfg.busySwaps ? { weekday, bucket } : null;
}
