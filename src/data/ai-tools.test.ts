import { describe, expect, it } from "vitest";
import { EQUIPMENT_TEMPLATES } from "@/seed/catalog";
import { freshDB } from "@/test/fixtures";
import { addFromTemplate, createGym, saveProfile } from "./actions";
import { runChatTool } from "./ai-tools";
import { repo } from "./repo";

async function setup() {
  const db = freshDB();
  const gym = await createGym("Test", db);
  for (const id of [
    "barbell_power_rack",
    "adjustable_bench",
    "functional_trainer",
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
    { goal: "hypertrophy", experience: "intermediate", sessions_per_week: 3, session_minutes: 60 },
    db,
  );
  return db;
}

describe("chat tools", () => {
  it("rejects unknown tools and invalid input", async () => {
    const db = await setup();
    expect((await runChatTool(db, "delete_everything", {})).isError).toBe(true);
    expect((await runChatTool(db, "find_substitutes", { exercise_name: 5 })).isError).toBe(true);
  });

  it("returns engine numbers for recovery and readiness", async () => {
    const db = await setup();
    const recovery = JSON.parse((await runChatTool(db, "get_recovery_state", {})).content);
    expect(
      recovery.muscles.find((m: { muscle: string }) => m.muscle === "quads").weekly_target,
    ).toBeGreaterThan(0);
    const readiness = JSON.parse((await runChatTool(db, "get_readiness", {})).content);
    expect(readiness.band).toBe("normal");
  });

  it("finds substitutes with the swap engine", async () => {
    const db = await setup();
    const out = JSON.parse(
      (await runChatTool(db, "find_substitutes", { exercise_name: "leg press" })).content,
    );
    expect(out.exercise).toMatch(/leg press/i);
    expect(out.options.length).toBeGreaterThan(0);
    expect(out.options[0].match_pct).toBeGreaterThan(0);
  });

  it("only excludes equipment registered at the gym", async () => {
    const db = await setup();
    const available = JSON.parse((await runChatTool(db, "get_available_equipment", {})).content);
    const cable = available.available[0];
    const out = JSON.parse(
      (
        await runChatTool(db, "exclude_equipment_today", {
          equipment_ids: [cable.id, "made-up-id"],
        })
      ).content,
    );
    expect(out.excluded).toHaveLength(1);
    expect(out.ignored_unknown_ids).toBe(1);
    expect(await repo("temp_exclusions", db).list()).toHaveLength(1);
    const after = JSON.parse((await runChatTool(db, "get_available_equipment", {})).content);
    expect(after.available.some((e: { id: string }) => e.id === cable.id)).toBe(false);
  });
});
