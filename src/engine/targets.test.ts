import { describe, expect, it } from "vitest";
import { cfg, ex } from "@/test/engine-fixtures";
import { roleFor, targetsFor } from "./targets";

describe("goal targets (ALGORITHMS §3; LOAD-1, EFF-1, REST-1)", () => {
  const squat = ex(
    "squat",
    { quads: 1, glutes: 1 },
    { rep_range: { strength: [3, 6], hypertrophy: [6, 12] } },
  );
  const curl = ex(
    "curl",
    { biceps: 1 },
    { rep_range: { strength: [8, 12], hypertrophy: [10, 15] } },
  );

  it("assigns roles from goal and exercise kind", () => {
    expect(roleFor(squat, "strength", true)).toBe("strength_main");
    expect(roleFor(squat, "strength", false)).toBe("strength_accessory");
    expect(roleFor(squat, "hypertrophy", true)).toBe("hypertrophy_compound");
    expect(roleFor(curl, "general", false)).toBe("hypertrophy_isolation");
  });

  it("strength main lifts: heavy reps, 2–3 RIR, 180 s rest (LOAD-1, EFF-1)", () => {
    const t = targetsFor(squat, "strength", true, cfg);
    expect(t.repRange).toEqual([3, 6]);
    expect(t.rirRange).toEqual([2, 3]);
    expect(t.restSeconds).toBe(180);
  });

  it("hypertrophy isolation: 0–2 RIR, 90 s rest", () => {
    const t = targetsFor(curl, "hypertrophy", false, cfg);
    expect(t.repRange).toEqual([10, 15]);
    expect(t.rirRange).toEqual([0, 2]);
    expect(t.restSeconds).toBe(90);
  });

  it("never rests under 90 s unless time-saver mode, which says so (REST-1)", () => {
    expect(
      targetsFor(curl, "hypertrophy", false, { ...cfg, restHypertrophyIsolation: 60 }).restSeconds,
    ).toBe(90);
    const saver = targetsFor(curl, "hypertrophy", false, cfg, true);
    expect(saver.restSeconds).toBe(60);
    expect(saver.rationale[0].rule).toBe("REST-1-TIMESAVER");
  });
});
