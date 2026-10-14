import { describe, expect, it } from "vitest";
import { EQUIPMENT_TEMPLATES } from "@/seed/catalog";
import { freshDB } from "@/test/fixtures";
import { addFromTemplate, createGym, saveProfile } from "./actions";
import { buildWeeklySummary, isoDate, lastWeekStart } from "./review";
import { finishSession, generateSession, logSet, readLive } from "./sessions";
import { loadTrainingContext } from "./training";

describe("weekly review summary", () => {
  it("summarises only the given week from engine data", async () => {
    const db = freshDB();
    const gym = await createGym("Test", db);
    for (const id of [
      "barbell_power_rack",
      "adjustable_bench",
      "lat_pulldown",
      "leg_press_45",
      "chest_press",
    ]) {
      await addFromTemplate(
        gym.id,
        EQUIPMENT_TEMPLATES.find((t) => t.id === id)!,
        db,
      );
    }
    await saveProfile(
      {
        goal: "hypertrophy",
        experience: "intermediate",
        sessions_per_week: 3,
        session_minutes: 60,
      },
      db,
    );
    let session = (await generateSession(db))!;
    const ex = readLive(session)!.exercises.find((e) => e.weightKg && e.weightKg > 0)!;
    session = (
      await logSet(db, session, ex.exerciseId, {
        weightKg: ex.weightKg,
        reps: ex.targetReps,
        rpe: 8,
      })
    ).session;
    await finishSession(db, session);
    const ctx = (await loadTrainingContext(db))!;

    const thisWeek = lastWeekStart(Date.now() + 7 * 24 * 3600_000);
    const summary = await buildWeeklySummary(db, ctx, thisWeek);
    expect(summary.week_start).toBe(isoDate(thisWeek));
    expect(summary.total_working_sets).toBe(1);
    expect(summary.sessions.completed).toBe(1);
    expect(summary.strength[0].e1rm_kg).toBeGreaterThan(0);
    expect(summary.volume_sets_vs_target.every((v) => v.target > 0)).toBe(true);

    const previous = await buildWeeklySummary(db, ctx, lastWeekStart(Date.now()));
    expect(previous.total_working_sets).toBe(0);
  });
});
