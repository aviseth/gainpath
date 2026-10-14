import { describe, expect, it } from "vitest";
import { eq, ex } from "@/test/engine-fixtures";
import { auditGym } from "./audit";

const cand = (e: ReturnType<typeof ex>) => ({ exercise: e, equipment: eq(), options: [] });

describe("Check my gym audit", () => {
  const legPress = ex(
    "leg_press",
    { quads: 1, glutes: 0.5 },
    { pattern: "squat", kind: "compound" },
  );
  const legCurl = ex("leg_curl", { hamstrings: 1 }, { pattern: "knee_flexion", kind: "isolation" });
  const press = ex(
    "chest_press",
    { chest: 1, triceps: 0.5 },
    { pattern: "horizontal_push", kind: "compound" },
  );

  it("reports what each muscle and pattern can be trained with", () => {
    const audit = auditGym({
      candidates: [legPress, legCurl, press].map(cand),
      equipment: [],
      links: [],
      goal: "hypertrophy",
    });
    expect(audit.muscles.quads).toEqual({ prime: 1, isolation: 0 });
    expect(audit.muscles.hamstrings).toEqual({ prime: 1, isolation: 1 });
    expect(audit.patterns.squat).toBe(1);
  });

  it("flags gaps without suggesting equipment", () => {
    const audit = auditGym({
      candidates: [legPress, press].map(cand),
      equipment: [],
      links: [],
      goal: "hypertrophy",
    });
    expect(audit.gaps).toContain("Nothing trains your hamstrings directly.");
    expect(audit.gaps).toContain("No quad isolation (e.g. knee extension) available.");
    expect(audit.gaps).toContain("No vertical pull movement available.");
    expect(audit.gaps.join(" ")).not.toMatch(/buy|get a|add a/i);
  });

  it("lists machines with no linked exercises and broken ones", () => {
    const lonely = eq("selectorized", { name: "Mystery machine" });
    const broken = eq("selectorized", { status: "broken" });
    const audit = auditGym({
      candidates: [],
      equipment: [lonely, broken],
      links: [{ equipment_id: broken.id, exercise_id: "x" }],
      goal: "general",
    });
    expect(audit.unlinked.map((e) => e.name)).toEqual(["Mystery machine"]);
    expect(audit.unavailable).toHaveLength(1);
  });

  it("notes missing heavy compound options for a strength goal", () => {
    const audit = auditGym({
      candidates: [cand(press)],
      equipment: [],
      links: [],
      goal: "strength",
    });
    expect(audit.gaps.some((g) => g.includes("LOAD-1"))).toBe(true);
  });
});
