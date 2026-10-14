import { describe, expect, it } from "vitest";
import { cfg, DAY, eq, ex, NOW } from "@/test/engine-fixtures";
import { anchorRegion, updateAnchors } from "./anchors";

const squat = ex("squat", { quads: 1, glutes: 1 }, { kind: "compound" });
const hackSquat = ex("hack_squat", { quads: 1, glutes: 0.5 }, { kind: "compound" });
const bench = ex("bench", { chest: 1, triceps: 0.5 }, { kind: "compound" });
const curl = ex("curl", { biceps: 1 }, { kind: "isolation" });
const pick = (e: ReturnType<typeof ex>) => ({
  candidate: { exercise: e, equipment: eq(), options: [] },
  sets: 3,
});

describe("anchor lifts (ALGORITHMS §8) — HEURISTIC", () => {
  it("maps compounds to regions; isolations have none", () => {
    expect(anchorRegion(squat)).toBe("quads");
    expect(anchorRegion(bench)).toBe("chest");
    expect(anchorRegion(curl)).toBeNull();
  });

  it("creates anchors from today's compounds and keeps them for the mesocycle", () => {
    const first = updateAnchors({
      current: [],
      selections: [pick(squat), pick(bench)],
      now: NOW,
      invalid: () => null,
      cfg,
    });
    expect(first.anchors.map((a) => a.exerciseId)).toEqual(["squat", "bench"]);
    const later = updateAnchors({
      current: first.anchors,
      selections: [pick(hackSquat)],
      now: NOW + 14 * DAY,
      invalid: () => null,
      cfg,
    });
    expect(later.anchors.find((a) => a.region === "quads")?.exerciseId).toBe("squat");
  });

  it("replaces an anchor only when excluded, broken, plateaued, or the mesocycle ends", () => {
    const current = [
      { region: "quads" as const, exerciseId: "squat", equipmentId: null, mesocycleStart: NOW },
    ];
    const broken = updateAnchors({
      current,
      selections: [pick(hackSquat)],
      now: NOW + DAY,
      invalid: () => "broken",
      cfg,
    });
    expect(broken.anchors[0].exerciseId).toBe("hack_squat");
    expect(broken.replaced[0].reason).toBe("broken");
    const expired = updateAnchors({
      current,
      selections: [],
      now: NOW + 5 * 7 * DAY,
      invalid: () => null,
      cfg,
    });
    expect(expired.replaced[0].reason).toBe("expired");
  });
});
