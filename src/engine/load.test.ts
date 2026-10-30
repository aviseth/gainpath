import { describe, expect, it } from "vitest";
import { cfg, eq } from "@/test/engine-fixtures";
import {
  availableLoads,
  minLoad,
  prescribe,
  roundToEquipment,
  stepDown,
  stepUp,
  targetLoad,
} from "./load";

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

describe("exact weight lists (ALGORITHMS §2, §9)", () => {
  // A dumbbell rack with gaps: no 4.5 kg, no 7 kg.
  const rack = eq("free_weights", {
    min_kg: 2,
    max_kg: 40,
    increment_kg: 2.5,
    weights_kg: [2, 4, 6, 8, 10, 12.5, 15],
  });

  it("offers exactly the listed weights", () => {
    expect(availableLoads(rack)).toEqual([2, 4, 6, 8, 10, 12.5, 15]);
    expect(minLoad(rack)).toBe(2);
  });

  it("rounds DOWN to the nearest listed weight, clamped to the smallest", () => {
    expect(roundToEquipment(4.5, rack)).toBe(4);
    expect(roundToEquipment(12.4, rack)).toBe(10);
    expect(roundToEquipment(12.5, rack)).toBe(12.5);
    expect(roundToEquipment(1, rack)).toBe(2);
    expect(roundToEquipment(99, rack)).toBe(15);
  });

  it("steps to the next and previous listed weight", () => {
    expect(stepUp(10, rack)).toBe(12.5);
    expect(stepUp(4.5, rack)).toBe(6);
    expect(stepUp(15, rack)).toBe(15);
    expect(stepDown(12.5, rack)).toBe(10);
    expect(stepDown(2, rack)).toBe(2);
  });

  it("prescribes a listed weight", () => {
    // ideal 4.9 kg would be 4.5 on a 2 + k·2.5 range; the rack has 4.
    expect(prescribe(6.53, 8, 2, rack, cfg).weightKg).toBe(4);
  });

  it("behaves exactly like the linear range when the list is null or empty", () => {
    const linear = eq("free_weights", { min_kg: 2, max_kg: 40, increment_kg: 2.5 });
    for (const list of [null, []]) {
      const same = { ...linear, weights_kg: list };
      expect(availableLoads(same)).toEqual(availableLoads(linear));
      expect(roundToEquipment(4.6, same)).toBe(4.5);
      expect(stepUp(4.5, same)).toBe(7);
      expect(minLoad(same)).toBe(2);
    }
  });
});
