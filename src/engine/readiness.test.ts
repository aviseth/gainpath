import { describe, expect, it } from "vitest";
import { cfg } from "@/test/engine-fixtures";
import { computeReadiness, zScore } from "./readiness";

const baseline = [60, 62, 58, 61, 59, 60, 63, 57, 60, 61];

describe("readiness (ALGORITHMS §4; READY-1..3)", () => {
  it("degrades gracefully: no data → neutral 70, normal session", () => {
    const r = computeReadiness({}, cfg);
    expect(r).toMatchObject({
      score: 70,
      band: "normal",
      volumeMod: 1,
      rirAdd: 0,
      allowLoadIncrease: true,
    });
  });

  it("scores the manual check-in alone (READY-3)", () => {
    expect(computeReadiness({ sleepQuality: 5, energy: 5 }, cfg).score).toBe(94);
    const tired = computeReadiness({ sleepQuality: 2, energy: 2 }, cfg);
    expect(tired.score).toBe(58);
    expect(tired).toMatchObject({
      band: "reduced",
      volumeMod: 0.85,
      rirAdd: 0.5,
      allowLoadIncrease: true,
    });
  });

  it("penalises ≤6 h sleep, including exactly 6 (READY-1)", () => {
    expect(computeReadiness({ sleepHours: 6 }, cfg).score).toBe(60);
    expect(computeReadiness({ sleepHours: 6.5 }, cfg).score).toBe(70);
    expect(computeReadiness({ sleepHours: 5 }, cfg).rationale[0].rule).toBe("READY-1");
  });

  it("below 50: 70% volume, +1 RIR and no load increases", () => {
    const r = computeReadiness({ sleepQuality: 1, energy: 1, sleepHours: 4 }, cfg);
    expect(r.score).toBe(36);
    expect(r).toMatchObject({ band: "low", volumeMod: 0.7, rirAdd: 1, allowLoadIncrease: false });
  });

  it("uses HRV only as a soft modifier against ≥7 days of personal baseline (READY-2)", () => {
    expect(zScore(50, baseline.slice(0, 6), 7)).toBeNull();
    const low = computeReadiness({ hrv: { today: 50, baseline } }, cfg);
    // Clamped to −2 SD × 4 points: at most −8, never enough alone to cancel training.
    expect(low.score).toBe(62);
    expect(low.rationale.some((r) => r.rule === "READY-2")).toBe(true);
    expect(
      computeReadiness({ hrv: { today: 50, baseline: baseline.slice(0, 3) } }, cfg).score,
    ).toBe(70);
  });

  it("raises readiness modestly when resting HR is below baseline", () => {
    expect(computeReadiness({ restingHr: { today: 52, baseline } }, cfg).score).toBe(76);
  });
});
