import { describe, expect, it } from "vitest";
import { MUSCLES } from "@/data/schema";
import { cfg, eq, ex } from "@/test/engine-fixtures";
import type { Candidate } from "./availability";
import { orderSession, selectExercises, setsFor } from "./builder";
import type { MuscleMap } from "./fatigue";

const full = (v: number) => Object.fromEntries(MUSCLES.map((m) => [m, v])) as MuscleMap;
const needs = (n: Partial<MuscleMap>) => ({ ...full(0), ...n });
const cand = (e: ReturnType<typeof ex>): Candidate => ({
  exercise: e,
  equipment: eq(),
  options: [],
});

const squat = cand(
  ex("squat", { quads: 1, glutes: 1, adductors: 0.5 }, { pattern: "squat", fatigue_cost: 1.5 }),
);
const legPress = cand(
  ex("leg_press", { quads: 1, glutes: 0.5 }, { pattern: "squat", fatigue_cost: 1.5 }),
);
const legExt = cand(
  ex("leg_extension", { quads: 1 }, { pattern: "knee_extension", fatigue_cost: 0.8 }),
);
const bench = cand(
  ex("bench", { chest: 1, triceps: 0.5, front_delt: 0.5 }, { pattern: "horizontal_push" }),
);
const fly = cand(ex("fly", { chest: 1 }, { pattern: "chest_fly", fatigue_cost: 0.8 }));
const row = cand(
  ex("row", { upper_back: 1, lats: 0.5, biceps: 0.5 }, { pattern: "horizontal_pull" }),
);
const curl = cand(ex("curl", { biceps: 1 }, { pattern: "elbow_flexion", fatigue_cost: 0.8 }));
const all = [squat, legPress, legExt, bench, fly, row, curl];

const base = {
  candidates: all,
  caps: full(10),
  recovery: full(100),
  setBudget: 20,
  favourites: new Set<string>(),
  anchors: new Set<string>(),
  lastSessionExerciseIds: new Set<string>(),
  cfg,
};

describe("session builder (ALGORITHMS §7)", () => {
  it("sizes sets to the most-needed muscle, within 2–4", () => {
    expect(setsFor({ quads: 1, glutes: 1 }, needs({ quads: 3, glutes: 1 }), 2, 4)).toBe(3);
    expect(setsFor({ biceps: 1 }, needs({ biceps: 9 }), 2, 4)).toBe(4);
    expect(setsFor({ biceps: 1 }, needs({ biceps: 0.2 }), 2, 4)).toBe(2);
  });

  it("covers outstanding needs and stops when nothing is left to cover", () => {
    const picks = selectExercises({ ...base, needs: needs({ chest: 4, upper_back: 3 }) });
    const ids = picks.map((p) => p.candidate.exercise.id);
    expect(ids).toContain("row");
    expect(ids.some((id) => id === "bench" || id === "fly")).toBe(true);
    expect(ids).not.toContain("squat");
  });

  it("never exceeds the set budget", () => {
    const picks = selectExercises({ ...base, setBudget: 7, needs: full(6) });
    expect(picks.reduce((s, p) => s + p.sets, 0)).toBeLessThanOrEqual(7);
    expect(picks.every((p) => p.sets >= 2)).toBe(true);
  });

  it("avoids repeating a movement pattern (HEURISTIC −1.5)", () => {
    const picks = selectExercises({ ...base, needs: needs({ quads: 6 }) });
    const squatPatterns = picks.filter((p) => p.candidate.exercise.pattern === "squat");
    expect(squatPatterns).toHaveLength(1);
  });

  it("prefers favourites and anchors among equivalent options (PHIL-2, §8)", () => {
    const pecDeck = cand(ex("pec_deck", { chest: 1 }, { pattern: "chest_fly", fatigue_cost: 0.8 }));
    const input = { ...base, candidates: [fly, pecDeck], needs: needs({ chest: 3 }) };
    expect(selectExercises(input)[0].candidate.exercise.id).toBe("fly"); // tie → id
    expect(
      selectExercises({ ...input, favourites: new Set(["pec_deck"]) })[0].candidate.exercise.id,
    ).toBe("pec_deck");
    expect(
      selectExercises({ ...input, anchors: new Set(["pec_deck"]) })[0].candidate.exercise.id,
    ).toBe("pec_deck");
  });

  it("orders compounds first, heavier first", () => {
    const picks = selectExercises({ ...base, needs: needs({ quads: 3, chest: 3, biceps: 2 }) });
    const kinds = picks.map((p) => p.candidate.exercise.kind);
    expect(kinds.indexOf("isolation")).toBeGreaterThan(kinds.lastIndexOf("compound"));
  });

  it("is deterministic: same inputs → same session", () => {
    const input = { ...base, needs: needs({ quads: 4, chest: 4, upper_back: 4, biceps: 2 }) };
    const a = selectExercises(input).map((p) => `${p.candidate.exercise.id}:${p.sets}`);
    const b = selectExercises({ ...input, candidates: [...all].reverse() }).map(
      (p) => `${p.candidate.exercise.id}:${p.sets}`,
    );
    expect(a).toEqual(b);
  });

  it("separates back-to-back exercises hitting the same muscles where possible", () => {
    const ordered = orderSession(
      [
        { candidate: legExt, sets: 3 },
        { candidate: fly, sets: 3 },
        { candidate: { ...legExt, exercise: { ...legExt.exercise, id: "leg_ext_2" } }, sets: 3 },
      ],
      cfg,
    );
    const ids = ordered.map((o) => o.candidate.exercise.id);
    const legIdx = ids.filter((i) => i.startsWith("leg")).map((i) => ids.indexOf(i));
    expect(Math.abs(legIdx[0] - legIdx[1])).toBeGreaterThan(1);
  });
});
