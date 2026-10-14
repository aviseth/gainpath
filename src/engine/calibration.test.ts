import { describe, expect, it } from "vitest";
import { cfg, DAY, ex, NOW } from "@/test/engine-fixtures";
import {
  calibrationDue,
  calibrationError,
  pickCalibrationExercise,
  updateCalibration,
} from "./calibration";

describe("RIR calibration (ALGORITHMS §10, EFF-3)", () => {
  it("measures how many more reps the user had than predicted", () => {
    expect(calibrationError(10, 2, 14)).toBe(2);
    expect(calibrationError(10, 2, 11)).toBe(-1);
  });

  it("smooths with EWMA α = 0.3 and clamps to ±2", () => {
    expect(updateCalibration(0, 2, cfg)).toBe(0.6);
    expect(updateCalibration(1.9, 10, cfg)).toBe(2);
    expect(updateCalibration(-1.9, -10, cfg)).toBe(-2);
  });

  it("is due every ~3 weeks", () => {
    expect(calibrationDue(null, NOW, cfg)).toBe(true);
    expect(calibrationDue(NOW - 20 * DAY, NOW, cfg)).toBe(false);
    expect(calibrationDue(NOW - 21 * DAY, NOW, cfg)).toBe(true);
  });

  it("never picks a heavy barbell lift; prefers the last safe isolation", () => {
    const squat = ex(
      "barbell_back_squat",
      { quads: 1, glutes: 1 },
      { calibration_safe: false, implement: "barbell" },
    );
    const legExt = ex("leg_extension", { quads: 1 });
    const legPress = ex("leg_press", { quads: 1, glutes: 0.5 });
    expect(pickCalibrationExercise([squat, legExt, legPress])?.id).toBe("leg_extension");
    expect(pickCalibrationExercise([squat])).toBeNull();
  });
});
