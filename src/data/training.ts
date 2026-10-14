import type { Muscle } from "@/data/schema";
import type { AnchorState, AnchorRegion } from "@/engine/anchors";
import {
  availableCandidates,
  BODYWEIGHT_EQUIPMENT_ID,
  type Candidate,
} from "@/engine/availability";
import { calibrationDue } from "@/engine/calibration";
import { resolveConfig, type Config } from "@/engine/config";
import { checkDeload, isPlateau, type DeloadCheck } from "@/engine/deload";
import { e1rmHistory } from "@/engine/e1rm";
import type { KnownE1rm } from "@/engine/estimate";
import { recoveryState, type MuscleMap } from "@/engine/fatigue";
import type { PlanInput } from "@/engine/plan";
import { computeReadiness, type Readiness } from "@/engine/readiness";
import type { LiveSession } from "@/engine/session";
import { timeBucket } from "@/engine/session";
import type { Equipment, Exercise, SetLog, Vector } from "@/engine/types";
import { add } from "@/engine/vector";
import { gatherReadiness } from "@/readiness/providers";
import { buildCatalog, LOAD_RATIOS } from "@/seed/catalog";
import type { BodyRegion } from "@/seed/schema";
import { localDate } from "./actions";
import type { GainpathDB } from "./db";
import { repo } from "./repo";
import type { Profile, RecordOf } from "./schema";

/**
 * Everything the engine needs, read from the local database. Shared by
 * session generation, swaps and the AI tools.
 */

const DAY = 24 * 3600_000;
const HISTORY_DAYS = 56;

export interface TrainingContext {
  now: number;
  date: string;
  profile: Profile;
  cfg: Config;
  gym: RecordOf<"gyms">;
  equipment: Equipment[];
  equipmentById: Map<string, Equipment>;
  links: RecordOf<"equipment_exercises">[];
  catalog: Map<string, Exercise>;
  favourites: Set<string>;
  favouriteEquipment: Set<string>;
  excludedExercises: Set<string>;
  excludedEquipment: Set<string>;
  tempExcludedExercises: Set<string>;
  tempExcludedEquipment: Set<string>;
  painRegions: Set<BodyRegion>;
  history: SetLog[];
  readiness: Readiness;
  hasCheckin: boolean;
  soreness: Partial<Record<Muscle, number>>;
  recovery: MuscleMap;
  candidates: Candidate[];
  anchors: AnchorState[];
  knownE1rms: KnownE1rm[];
  deprioritised: Array<{ equipmentId: string; slot: string }>;
  deload: { active: boolean; check: DeloadCheck };
  userAdjust: Partial<Record<Muscle, number>>;
  week: {
    start: number;
    plannedSessions: number;
    completed: number;
    progress: number;
    carry: Vector;
  };
  lastSessionExerciseIds: Set<string>;
  calibrationDue: boolean;
}

export const META_DELOAD_UNTIL = "deload_until";
export const META_DELOAD_LAST = "deload_last";

/** Local Monday 00:00 of the week containing `now`. */
export function weekStart(now: number): number {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

const alive = <T extends { deleted_at: number | null }>(rows: T[]) =>
  rows.filter((r) => r.deleted_at === null);

export function readLive(session: RecordOf<"sessions">): LiveSession | null {
  const plan = session.plan as LiveSession | null;
  return plan && plan.version === 1 ? plan : null;
}

export async function loadTrainingContext(
  db: GainpathDB,
  now = Date.now(),
): Promise<TrainingContext | null> {
  const profile = alive(await db.profiles.toArray()).sort((a, b) => a.created_at - b.created_at)[0];
  if (!profile) return null;
  const gyms = alive(await db.gyms.toArray());
  const gym =
    gyms.find((g) => g.id === profile.current_gym_id) ?? gyms.find((g) => g.is_default) ?? gyms[0];
  if (!gym) return null;
  const cfg = resolveConfig(profile.config_overrides);
  const date = localDate(now);

  const equipment = alive(await db.equipment.where("gym_id").equals(gym.id).toArray());
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));
  const links = alive(await db.equipment_exercises.toArray()).filter((l) =>
    equipmentById.has(l.equipment_id),
  );
  const catalog = buildCatalog(alive(await db.exercises.toArray()));
  const prefs = alive(await db.exercise_prefs.toArray());
  const pick = (kind: string, key: "exercise_id" | "equipment_id") =>
    new Set(prefs.filter((p) => p.kind === kind && p[key]).map((p) => p[key]!));
  const temp = alive(await db.temp_exclusions.where("date").equals(date).toArray());
  const painRegions = new Set(
    temp.flatMap((t) => (t.body_region ? [t.body_region as BodyRegion] : [])),
  );

  const history = alive(await db.set_logs.toArray()).filter(
    (s) => s.ts >= now - HISTORY_DAYS * DAY,
  );
  const { input, soreness, hasCheckin } = await gatherReadiness(db, date, cfg.baselineWindowDays);
  const readiness = computeReadiness(input, cfg);
  const recovery = recoveryState(history, catalog, now, soreness, cfg);

  // Machine preference: favourite, else the one used most.
  const usage = new Map<string, number>();
  for (const s of history) usage.set(s.equipment_id, (usage.get(s.equipment_id) ?? 0) + 1);
  const favouriteEquipment = pick("favourite", "equipment_id");
  const candidates = availableCandidates({
    catalog: [...catalog.values()],
    equipment,
    links,
    excludedExercises: pick("exclude", "exercise_id"),
    excludedEquipment: pick("exclude", "equipment_id"),
    tempExcludedExercises: new Set(temp.flatMap((t) => (t.exercise_id ? [t.exercise_id] : []))),
    tempExcludedEquipment: new Set(temp.flatMap((t) => (t.equipment_id ? [t.equipment_id] : []))),
    painRegions,
    preferredEquipment: (_id, options) =>
      options.find((o) => favouriteEquipment.has(o.id))?.id ??
      [...options].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))[0]?.id,
  });

  const anchorRows = alive(await db.anchors.toArray());
  const anchors: AnchorState[] = anchorRows.map((a) => ({
    region: a.muscle_region as AnchorRegion,
    exerciseId: a.exercise_id,
    equipmentId: a.equipment_id,
    mesocycleStart: a.mesocycle_start,
  }));
  const knownE1rms: KnownE1rm[] = alive(await db.e1rm_estimates.toArray()).map((e) => ({
    exerciseId: e.exercise_id,
    equipmentId: e.equipment_id,
    e1rm: e.value_kg,
    updatedAt: e.updated_at,
  }));

  // Week bookkeeping (§6): calendar week for session counts, plus volume owed from skips.
  const start = weekStart(now);
  const sessions = alive(await db.sessions.toArray());
  const thisWeek = sessions.filter((s) => new Date(`${s.date}T12:00:00`).getTime() >= start);
  const completed = thisWeek.filter((s) => s.status === "done" && s.date !== date).length;
  const carry = add(...thisWeek.map((s) => readLive(s)?.carry ?? {}));
  const lastDone = sessions
    .filter((s) => s.status === "done" && s.date !== date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastSessionExerciseIds = new Set(
    (lastDone &&
      readLive(lastDone)
        ?.exercises.filter((e) => e.status === "done")
        .map((e) => e.exerciseId)) ??
      [],
  );

  const lastAmrap = history.filter((s) => s.is_amrap).sort((a, b) => b.ts - a.ts)[0];

  // Deloads (§11): reactive suggestion, or a deload week the user accepted.
  const deloadUntil = (await db.meta.get(META_DELOAD_UNTIL))?.value as number | undefined;
  const deloadLast = (await db.meta.get(META_DELOAD_LAST))?.value as number | undefined;
  const firstSession = sessions.map((s) => s.created_at).sort((a, b) => a - b)[0];
  const sinceRef = deloadLast ?? firstSession;
  const plateauedAnchors = anchors.filter((a) =>
    isPlateau(
      e1rmHistory(
        history.filter(
          (s) =>
            s.exercise_id === a.exerciseId &&
            s.equipment_id === (a.equipmentId ?? BODYWEIGHT_EQUIPMENT_ID),
        ),
        profile.calibration_offset,
        cfg,
      ),
      cfg,
    ),
  ).length;
  const checkins = alive(await db.checkins.toArray())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)
    .map(
      (c) =>
        computeReadiness(
          { sleepQuality: c.sleep_quality, energy: c.energy, sleepHours: c.sleep_hours },
          cfg,
        ).score,
    );
  const deloadActive = deloadUntil !== undefined && now < deloadUntil;
  const check = checkDeload({
    plateauedAnchors,
    recentReadiness: checkins,
    weeksSinceDeload: sinceRef ? Math.floor((now - sinceRef) / (7 * DAY)) : null,
    cfg,
  });

  const mesocycle = alive(await db.mesocycles.toArray()).find((m) => m.end === null);

  return {
    now,
    date,
    profile,
    cfg,
    gym,
    equipment,
    equipmentById,
    links,
    catalog,
    favourites: pick("favourite", "exercise_id"),
    favouriteEquipment,
    excludedExercises: pick("exclude", "exercise_id"),
    excludedEquipment: pick("exclude", "equipment_id"),
    tempExcludedExercises: new Set(temp.flatMap((t) => (t.exercise_id ? [t.exercise_id] : []))),
    tempExcludedEquipment: new Set(temp.flatMap((t) => (t.equipment_id ? [t.equipment_id] : []))),
    painRegions,
    history,
    readiness,
    hasCheckin,
    soreness,
    recovery,
    candidates,
    anchors,
    knownE1rms,
    deprioritised: prefs
      .filter((p) => p.kind === "deprioritise" && p.equipment_id && p.reason)
      .map((p) => ({ equipmentId: p.equipment_id!, slot: p.reason! })),
    deload: { active: deloadActive, check },
    userAdjust: (mesocycle?.user_adjust as Partial<Record<Muscle, number>>) ?? {},
    week: {
      start,
      plannedSessions: profile.sessions_per_week,
      completed,
      progress: Math.min(1, (now - start) / (7 * DAY)),
      carry,
    },
    lastSessionExerciseIds,
    calibrationDue: calibrationDue(lastAmrap?.ts ?? null, now, cfg),
  };
}

export function slotOf(now: number): string {
  return `${new Date(now).getDay()}:${timeBucket(now)}`;
}

export function planInputFrom(ctx: TrainingContext): PlanInput {
  const slot = slotOf(ctx.now);
  return {
    now: ctx.now,
    profile: ctx.profile,
    catalog: ctx.catalog,
    candidates: ctx.candidates,
    history: ctx.history,
    soreness: ctx.soreness,
    readiness: ctx.readiness,
    userAdjust: ctx.userAdjust,
    carryOver: ctx.week.carry,
    plannedSessionsThisWeek: ctx.week.plannedSessions,
    completedThisWeek: ctx.week.completed,
    weekProgress: ctx.week.progress,
    favourites: ctx.favourites,
    anchors: ctx.anchors,
    anchorInvalid: (anchor) => {
      if (ctx.excludedExercises.has(anchor.exerciseId)) return "excluded";
      const eq = anchor.equipmentId ? ctx.equipmentById.get(anchor.equipmentId) : null;
      if (anchor.equipmentId && (!eq || ctx.excludedEquipment.has(eq.id))) return "excluded";
      if (
        eq?.status === "broken" &&
        eq.broken_since &&
        ctx.now - eq.broken_since > ctx.cfg.anchorBrokenDays * DAY
      ) {
        return "broken";
      }
      const history = e1rmHistory(
        ctx.history.filter(
          (s) =>
            s.exercise_id === anchor.exerciseId &&
            s.equipment_id === (anchor.equipmentId ?? BODYWEIGHT_EQUIPMENT_ID),
        ),
        ctx.profile.calibration_offset,
        ctx.cfg,
      );
      return isPlateau(history, ctx.cfg) ? "plateau" : null;
    },
    lastSessionExerciseIds: ctx.lastSessionExerciseIds,
    equipmentPenalty: (id) =>
      id && ctx.deprioritised.some((d) => d.equipmentId === id && d.slot === slot)
        ? ctx.cfg.busyPenalty
        : 0,
    isDeload: ctx.deload.active,
    calibrationDue: ctx.calibrationDue,
    knownE1rms: ctx.knownE1rms,
    ratios: LOAD_RATIOS,
    cfg: ctx.cfg,
  };
}

/** Persist the plan's anchors (§8): one row per region. */
export async function saveAnchors(db: GainpathDB, anchors: readonly AnchorState[]): Promise<void> {
  const anchorsRepo = repo("anchors", db);
  const rows = await anchorsRepo.list();
  for (const row of rows) {
    const keep = anchors.find((a) => a.region === row.muscle_region);
    if (!keep) await anchorsRepo.remove(row.id);
    else if (keep.exerciseId !== row.exercise_id || keep.equipmentId !== row.equipment_id) {
      await anchorsRepo.update(row.id, {
        exercise_id: keep.exerciseId,
        equipment_id: keep.equipmentId,
        mesocycle_start: keep.mesocycleStart,
      });
    }
  }
  for (const a of anchors) {
    if (rows.some((r) => r.muscle_region === a.region)) continue;
    await anchorsRepo.create({
      muscle_region: a.region,
      exercise_id: a.exerciseId,
      equipment_id: a.equipmentId,
      mesocycle_start: a.mesocycleStart,
    });
  }
}
