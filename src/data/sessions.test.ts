import { describe, expect, it } from "vitest";
import { findSubstitutes } from "@/engine/swap";
import { setsRemaining } from "@/engine/session";
import { EQUIPMENT_TEMPLATES } from "@/seed/catalog";
import { freshDB } from "@/test/fixtures";
import { addFromTemplate, createGym, saveProfile } from "./actions";
import type { GainpathDB } from "./db";
import { repo } from "./repo";
import {
  acceptSwap,
  applySwapReason,
  finishSession,
  generateSession,
  logSet,
  readLive,
  removeForPain,
  sessionLogs,
  skip,
  startDeloadWeek,
  todaysSession,
} from "./sessions";
import { loadTrainingContext } from "./training";

async function setup(): Promise<GainpathDB> {
  const db = freshDB();
  const gym = await createGym("Test", db);
  for (const id of [
    "barbell_power_rack",
    "adjustable_bench",
    "dumbbells_light",
    "functional_trainer",
    "lat_pulldown",
    "leg_press_45",
    "leg_extension",
    "seated_leg_curl",
    "chest_press",
  ]) {
    await addFromTemplate(
      gym.id,
      EQUIPMENT_TEMPLATES.find((t) => t.id === id)!,
      db,
    );
  }
  await saveProfile(
    { goal: "hypertrophy", experience: "intermediate", sessions_per_week: 3, session_minutes: 60 },
    db,
  );
  return db;
}

describe("session service", () => {
  it("generates and stores today's session, replacing an unstarted plan", async () => {
    const db = await setup();
    const first = await generateSession(db);
    expect(first?.status).toBe("planned");
    const live = readLive(first!)!;
    expect(live.exercises.length).toBeGreaterThan(2);
    expect(await repo("anchors", db).list()).not.toHaveLength(0);
    const again = await generateSession(db);
    expect(again?.id).toBe(first?.id);
    expect((await repo("sessions", db).list()).length).toBe(1);
  });

  it("logs sets, adjusts load in-session and tracks e1RM per exercise per machine", async () => {
    const db = await setup();
    let session = (await generateSession(db))!;
    const ex = readLive(session)!.exercises.find((e) => e.weightKg && e.weightKg > 0)!;
    const result = await logSet(db, session, ex.exerciseId, {
      weightKg: ex.weightKg,
      reps: ex.targetReps,
      rpe: 10,
    });
    session = result.session;
    expect(session.status).toBe("active");
    expect(result.adjustment?.nextWeightKg).toBeLessThanOrEqual(ex.weightKg!);
    const estimates = await repo("e1rm_estimates", db).list();
    expect(
      estimates.find((e) => e.exercise_id === ex.exerciseId && e.equipment_id === ex.equipmentId),
    ).toBeDefined();
  });

  it("marks an exercise done after its last set", async () => {
    const db = await setup();
    let session = (await generateSession(db))!;
    const ex = readLive(session)!.exercises[0];
    for (let i = 0; i < ex.setsTarget; i++) {
      session = (
        await logSet(db, session, ex.exerciseId, {
          weightKg: ex.weightKg,
          reps: ex.targetReps,
          rpe: 8,
        })
      ).session;
    }
    expect(readLive(session)!.exercises[0].status).toBe("done");
  });

  it("swaps after a 'machine busy' reason, excluding that machine today, and logs the swap", async () => {
    const db = await setup();
    let session = (await generateSession(db))!;
    const target = readLive(session)!.exercises.find((e) => e.exerciseId !== "push_up")!;
    await applySwapReason(db, {
      reason: "busy",
      exerciseId: target.exerciseId,
      equipmentId: target.equipmentId,
    });
    const ctx = (await loadTrainingContext(db))!;
    expect(ctx.tempExcludedEquipment.has(target.equipmentId)).toBe(true);
    const live = readLive(session)!;
    const result = findSubstitutes({
      removed: {
        exercise: ctx.catalog.get(target.exerciseId)!,
        plannedSets: target.sets,
        remainingSets: target.sets,
      },
      candidates: ctx.candidates,
      sessionOthers: live.exercises
        .filter((e) => e.exerciseId !== target.exerciseId)
        .map((e) => ({ exercise: ctx.catalog.get(e.exerciseId)!, sets: e.setsTarget })),
      caps: live.meta.caps,
      recovery: ctx.recovery,
      favourites: ctx.favourites,
      cfg: ctx.cfg,
    });
    expect(result.options.length).toBeGreaterThan(0);
    for (const o of result.options)
      for (const i of o.items) expect(i.equipment?.id).not.toBe(target.equipmentId);
    session = await acceptSwap(db, session, target.exerciseId, "busy", result.options[0]);
    const after = readLive(session)!;
    expect(after.exercises.find((e) => e.exerciseId === target.exerciseId)?.status).toBe(
      "swapped_out",
    );
    expect(after.exercises.some((e) => e.replaces === target.exerciseId)).toBe(true);
    expect((await repo("swaps", db).list())[0]).toMatchObject({
      reason: "busy",
      removed_exercise_id: target.exerciseId,
    });
  });

  it("'broken' marks the equipment broken", async () => {
    const db = await setup();
    const session = (await generateSession(db))!;
    const target = readLive(session)!.exercises.find(
      (e) => e.equipmentId !== "00000000-0000-0000-0000-000000000000",
    )!;
    await applySwapReason(db, {
      reason: "broken",
      exerciseId: target.exerciseId,
      equipmentId: target.equipmentId,
    });
    expect((await repo("equipment", db).get(target.equipmentId))?.status).toBe("broken");
  });

  it("skip without replacing carries volume forward (or rebalances today)", async () => {
    const db = await setup();
    const session = (await generateSession(db))!;
    const target = readLive(session)!.exercises[0];
    const { session: after, added } = await skip(db, session, target.exerciseId);
    const live = readLive(after)!;
    expect(live.exercises[0].status).toBe("skipped");
    const carried = Object.values(live.carry).reduce((a, b) => a + (b ?? 0), 0);
    expect(carried > 0 || added.length > 0).toBe(true);
  });

  it("pain removes every exercise loading that region today", async () => {
    const db = await setup();
    let session = (await generateSession(db))!;
    await applySwapReason(db, {
      reason: "pain",
      exerciseId: "x",
      equipmentId: "x",
      painRegion: "knee",
    });
    session = await removeForPain(db, session, "knee");
    const ctx = (await loadTrainingContext(db))!;
    for (const e of readLive(session)!.exercises.filter((x) => x.status === "pending")) {
      expect(ctx.catalog.get(e.exerciseId)!.joints).not.toContain("knee");
    }
    expect(readLive(session)!.meta.rationale.some((r) => r.rule === "PAIN")).toBe(true);
    expect(ctx.candidates.some((c) => c.exercise.joints.includes("knee"))).toBe(false);
  });

  it("finishing carries unfinished work into the week", async () => {
    const db = await setup();
    const session = (await generateSession(db))!;
    const done = await finishSession(db, session);
    expect(done.status).toBe("done");
    const logs = await sessionLogs(db, done.id);
    for (const e of readLive(done)!.exercises) expect(setsRemaining(e, logs)).toBe(0);
    expect(await todaysSession(db)).toBeDefined();
  });

  it("an accepted deload week lowers volume (DELOAD-2)", async () => {
    const db = await setup();
    const normal = readLive((await generateSession(db))!)!;
    await repo("sessions", db).remove((await todaysSession(db))!.id);
    await startDeloadWeek(db);
    const deload = readLive((await generateSession(db))!)!;
    const total = (l: typeof normal) => l.exercises.reduce((s, e) => s + e.setsTarget, 0);
    expect(deload.meta.isDeload).toBe(true);
    expect(total(deload)).toBeLessThan(total(normal));
  });
});
