import { describe, expect, it } from "vitest";
import { SEED_EXERCISES, EQUIPMENT_TEMPLATES } from "@/seed/catalog";
import { machinePattern } from ".";

const catalog = new Map(SEED_EXERCISES.map((e) => [e.id, e]));

describe("machinePattern", () => {
  it("draws a machine as its most common linked movement", () => {
    expect(machinePattern(["leg_extension"], catalog)).toBe("knee_extension");
    expect(machinePattern(["pec_deck_fly", "reverse_pec_deck"], catalog)).toBe("chest_fly");
    expect(
      machinePattern(
        ["lat_pulldown_wide", "lat_pulldown_neutral", "straight_arm_pulldown"],
        catalog,
      ),
    ).toBe("vertical_pull");
  });

  it("is null when nothing known is linked, so the type drawing is used", () => {
    expect(machinePattern([], catalog)).toBeNull();
    expect(machinePattern(["not_an_exercise"], catalog)).toBeNull();
  });

  it("gives selectorized templates varied drawings, not one shared icon", () => {
    const patterns = EQUIPMENT_TEMPLATES.filter((t) => t.type === "selectorized").map((t) =>
      machinePattern(t.exercise_ids, catalog),
    );
    expect(patterns.every(Boolean)).toBe(true);
    expect(new Set(patterns).size).toBeGreaterThan(patterns.length / 2);
  });
});
