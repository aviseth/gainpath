import { describe, expect, it } from "vitest";
import { MUSCLES } from "@/data/schema";
import { catalogOf, cfg, DAY, ex, NOW, set } from "@/test/engine-fixtures";
import type { MuscleMap } from "./fatigue";
import { dayFocus, sessionNeeds, weeklyDone, weeklyExposures, weeklyTargets } from "./volume";

const full = (v: number) => Object.fromEntries(MUSCLES.map((m) => [m, v])) as MuscleMap;
const bench = ex("bench", { chest: 1, triceps: 0.5, front_delt: 0.5 });
const catalog = catalogOf(bench);

describe("weekly volume (ALGORITHMS §6; VOL-1..5, PHIL-1)", () => {
  it("sets targets from experience × goal × auto-tuning (VOL-5 HEURISTIC)", () => {
    expect(weeklyTargets("hypertrophy", "intermediate", {}, cfg).chest).toBe(12);
    expect(weeklyTargets("strength", "novice", {}, cfg).chest).toBeCloseTo(6.75);
    expect(weeklyTargets("general", "advanced", { quads: 1.1 }, cfg).quads).toBeCloseTo(13.2);
  });

  it("counts sets fractionally: prime mover 1.0, synergist 0.5 (VOL-2), over a rolling 7 days", () => {
    const sets = [
      set("bench", 80, 8, 8, NOW - DAY),
      set("bench", 80, 8, 8, NOW - DAY),
      set("bench", 80, 8, 8, NOW - 8 * DAY), // outside the window
      set("bench", 40, 8, 5, NOW - DAY, { is_warmup: true }),
    ];
    const done = weeklyDone(sets, catalog, NOW);
    expect(done.chest).toBe(2);
    expect(done.triceps).toBe(1);
    expect(weeklyExposures(sets, catalog, NOW).chest).toBe(1);
    expect(weeklyExposures(sets, catalog, NOW).triceps).toBe(1);
  });

  const base = {
    targets: full(12),
    done: full(0),
    exposures: full(1),
    plannedSessionsThisWeek: 3,
    completedThisWeek: 0,
    volumeMod: 1,
    weekProgress: 0.2,
    focus: "full" as const,
    recovery: full(100),
  };

  it("spreads the deficit over remaining sessions and caps per session (VOL-4)", () => {
    expect(sessionNeeds(base, cfg).needs.chest).toBe(4);
    expect(sessionNeeds({ ...base, completedThisWeek: 2 }, cfg).needs.chest).toBe(10); // 12 capped at 10
    expect(sessionNeeds({ ...base, volumeMod: 0.85 }, cfg).needs.chest).toBeCloseTo(3.4);
    expect(sessionNeeds({ ...base, carryOver: { chest: 3 } }, cfg).needs.chest).toBe(5);
  });

  it("boosts a major muscle untouched by mid-week (PHIL-1)", () => {
    const r = sessionNeeds(
      { ...base, exposures: { ...full(1), hamstrings: 0 }, weekProgress: 0.6 },
      cfg,
    );
    expect(r.needs.hamstrings).toBe(6);
    expect(r.rationale).toContainEqual({ rule: "PHIL-1", vars: { muscle: "hamstrings" } });
  });

  it("soft-limits a poorly recovered muscle to half the cap, never to zero (REC-1)", () => {
    const r = sessionNeeds(
      { ...base, completedThisWeek: 2, recovery: { ...full(100), quads: 30 } },
      cfg,
    );
    expect(r.caps.quads).toBe(5);
    expect(r.needs.quads).toBe(5);
  });

  it("biases priority by split (HEURISTIC)", () => {
    expect(dayFocus(3, 1)).toBe("full");
    expect([dayFocus(4, 0), dayFocus(4, 1)]).toEqual(["upper", "lower"]);
    expect(dayFocus(6, 2)).toBe("full");
    const upper = sessionNeeds({ ...base, focus: "upper" }, cfg);
    expect(upper.needs.chest).toBe(4);
    expect(upper.needs.quads).toBe(2);
  });
});
