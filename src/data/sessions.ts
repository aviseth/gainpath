import { MUSCLES, type Muscle } from "@/data/schema";
import { ANCHOR_REGIONS } from "@/engine/anchors";
import { BODYWEIGHT_EQUIPMENT_ID, type Candidate } from "@/engine/availability";
import { calibrationError, updateCalibration } from "@/engine/calibration";
import { tuneVolume } from "@/engine/deload";
import { currentE1rm, e1rmHistory } from "@/engine/e1rm";
import { buildSessionPlan, planExercise } from "@/engine/plan";
import { adjustAfterSet, type InSessionAdjustment } from "@/engine/progression";
import { computeReadiness } from "@/engine/readiness";
import {
  applySwap,
  liveFromPlanned,
  rebalance,
  setsDone,
  setsRemaining,
  skipExercise,
  timeBucket,
  toLive,
  type LiveExercise,
  type LiveSession,
} from "@/engine/session";
import type { SwapOption } from "@/engine/swap";
import type { RationaleEntry } from "@/engine/types";
import { localDate } from "./actions";
import type { LiftwiseDB } from "./db";
import { repo } from "./repo";
import type { RecordOf } from "./schema";
import {
  loadTrainingContext,
  META_DELOAD_LAST,
  META_DELOAD_UNTIL,
  planInputFrom,
  readLive,
  saveAnchors,
  type TrainingContext,
} from "./training";

/** Session lifecycle on top of the engine: generate → start → log → swap/skip → finish. */

const DAY = 24 * 3600_000;
export type SessionRow = RecordOf<"sessions">;

export async function todaysSession(
  db: LiftwiseDB,
  date = localDate(),
): Promise<SessionRow | undefined> {
  const rows = (await db.sessions.where("date").equals(date).toArray()).filter(
    (s) => s.deleted_at === null && s.status !== "skipped",
  );
  return rows.sort((a, b) => b.updated_at - a.updated_at)[0];
}

/** Build today's session from the current context and store it (replacing an unstarted plan). */
export async function generateSession(
  db: LiftwiseDB,
  now = Date.now(),
): Promise<SessionRow | null> {
  await maybeTuneMesocycle(db, now);
  const ctx = await loadTrainingContext(db, now);
  if (!ctx) return null;
  const plan = buildSessionPlan(planInputFrom(ctx));
  await saveAnchors(db, plan.anchors);
  const live = toLive(plan);
  const existing = await todaysSession(db, ctx.date);
  const sessions = repo("sessions", db);
  const fields = {
    gym_id: ctx.gym.id,
    date: ctx.date,
    status: "planned" as const,
    readiness_score: ctx.readiness.score,
    is_deload: plan.isDeload,
    is_calibration: plan.exercises.some((e) => e.calibration),
    plan: live,
    rationale: plan.rationale,
  };
  if (existing && existing.status === "planned") return sessions.update(existing.id, fields);
  if (existing) return existing;
  return sessions.create(fields);
}

async function saveLive(
  db: LiftwiseDB,
  session: SessionRow,
  live: LiveSession,
  extra: Partial<SessionRow> = {},
) {
  return repo("sessions", db).update(session.id, {
    plan: live,
    is_calibration: live.exercises.some((e) => e.calibration && e.status !== "skipped"),
    ...extra,
  });
}

export async function startSession(db: LiftwiseDB, session: SessionRow): Promise<SessionRow> {
  const live = readLive(session)!;
  return saveLive(
    db,
    session,
    { ...live, startedAt: live.startedAt ?? Date.now() },
    { status: "active" },
  );
}

export async function sessionLogs(db: LiftwiseDB, sessionId: string) {
  return (await db.set_logs.where("session_id").equals(sessionId).toArray())
    .filter((s) => s.deleted_at === null)
    .sort((a, b) => a.ts - b.ts);
}

export interface LoggedSet {
  weightKg: number | null;
  reps: number;
  rpe: number | null;
  isWarmup?: boolean;
  approximate?: boolean;
  predictedRir?: number | null;
}

/**
 * Log one set and apply the in-session adjustment (ALGORITHMS §9). For an
 * AMRAP calibration set, also update the user's RIR calibration (§10).
 */
export async function logSet(
  db: LiftwiseDB,
  session: SessionRow,
  exerciseId: string,
  set: LoggedSet,
): Promise<{
  session: SessionRow;
  adjustment: InSessionAdjustment | null;
  log: RecordOf<"set_logs">;
}> {
  const live = readLive(session)!;
  const ex = live.exercises.find((e) => e.exerciseId === exerciseId && e.status === "pending");
  if (!ex) throw new Error("That exercise isn't in today's session");
  const ctx = await loadTrainingContext(db);
  if (!ctx) throw new Error("Set up your profile and gym first");
  const logs = await sessionLogs(db, session.id);
  const remainingBefore = setsRemaining(ex, logs);
  const isAmrap = !set.isWarmup && ex.calibration && remainingBefore === 1;

  const log = await repo("set_logs", db).create({
    session_id: session.id,
    exercise_id: exerciseId,
    equipment_id: ex.equipmentId,
    ts: Date.now(),
    weight_kg: set.weightKg ?? 0,
    reps: set.reps,
    rpe: set.rpe,
    rir: set.rpe === null ? null : Math.max(0, 10 - set.rpe),
    is_warmup: !!set.isWarmup,
    is_amrap: isAmrap,
    predicted_rir: isAmrap ? (set.predictedRir ?? ex.predictedRir ?? null) : null,
    approximate: !!set.approximate,
  });
  if (set.isWarmup) return { session, adjustment: null, log };

  let adjustment: InSessionAdjustment | null = null;
  const exercise = ctx.catalog.get(exerciseId);
  const equipment = ctx.equipmentById.get(ex.equipmentId) ?? null;
  let next: LiveExercise = { ...ex };
  if (
    exercise &&
    equipment &&
    set.weightKg !== null &&
    !ex.timed &&
    exercise.loading === "external"
  ) {
    adjustment = adjustAfterSet({
      weightKg: set.weightKg,
      reps: set.reps,
      rpe: set.rpe,
      targetReps: ex.targetReps,
      repRange: ex.repRange,
      targetRir: ex.targetRir,
      e1rm: ex.sessionE1rm,
      equipment,
      alreadyBumped: ex.bumped,
      heavyCompound: exercise.kind === "compound" && exercise.fatigue_cost >= 1.5,
      setsRemaining: remainingBefore - 1,
      calibrationOffset: ctx.profile.calibration_offset,
      cfg: ctx.cfg,
    });
    next = {
      ...next,
      currentWeightKg: adjustment.nextWeightKg,
      bumped: ex.bumped || adjustment.bumped,
      sessionE1rm: Math.max(ex.sessionE1rm ?? 0, adjustment.e1rm),
      setsTarget: adjustment.dropSet
        ? Math.max(setsDone(ex, logs) + 1, ex.setsTarget - 1)
        : ex.setsTarget,
      rationale: [...ex.rationale, ...adjustment.rationale],
    };
  }
  const doneAfter = setsDone(ex, logs) + 1;
  if (doneAfter >= next.setsTarget) next.status = "done";

  if (isAmrap) {
    const predicted = set.predictedRir ?? ex.predictedRir;
    if (predicted != null) {
      const error = calibrationError(ex.targetReps, predicted, set.reps);
      await repo("profiles", db).update(ctx.profile.id, {
        calibration_offset: updateCalibration(ctx.profile.calibration_offset, error, ctx.cfg),
      });
    }
  }

  await updateE1rmEstimate(db, exerciseId, ex.equipmentId, ctx.profile.calibration_offset, ctx);
  const updated = await saveLive(
    db,
    session,
    {
      ...live,
      startedAt: live.startedAt ?? Date.now(),
      exercises: live.exercises.map((e) => (e === ex ? next : e)),
    },
    session.status === "planned" ? { status: "active" } : {},
  );
  return { session: updated, adjustment, log };
}

export async function undoSet(
  db: LiftwiseDB,
  session: SessionRow,
  setId: string,
): Promise<SessionRow> {
  const log = await repo("set_logs", db).get(setId);
  await repo("set_logs", db).remove(setId);
  if (!log) return session;
  const live = readLive(session)!;
  const logs = await sessionLogs(db, session.id);
  return saveLive(db, session, {
    ...live,
    exercises: live.exercises.map((e) =>
      e.exerciseId === log.exercise_id &&
      e.status === "done" &&
      setsRemaining({ ...e, status: "pending" }, logs) > 0
        ? { ...e, status: "pending" }
        : e,
    ),
  });
}

async function updateE1rmEstimate(
  db: LiftwiseDB,
  exerciseId: string,
  equipmentId: string,
  calibrationOffset: number,
  ctx: TrainingContext,
) {
  const sets = (
    await db.set_logs
      .where("[exercise_id+equipment_id+ts]")
      .between([exerciseId, equipmentId, 0], [exerciseId, equipmentId, Infinity])
      .toArray()
  ).filter((s) => s.deleted_at === null);
  const value = currentE1rm(sets, calibrationOffset, ctx.cfg);
  if (value === null) return;
  const history = e1rmHistory(sets, calibrationOffset, ctx.cfg).slice(-20);
  const rows = (
    await db.e1rm_estimates
      .where("[exercise_id+equipment_id]")
      .equals([exerciseId, equipmentId])
      .toArray()
  ).filter((r) => r.deleted_at === null);
  const fields = {
    value_kg: Math.round(value * 10) / 10,
    uncertainty_pct: history.length < 3 ? 10 : 5,
    updated_from_set_id: sets.at(-1)?.id ?? null,
    history,
  };
  if (rows[0]) await repo("e1rm_estimates", db).update(rows[0].id, fields);
  else
    await repo("e1rm_estimates", db).create({
      exercise_id: exerciseId,
      equipment_id: equipmentId,
      ...fields,
    });
}

export async function setPredictedRir(
  db: LiftwiseDB,
  session: SessionRow,
  exerciseId: string,
  predictedRir: number,
) {
  const live = readLive(session)!;
  return saveLive(db, session, {
    ...live,
    exercises: live.exercises.map((e) =>
      e.exerciseId === exerciseId && e.status === "pending" ? { ...e, predictedRir } : e,
    ),
  });
}

export async function updateExerciseWeight(
  db: LiftwiseDB,
  session: SessionRow,
  exerciseId: string,
  weightKg: number,
) {
  const live = readLive(session)!;
  return saveLive(db, session, {
    ...live,
    exercises: live.exercises.map((e) =>
      e.exerciseId === exerciseId && e.status === "pending"
        ? { ...e, currentWeightKg: weightKg }
        : e,
    ),
  });
}

/** Turn selected swap items or rebalance picks into planned, prescribed exercises. */
function planned(ctx: TrainingContext, candidate: Candidate, sets: number): LiveExercise {
  const input = planInputFrom(ctx);
  const p = planExercise(candidate, sets, 1, false, new Set(), input, ctx.history);
  return liveFromPlanned(p);
}

export type SwapReason = "busy" | "broken" | "feel" | "dislike" | "pain";

/** Record the swap reason's side effects (PROMPT.md "Swaps"), returning what changed. */
export async function applySwapReason(
  db: LiftwiseDB,
  params: {
    reason: SwapReason;
    exerciseId: string;
    equipmentId: string;
    excludePermanently?: boolean;
    painRegion?: string;
  },
): Promise<void> {
  const date = localDate();
  const eq = params.equipmentId === BODYWEIGHT_EQUIPMENT_ID ? null : params.equipmentId;
  switch (params.reason) {
    case "busy":
    case "feel":
      // Today only.
      await repo("temp_exclusions", db).create({
        date,
        equipment_id: params.reason === "busy" ? eq : null,
        exercise_id: params.reason === "feel" ? params.exerciseId : null,
        body_region: null,
        reason: params.reason,
      });
      break;
    case "broken":
      if (eq) {
        await repo("equipment", db).update(eq, {
          status: "broken",
          broken_since: Date.now(),
          status_reason: "Reported during a session",
        });
      }
      break;
    case "dislike":
      if (params.excludePermanently) {
        await repo("exercise_prefs", db).create({
          exercise_id: params.exerciseId,
          equipment_id: null,
          kind: "exclude",
          reason: "Swapped out: don't like it",
        });
      } else {
        await repo("temp_exclusions", db).create({
          date,
          equipment_id: null,
          exercise_id: params.exerciseId,
          body_region: null,
          reason: "feel",
        });
      }
      break;
    case "pain":
      if (params.painRegion) {
        await repo("temp_exclusions", db).create({
          date,
          equipment_id: null,
          exercise_id: null,
          body_region: params.painRegion,
          reason: "pain",
        });
      }
      break;
  }
}

/** Accept a swap option (§12): replace the exercise, log the swap, rebalance if needed. */
export async function acceptSwap(
  db: LiftwiseDB,
  session: SessionRow,
  removedId: string,
  reason: SwapReason | "free_text",
  option: SwapOption,
): Promise<SessionRow> {
  const ctx = await loadTrainingContext(db);
  if (!ctx) throw new Error("No training context");
  const live = readLive(session)!;
  const removed = live.exercises.find((e) => e.exerciseId === removedId && e.status === "pending");
  if (!removed) return session;
  const replacements = option.items.map((item) => {
    const candidate = ctx.candidates.find((c) => c.exercise.id === item.exercise.id);
    if (!candidate) throw new Error(`${item.exercise.name} isn't available right now`);
    const p = planned(ctx, candidate, item.sets);
    return { ...p, rationale: [...option.rationale, ...p.rationale] };
  });
  const now = Date.now();
  await repo("swaps", db).create({
    session_id: session.id,
    removed_exercise_id: removedId,
    removed_equipment_id:
      removed.equipmentId === BODYWEIGHT_EQUIPMENT_ID ? null : removed.equipmentId,
    reason,
    accepted_option: {
      kind: option.kind,
      items: option.items.map((i) => ({
        exercise_id: i.exercise.id,
        equipment_id: i.equipment?.id ?? null,
        sets: i.sets,
      })),
      matchPct: option.matchPct,
    },
    weekday: new Date(now).getDay(),
    time_bucket: timeBucket(now),
  });
  return saveLive(db, session, applySwap(live, removedId, replacements));
}

/** Skip without replacing (§12): volume carries to later sessions; rebalance today if needed. */
export async function skip(
  db: LiftwiseDB,
  session: SessionRow,
  exerciseId: string,
  reason: SwapReason | "skip" = "skip",
): Promise<{ session: SessionRow; added: string[] }> {
  const ctx = await loadTrainingContext(db);
  if (!ctx) throw new Error("No training context");
  const live = readLive(session)!;
  const logs = await sessionLogs(db, session.id);
  const target = live.exercises.find((e) => e.exerciseId === exerciseId && e.status === "pending");
  if (!target) return { session, added: [] };
  const freed = setsRemaining(target, logs);
  let next = skipExercise(live, exerciseId, ctx.catalog, logs);
  const now = Date.now();
  await repo("swaps", db).create({
    session_id: session.id,
    removed_exercise_id: exerciseId,
    removed_equipment_id:
      target.equipmentId === BODYWEIGHT_EQUIPMENT_ID ? null : target.equipmentId,
    reason: reason === "skip" ? "skip" : reason,
    accepted_option: null,
    weekday: new Date(now).getDay(),
    time_bucket: timeBucket(now),
  });

  // Rebalance remaining exercises if a muscle is now under-dosed today.
  const picks = rebalance({
    live: next,
    catalog: ctx.catalog,
    logs,
    candidates: ctx.candidates,
    recovery: ctx.recovery,
    favourites: ctx.favourites,
    freedSets: freed,
    cfg: ctx.cfg,
  });
  const added = picks.map((p) => p.candidate.exercise.id);
  if (picks.length > 0) {
    const extra = picks.map((p) => planned(ctx, p.candidate, p.sets));
    // What we add today no longer needs to be carried to later sessions.
    let carry = { ...next.carry };
    for (const p of picks) {
      for (const m of MUSCLES) {
        const w = (p.candidate.exercise.vector[m] ?? 0) * p.sets;
        if (w && carry[m]) carry = { ...carry, [m]: Math.max(0, (carry[m] ?? 0) - w) };
      }
    }
    next = { ...next, carry, exercises: [...next.exercises, ...extra] };
  }
  return { session: await saveLive(db, session, next), added };
}

/** Pain (EVIDENCE §10 rule 6): drop every planned exercise loading that region today. */
export async function removeForPain(
  db: LiftwiseDB,
  session: SessionRow,
  region: string,
): Promise<SessionRow> {
  const ctx = await loadTrainingContext(db);
  if (!ctx) return session;
  const live = readLive(session)!;
  const logs = await sessionLogs(db, session.id);
  let next = live;
  for (const e of live.exercises) {
    const exercise = ctx.catalog.get(e.exerciseId);
    if (e.status === "pending" && exercise?.joints.includes(region as never)) {
      next = skipExercise(next, e.exerciseId, ctx.catalog, logs);
    }
  }
  const pain: RationaleEntry = { rule: "PAIN", vars: { region: region.replace("_", " ") } };
  return saveLive(db, session, {
    ...next,
    meta: { ...next.meta, rationale: [...next.meta.rationale, pain] },
  });
}

export async function addExercise(
  db: LiftwiseDB,
  session: SessionRow,
  exerciseId: string,
  sets = 3,
) {
  const ctx = await loadTrainingContext(db);
  if (!ctx) return session;
  const candidate = ctx.candidates.find((c) => c.exercise.id === exerciseId);
  if (!candidate) throw new Error("Not available at this gym right now");
  const live = readLive(session)!;
  return saveLive(db, session, {
    ...live,
    exercises: [...live.exercises, planned(ctx, candidate, sets)],
  });
}

export async function finishSession(db: LiftwiseDB, session: SessionRow): Promise<SessionRow> {
  const live = readLive(session)!;
  const logs = await sessionLogs(db, session.id);
  const ctx = await loadTrainingContext(db);
  // Unfinished work is owed to later sessions this week (§6 carry-over).
  let next = live;
  if (ctx) {
    for (const e of live.exercises) {
      if (e.status === "pending" && setsRemaining(e, logs) > 0)
        next = skipExercise(next, e.exerciseId, ctx.catalog, logs);
    }
  }
  return saveLive(db, session, { ...next, finishedAt: Date.now() }, { status: "done" });
}

/** Accept a suggested deload week (DELOAD-2: lighter, not a week off). */
export async function startDeloadWeek(db: LiftwiseDB, now = Date.now()): Promise<void> {
  await db.meta.put({ key: META_DELOAD_UNTIL, value: now + 7 * DAY });
  await db.meta.put({ key: META_DELOAD_LAST, value: now });
}

export async function endDeloadWeek(db: LiftwiseDB): Promise<void> {
  await db.meta.delete(META_DELOAD_UNTIL);
}

/** Mesocycle auto-tuning (§11): every N weeks, nudge each muscle's weekly target. */
export async function maybeTuneMesocycle(db: LiftwiseDB, now = Date.now()): Promise<void> {
  const ctx = await loadTrainingContext(db, now);
  if (!ctx) return;
  const mesos = repo("mesocycles", db);
  const current = (await mesos.list()).find((m) => m.end === null);
  if (!current) {
    await mesos.create({ start: now, end: null, user_adjust: {} });
    return;
  }
  if (now - current.start < ctx.cfg.mesocycleWeeks * 7 * DAY) return;

  const improved: Partial<Record<Muscle, boolean>> = {};
  for (const anchor of ctx.anchors) {
    const history = e1rmHistory(
      ctx.history.filter(
        (s) =>
          s.exercise_id === anchor.exerciseId &&
          s.equipment_id === (anchor.equipmentId ?? BODYWEIGHT_EQUIPMENT_ID) &&
          s.ts >= current.start,
      ),
      ctx.profile.calibration_offset,
      ctx.cfg,
    );
    if (history.length < 2) continue;
    const up = history.at(-1)!.e1rm > history[0].e1rm;
    for (const m of ANCHOR_REGIONS[anchor.region]) improved[m] = up;
  }
  const checkins = (await repo("checkins", db).list()).filter(
    (c) => new Date(`${c.date}T12:00:00`).getTime() >= current.start,
  );
  const avgReadiness =
    checkins.length === 0
      ? 70
      : checkins.reduce(
          (s, c) =>
            s +
            computeReadiness(
              { sleepQuality: c.sleep_quality, energy: c.energy, sleepHours: c.sleep_hours },
              ctx.cfg,
            ).score,
          0,
        ) / checkins.length;
  const next = tuneVolume({
    current: current.user_adjust as Partial<Record<Muscle, number>>,
    improved,
    avgReadiness,
    cfg: ctx.cfg,
  });
  await mesos.update(current.id, { end: now });
  await mesos.create({ start: now, end: null, user_adjust: next });
}

export { readLive };
