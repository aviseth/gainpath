import { describe, expect, it } from "vitest";
import { cfg } from "@/test/engine-fixtures";
import { parseLog } from "./parser";

const session = [
  { id: "barbell_bench_press", name: "Barbell Bench Press", aliases: ["bench press", "bench"] },
  { id: "leg_press", name: "Leg Press" },
];
const gym = [
  ...session,
  { id: "cable_triceps_pushdown", name: "Cable Triceps Pushdown", aliases: ["pushdown"] },
];
const ctx = { sessionExercises: session, gymExercises: gym, currentExerciseId: "leg_press" };
const parse = (text: string) => parseLog(text, ctx, cfg);

describe("free-text logging parser (ALGORITHMS §17)", () => {
  it('"80 x 8" → one set 80 kg × 8', () => {
    expect(parse("80 x 8")).toMatchObject({
      exerciseId: "leg_press",
      sets: [{ weightKg: 80, reps: 8, rpe: null }],
      confidence: "high",
    });
    expect(parse("80kg × 8").sets).toEqual([{ weightKg: 80, reps: 8, rpe: null }]);
    expect(parse("80 for 8").sets).toEqual([{ weightKg: 80, reps: 8, rpe: null }]);
  });

  it('"3x8 @ 80" and "3 sets of 8 at 80" → three sets', () => {
    const expected = Array(3).fill({ weightKg: 80, reps: 8, rpe: null });
    expect(parse("3x8 @ 80").sets).toEqual(expected);
    expect(parse("3 sets of 8 at 80").sets).toEqual(expected);
    expect(parse("3 x 8 @ 80kg").sets).toEqual(expected);
  });

  it('"80kg 8 8 7" → three sets with different reps', () => {
    expect(parse("80kg 8 8 7").sets.map((s) => s.reps)).toEqual([8, 8, 7]);
    expect(parse("80 x 8, 8, 7").sets.map((s) => s.reps)).toEqual([8, 8, 7]);
  });

  it('reads RPE: "80 x 8 rpe 9" / "80x8@9"', () => {
    expect(parse("80 x 8 rpe 9").sets).toEqual([{ weightKg: 80, reps: 8, rpe: 9 }]);
    expect(parse("80x8@9").sets).toEqual([{ weightKg: 80, reps: 8, rpe: 9 }]);
    expect(parse("80 x 8 @ rpe 8.5").sets).toEqual([{ weightKg: 80, reps: 8, rpe: 8.5 }]);
  });

  it('matches the exercise name: "bench 80x8" (session first)', () => {
    expect(parse("bench 80x8")).toMatchObject({
      exerciseId: "barbell_bench_press",
      confidence: "high",
    });
    expect(parse("pushdown 25 x 12").exerciseId).toBe("cable_triceps_pushdown");
  });

  it('flags approximate weights: "~80", "about 80"', () => {
    expect(parse("~80 x 8")).toMatchObject({
      approximate: true,
      sets: [{ weightKg: 80, reps: 8 }],
    });
    expect(parse("about 80 x 8").approximate).toBe(true);
  });

  it("turns hints into RPE on the last set: grind 9.5, failed 10, easy 7", () => {
    expect(parse("80kg 8 8 7 last one was a grind").sets.map((s) => s.rpe)).toEqual([
      null,
      null,
      9.5,
    ]);
    expect(parse("80 x 6 failed").sets[0].rpe).toBe(10);
    expect(parse("60 x 10 easy").sets[0].rpe).toBe(7);
  });

  it("is low confidence when something is missing or unclear", () => {
    expect(parse("3x8")).toMatchObject({ confidence: "low", issues: ["weight missing"] });
    expect(parse("squat 100 x 5").confidence).toBe("low"); // not in this gym
    expect(parseLog("80 x 8", { sessionExercises: [], gymExercises: [] }, cfg).confidence).toBe(
      "low",
    );
    expect(parse("felt good").confidence).toBe("low");
  });
});
