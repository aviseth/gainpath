import { describe, expect, it } from "vitest";
import { cfg, eq } from "@/test/engine-fixtures";
import { availableLoads, prescribe, roundToEquipment, stepDown, stepUp, targetLoad } from "./load";

describe("load prescription (ALGORITHMS §2)", () => {
  const stack = eq("selectorized", { min_kg: 5, max_kg: 100, increment_kg: 5 });

  it("inverts Epley for a rep and RIR target", () => {
    expect(targetLoad(120, 8, 2)).toBeCloseTo(120 / (1 + 10 / 30));
  });

  it("rounds DOWN to the machine's steps and clamps to its range", () => {
    expect(roundToEquipment(57.4, stack)).toBe(55);
    expect(roundToEquipment(2, stack)).toBe(5);
    expect(roundToEquipment(500, stack)).toBe(100);
  });

  it("uses micro-plates between full steps", () => {
    const withMicro = eq("plate_loaded", {
      min_kg: 20,
      max_kg: 60,
      increment_kg: 2.5,
      micro_increment_kg: 1.25,
    });
    expect(availableLoads(withMicro).slice(0, 4)).toEqual([20, 21.25, 22.5, 23.75]);
    expect(roundToEquipment(23.6, withMicro)).toBe(22.5);
  });

  it("steps up and down one equipment step", () => {
    expect(stepUp(55, stack)).toBe(60);
    expect(stepUp(100, stack)).toBe(100);
    expect(stepDown(55, stack)).toBe(50);
    expect(stepDown(5, stack)).toBe(5);
  });

  it("asks for +1 rep when rounding falls more than 7.5% short (HEURISTIC)", () => {
    // ideal 63 → 60 (4.8% short): same reps
    expect(prescribe(84, 8, 2, stack, cfg)).toMatchObject({ weightKg: 60, targetReps: 8 });
    // On a 10 kg stack, ideal 57.75 → 50 (13% short): one more rep instead
    const coarse = eq("selectorized", { min_kg: 10, max_kg: 100, increment_kg: 10 });
    expect(prescribe(84, 8, 2, coarse, cfg)).toMatchObject({ weightKg: 60, targetReps: 8 });
    expect(prescribe(77, 8, 2, coarse, cfg)).toMatchObject({ weightKg: 50, targetReps: 9 });
  });
});
