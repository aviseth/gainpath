import { writeFileSync } from "node:fs";
import { afterAll, it, vi } from "vitest";
import { addFromTemplate, createGym, localDate, saveProfile } from "@/data/actions";
import { exportBackup } from "@/data/backup";
import { repo } from "@/data/repo";
import {
  finishSession,
  generateSession,
  logSet,
  readLive,
  sessionLogs,
  startSession,
} from "@/data/sessions";
import { availableLoads } from "@/engine/load";
import { setsRemaining } from "@/engine/session";
import type { Exercise } from "@/engine/types";
import { buildCatalog, EQUIPMENT_TEMPLATES } from "@/seed/catalog";
import { freshDB } from "@/test/fixtures";

/**
 * Builds a realistic six-week training history by running the real engine:
 * daily check-ins, generated sessions, every set logged with plausible RPEs.
 * Writes docs/screenshots/demo-backup.json for `pnpm screenshots`.
 *
 *   pnpm demo:data
 */

const DAY = 24 * 3600_000;
const WEEKS = 6;
const TRAINING_DAYS = new Set([1, 3, 5]); // Mon, Wed, Fri

// Deterministic pseudo-random so the screenshots are reproducible.
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

afterAll(() => vi.useRealTimers());

// The simulated lifter's starting e1RM (kg) by movement: an intermediate
// lifter. Dumbbell loads are per hand.
const BASE_E1RM: Partial<Record<Exercise["pattern"], number>> = {
  squat: 125,
  hinge: 150,
  lunge: 70,
  horizontal_push: 92,
  vertical_push: 58,
  horizontal_pull: 88,
  vertical_pull: 82,
  knee_extension: 75,
  knee_flexion: 60,
  hip_abduction: 70,
  hip_adduction: 70,
  hip_extension: 110,
  elbow_flexion: 40,
  elbow_extension: 45,
  shoulder_abduction: 18,
  shoulder_flexion: 20,
  rear_delt_fly: 35,
  chest_fly: 60,
  calf_raise: 120,
};

const catalog = buildCatalog([]);
const sessionsDone = new Map<string, number>();

/** What this lifter would load for reps at an RPE, with ~0.6% gain per exposure. */
function liftedLoad(exerciseId: string, reps: number, rpe: number, loads: number[]): number | null {
  const ex = catalog.get(exerciseId);
  const base = ex && BASE_E1RM[ex.pattern];
  if (!ex || !base || loads.length < 2) return null;
  const n = sessionsDone.get(exerciseId) ?? 0;
  const scale = (ex.per_hand ? 0.4 : 1) * (ex.kind === "isolation" && base > 60 ? 0.8 : 1);
  const e1rm = base * scale * (1 + 0.006 * n);
  const ideal = e1rm / (1 + (reps + (10 - rpe)) / 30);
  return loads.reduce(
    (best, l) => (Math.abs(l - ideal) < Math.abs(best - ideal) ? l : best),
    loads[0],
  );
}

it("generates the demo backup", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const today = new Date();
  today.setHours(18, 0, 0, 0);
  const start = today.getTime() - WEEKS * 7 * DAY;
  vi.setSystemTime(start - DAY);

  const db = freshDB();
  const gym = await createGym("Iron Temple", db);
  for (const id of [
    "barbell_power_rack",
    "adjustable_bench",
    "dumbbells_light",
    "functional_trainer",
    "lat_pulldown",
    "seated_cable_row_station",
    "leg_press_45",
    "leg_extension",
    "seated_leg_curl",
    "chest_press",
    "pec_deck_rear_delt",
    "smith_machine",
    "dumbbells_heavy",
    "standing_calf_raise",
    "dip_pull_up_station",
  ]) {
    const template = EQUIPMENT_TEMPLATES.find((t) => t.id === id);
    if (template) await addFromTemplate(gym.id, template, db);
  }
  await saveProfile(
    { goal: "hypertrophy", experience: "intermediate", sessions_per_week: 3, session_minutes: 60 },
    db,
  );

  for (let t = start; t < today.getTime() - DAY / 2; t += DAY) {
    const day = new Date(t);
    if (!TRAINING_DAYS.has(day.getDay())) continue;
    vi.setSystemTime(t - 3600_000);
    await repo("checkins", db).create({
      date: localDate(t),
      sleep_quality: pick([3, 4, 4, 4, 5]),
      energy: pick([3, 4, 4, 5]),
      sleep_hours: pick([6.5, 7, 7.5, 7.5, 8]),
      soreness: {},
    });
    vi.setSystemTime(t);
    let session = await generateSession(db, t);
    if (!session) continue;
    session = await startSession(db, session);
    for (const planned of readLive(session)!.exercises) {
      for (let i = 0; i < 8; i++) {
        const live = readLive(session)!.exercises.find(
          (e) => e.exerciseId === planned.exerciseId && e.status === "pending",
        );
        if (!live || setsRemaining(live, await sessionLogs(db, session.id)) === 0) break;
        vi.setSystemTime(Date.now() + 150_000);
        const rpe =
          live.calibration && setsRemaining(live, await sessionLogs(db, session.id)) === 1
            ? 10
            : pick([7.5, 8, 8, 8.5, 9]);
        const reps = live.targetReps + (rand() < 0.35 ? 1 : 0);
        const equipment = await repo("equipment", db).get(live.equipmentId);
        const weightKg =
          (equipment && liftedLoad(live.exerciseId, reps, rpe, availableLoads(equipment))) ??
          live.currentWeightKg;
        const result = await logSet(db, session, live.exerciseId, {
          weightKg,
          reps,
          rpe,
          predictedRir: live.predictedRir ?? (live.calibration ? 2 : undefined),
        });
        session = result.session;
      }
    }
    for (const e of readLive(session)!.exercises)
      sessionsDone.set(e.exerciseId, (sessionsDone.get(e.exerciseId) ?? 0) + 1);
    await finishSession(db, session);
  }

  vi.setSystemTime(Date.now());
  const backup = await exportBackup(db);
  writeFileSync("docs/screenshots/demo-backup.json", JSON.stringify(backup));
  console.log(
    `demo backup: ${backup.tables.sessions?.length} sessions, ${backup.tables.set_logs?.length} sets`,
  );
});
