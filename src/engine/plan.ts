import { MUSCLES, type Muscle } from "@/data/schema";
import { updateAnchors, type AnchorInvalidReason, type AnchorState } from "./anchors";
import { equipmentId, type Candidate } from "./availability";
import { selectExercises } from "./builder";
import { pickCalibrationExercise } from "./calibration";
import type { Config } from "./config";
import { currentE1rm } from "./e1rm";
import { estimateStart, type KnownE1rm, type LoadRatio } from "./estimate";
import { recoveryState, type MuscleMap } from "./fatigue";
import { minLoad, prescribe } from "./load";
import { nextExposure } from "./progression";
import type { Readiness } from "./readiness";
import { targetsFor, type Role } from "./targets";
import { add, muscleLabel, scale } from "./vector";
import {
  dayFocus,
  sessionNeeds,
  weeklyDone,
  weeklyExposures,
  weeklyTargets,
  type DayFocus,
} from "./volume";
import { warmupSets, type WarmupSet } from "./warmup";
import type { Exercise, Experience, Goal, RationaleEntry, SetLog, Vector } from "./types";

/** Turns the engine pieces into today's session (ALGORITHMS §4–§10, §14–§16). */

export interface PlannedExercise {
  exerciseId: string;
  equipmentId: string;
  sets: number;
  repRange: [number, number];
  targetReps: number;
  targetRir: number;
  rirRange: [number, number];
  restSeconds: number;
  /** Working load; null when there is nothing to load (bodyweight, no equipment). */
  weightKg: number | null;
  timed: boolean;
  warmups: WarmupSet[];
  role: Role;
  isAnchor: boolean;
  /** Last set is an AMRAP calibration set (§10). */
  calibration: boolean;
  estimate: { uncertaintyPct: number; source: string } | null;
  rationale: RationaleEntry[];
}

export interface SessionPlan {
  createdAt: number;
  focus: DayFocus;
  readiness: { score: number; band: Readiness["band"] } | null;
  isDeload: boolean;
  exercises: PlannedExercise[];
  plannedVolume: Vector;
  needs: MuscleMap;
  caps: MuscleMap;
  anchors: AnchorState[];
  rationale: RationaleEntry[];
}

export interface PlanInput {
  now: number;
  profile: {
    goal: Goal;
    experience: Experience;
    sessions_per_week: number;
    session_minutes: number;
    time_saver_mode: boolean;
    calibration_offset: number;
  };
  catalog: ReadonlyMap<string, Exercise>;
  candidates: readonly Candidate[];
  /** Working and warm-up sets from the last several weeks (all gyms). */
  history: readonly SetLog[];
  soreness: Partial<Record<Muscle, number>>;
  readiness: Readiness | null;
  userAdjust: Partial<Record<Muscle, number>>;
  carryOver?: Vector;
  plannedSessionsThisWeek: number;
  completedThisWeek: number;
  /** Fraction of the training week elapsed (0–1). */
  weekProgress: number;
  favourites: ReadonlySet<string>;
  anchors: readonly AnchorState[];
  anchorInvalid: (anchor: AnchorState) => Exclude<AnchorInvalidReason, "expired"> | null;
  lastSessionExerciseIds: ReadonlySet<string>;
  equipmentPenalty?: (equipmentId: string | null) => number;
  isDeload: boolean;
  calibrationDue: boolean;
  knownE1rms: readonly KnownE1rm[];
  ratios: readonly LoadRatio[];
  cfg: Config;
}

const exposureKey = (s: SetLog) => s.session_id ?? new Date(s.ts).toISOString().slice(0, 10);

/** Working sets of the last two exposures on this exercise + machine (most recent last). */
export function lastExposures(
  history: readonly SetLog[],
  exerciseId: string,
  eqId: string,
): SetLog[][] {
  const groups = new Map<string, SetLog[]>();
  for (const s of history) {
    if (
      s.exercise_id !== exerciseId ||
      s.equipment_id !== eqId ||
      s.is_warmup ||
      s.deleted_at !== null
    )
      continue;
    const key = exposureKey(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()]
    .map((sets) => sets.sort((a, b) => a.ts - b.ts))
    .sort((a, b) => a[0].ts - b[0].ts)
    .slice(-2);
}

function averageRest(goal: Goal, cfg: Config, timeSaver: boolean): number {
  if (timeSaver) return cfg.restTimeSaver;
  return goal === "strength"
    ? (cfg.restStrengthMain + cfg.restStrengthAccessory) / 2
    : (cfg.restHypertrophyCompound + cfg.restHypertrophyIsolation) / 2;
}

export function buildSessionPlan(input: PlanInput): SessionPlan {
  const { cfg, profile, now } = input;
  const rationale: RationaleEntry[] = [...(input.readiness?.rationale ?? [])];
  const history = input.history.filter((s) => s.deleted_at === null);

  const recovery = recoveryState(history, input.catalog, now, input.soreness, cfg);
  const targets = weeklyTargets(profile.goal, profile.experience, input.userAdjust, cfg);
  const done = weeklyDone(history, input.catalog, now);
  const exposures = weeklyExposures(history, input.catalog, now);
  const focus = dayFocus(profile.sessions_per_week, input.completedThisWeek);
  const volumeMod = (input.readiness?.volumeMod ?? 1) * (input.isDeload ? cfg.deloadVolume : 1);
  if (input.isDeload)
    rationale.push({ rule: "DELOAD-2", vars: { pct: Math.round((1 - cfg.deloadVolume) * 100) } });

  const {
    needs,
    caps,
    rationale: needRationale,
  } = sessionNeeds(
    {
      targets,
      done,
      exposures,
      carryOver: input.carryOver,
      plannedSessionsThisWeek: input.plannedSessionsThisWeek,
      completedThisWeek: input.completedThisWeek,
      volumeMod,
      weekProgress: input.weekProgress,
      focus,
      recovery,
    },
    cfg,
  );
  rationale.push(...needRationale);

  // §4/§11: readiness and deload scale the session's total volume, not just per-muscle needs,
  // so the reduction still applies when the time budget is what limits the session.
  const setBudget = Math.floor(
    ((profile.session_minutes * 60) /
      (cfg.setWorkSeconds + averageRest(profile.goal, cfg, profile.time_saver_mode))) *
      volumeMod,
  );
  const selections = selectExercises({
    candidates: input.candidates,
    needs,
    caps,
    recovery,
    setBudget,
    favourites: input.favourites,
    anchors: new Set(input.anchors.map((a) => a.exerciseId)),
    lastSessionExerciseIds: input.lastSessionExerciseIds,
    equipmentPenalty: input.equipmentPenalty,
    cfg,
  });
  const { anchors } = updateAnchors({
    current: input.anchors,
    selections,
    now,
    invalid: input.anchorInvalid,
    cfg,
  });
  const anchorIds = new Set(anchors.map((a) => a.exerciseId));

  const warmMuscles = new Set<Muscle>();
  const exercises: PlannedExercise[] = selections.map(({ candidate, sets }, index) =>
    planExercise(
      candidate,
      sets,
      index,
      anchorIds.has(candidate.exercise.id),
      warmMuscles,
      input,
      history,
    ),
  );

  if (input.calibrationDue) {
    const pick = pickCalibrationExercise(
      exercises
        .filter((p) => !p.timed && p.weightKg !== null)
        .map((p) => input.catalog.get(p.exerciseId)!),
    );
    const planned = pick && exercises.find((p) => p.exerciseId === pick.id);
    if (planned) {
      planned.calibration = true;
      planned.rationale.push({ rule: "EFF-3", vars: { exercise: pick.name } });
    }
  }

  // VOL-1: show where the week stands for the most-trained muscles today.
  const plannedVolume = add(
    ...selections.map(({ candidate, sets }) => scale(candidate.exercise.vector, sets)),
  );
  const top = MUSCLES.filter((m) => (plannedVolume[m] ?? 0) > 0)
    .sort((a, b) => (plannedVolume[b] ?? 0) - (plannedVolume[a] ?? 0))
    .slice(0, 3);
  for (const m of top) {
    rationale.push({
      rule: "VOL-1",
      vars: {
        muscle: muscleLabel(m),
        done: Math.round(done[m] * 10) / 10,
        target: Math.round(targets[m]),
      },
    });
  }

  return {
    createdAt: now,
    focus,
    readiness: input.readiness
      ? { score: input.readiness.score, band: input.readiness.band }
      : null,
    isDeload: input.isDeload,
    exercises,
    plannedVolume,
    needs,
    caps,
    anchors,
    rationale,
  };
}

export function planExercise(
  candidate: Candidate,
  sets: number,
  index: number,
  isAnchor: boolean,
  warmMuscles: Set<Muscle>,
  input: PlanInput,
  history: readonly SetLog[],
): PlannedExercise {
  const { cfg, profile } = input;
  const { exercise, equipment } = candidate;
  const eqId = equipmentId(candidate);
  const isMain =
    isAnchor || (profile.goal === "strength" && index === 0 && exercise.kind === "compound");
  const t = targetsFor(exercise, profile.goal, isMain, cfg, profile.time_saver_mode);
  const rirAdd = input.readiness?.rirAdd ?? 0;
  let targetRir = t.targetRir + rirAdd;
  if (input.isDeload) targetRir = Math.max(targetRir, cfg.deloadMinRir);
  const rationale: RationaleEntry[] = [...t.rationale];
  if (isAnchor) rationale.push({ rule: "ANCHOR", vars: { exercise: exercise.name } });

  const [lastSets, previousSets] = (() => {
    const exposures = lastExposures(history, exercise.id, eqId);
    return [exposures.at(-1) ?? [], exposures.length > 1 ? exposures[0] : []];
  })();

  let weightKg: number | null = null;
  let targetReps = t.repRange[0];
  let estimate: PlannedExercise["estimate"] = null;

  if (exercise.timed) {
    weightKg =
      lastSets[0]?.weight_kg ??
      (exercise.loading === "external" && equipment ? minLoad(equipment) : null);
    targetReps = lastSets[0] ? Math.min(t.repRange[1], lastSets[0].reps + 5) : t.repRange[0];
  } else if (exercise.loading !== "external" || !equipment) {
    // Bodyweight / assisted: progress reps; any added or assisting load carries over.
    weightKg = lastSets[0]?.weight_kg ?? (equipment ? minLoad(equipment) : null);
    targetReps = lastSets[0] ? Math.min(t.repRange[1], lastSets[0].reps + 1) : t.repRange[0];
  } else if (lastSets.length > 0 && input.isDeload) {
    // DELOAD-2: same loads, fewer sets, more in reserve.
    weightKg = lastSets[0].weight_kg;
    targetReps = t.repRange[0];
  } else if (lastSets.length > 0) {
    const next = nextExposure({
      lastSets,
      previousSets,
      repRange: t.repRange,
      targetRir,
      equipment,
      allowIncrease: input.readiness?.allowLoadIncrease ?? true,
      calibrationOffset: profile.calibration_offset,
      cfg,
    });
    weightKg = next.weightKg;
    targetReps = next.targetReps;
    rationale.push(...next.rationale);
  } else {
    const known = currentE1rm(
      history.filter((s) => s.exercise_id === exercise.id && s.equipment_id === eqId),
      profile.calibration_offset,
      cfg,
    );
    const start = known
      ? null
      : estimateStart({
          exercise,
          equipment,
          known: input.knownE1rms,
          catalog: input.catalog,
          ratios: input.ratios,
          cfg,
        });
    if (known) {
      const p = prescribe(known, t.repRange[0], targetRir, equipment, cfg);
      weightKg = p.weightKg;
      targetReps = p.targetReps;
    } else if (start?.kind === "e1rm") {
      // Extra reserve on an unfamiliar machine until the first set recalibrates.
      const p = prescribe(start.e1rm, t.repRange[0], targetRir + 1, equipment, cfg);
      weightKg = p.weightKg;
      targetReps = p.targetReps;
      estimate = { uncertaintyPct: start.uncertaintyPct, source: start.source };
      rationale.push({ rule: "ESTIMATE", vars: { pct: start.uncertaintyPct } });
    } else if (start?.kind === "fallback") {
      weightKg = start.weightKg;
      targetRir = Math.max(targetRir, start.targetRir);
      estimate = { uncertaintyPct: 50, source: "none" };
      rationale.push({ rule: "ESTIMATE", vars: { pct: 50 } });
    }
  }

  const primes = (Object.keys(exercise.vector) as Muscle[]).filter((m) => exercise.vector[m] === 1);
  const warm = primes.some((m) => warmMuscles.has(m));
  const warmups =
    weightKg !== null && !exercise.timed
      ? warmupSets({
          exercise,
          equipment,
          workingKg: weightKg,
          e1rm: null,
          muscleAlreadyWarm: warm,
          cfg,
        })
      : [];
  if (exercise.kind === "compound") for (const m of primes) warmMuscles.add(m);

  return {
    exerciseId: exercise.id,
    equipmentId: eqId,
    sets,
    repRange: t.repRange,
    targetReps,
    targetRir,
    rirRange: t.rirRange,
    restSeconds: t.restSeconds,
    weightKg,
    timed: exercise.timed,
    warmups,
    role: t.role,
    isAnchor,
    calibration: false,
    estimate,
    rationale,
  };
}
