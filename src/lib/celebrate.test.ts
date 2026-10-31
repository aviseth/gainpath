import { describe, expect, it } from "vitest";
import type { WeekVolume } from "@/engine/progress";
import { sessionCelebration, weekCelebration } from "./celebrate";

const weeks = (...totals: number[]): WeekVolume[] =>
  totals.map((total, i) => ({ weekStart: i, perMuscle: {} as never, total, sessions: 0 }));

describe("weekCelebration", () => {
  it("calls out the biggest week with the real previous best", () => {
    const c = weekCelebration(weeks(10, 24, 18, 38), 3, 4);
    expect(c.headline).toBe("38 working sets");
    expect(c.body).toBe("Your biggest week so far, up from 24. 3 of 4 sessions done, 1 to go.");
  });

  it("compares with last week when it isn't a record", () => {
    expect(weekCelebration(weeks(30, 20, 24), 2, 3).body).toMatch(/^Up from 20 last week\./);
    expect(weekCelebration(weeks(30, 20, 12), 1, 3).body).toMatch(/^Last week finished on 20\./);
  });

  it("stays modest without history", () => {
    expect(weekCelebration(weeks(0, 0, 9), 1, 3).body).toMatch(/^No recent week to compare/);
    const empty = weekCelebration(weeks(12, 0), 0, 3);
    expect(empty.headline).toBe("A fresh week");
    expect(empty.body).toBe("No working sets logged yet this week. 0 of 3 sessions done, 3 to go.");
  });

  it("notes when the planned sessions are all done", () => {
    expect(weekCelebration(weeks(5, 9), 3, 3).body).toMatch(/All 3 planned sessions done\.$/);
  });
});

describe("sessionCelebration", () => {
  it("compares with the previous session", () => {
    expect(sessionCelebration({ workingSets: 14, previousSets: 11, newBests: [] })).toEqual({
      headline: "14 working sets",
      body: "3 more than last session (11).",
    });
    expect(sessionCelebration({ workingSets: 9, previousSets: 11, newBests: [] }).body).toBe(
      "Last session had 11; today still counts.",
    );
  });

  it("handles the first session and new bests", () => {
    const c = sessionCelebration({
      workingSets: 1,
      previousSets: null,
      newBests: ["Leg press", "Row", "Curl"],
    });
    expect(c.headline).toBe("1 working set");
    expect(c.body).toBe(
      "Your first finished session is on the record. New best estimates on Leg press, Row and Curl.",
    );
  });
});
