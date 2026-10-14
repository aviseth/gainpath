import type { Config } from "./config";
import type { Exercise } from "./types";

/**
 * RIR calibration (ALGORITHMS §10, EFF-3). People misjudge reps in reserve by
 * about one rep on average; an occasional AMRAP on a safe exercise measures
 * this user's bias.
 */

/** Positive = the user had more reps left than they predicted. */
export function calibrationError(
  plannedReps: number,
  predictedRir: number,
  actualReps: number,
): number {
  return actualReps - (plannedReps + predictedRir);
}

export function updateCalibration(offset: number, error: number, cfg: Config): number {
  const next = (1 - cfg.calibrationAlpha) * offset + cfg.calibrationAlpha * error;
  return Math.max(
    -cfg.calibrationClamp,
    Math.min(cfg.calibrationClamp, Math.round(next * 100) / 100),
  );
}

export function calibrationDue(
  lastCalibrationTs: number | null,
  now: number,
  cfg: Config,
): boolean {
  return (
    lastCalibrationTs === null ||
    now - lastCalibrationTs >= cfg.calibrationIntervalDays * 24 * 3600_000
  );
}

/**
 * The exercise whose last set becomes the AMRAP: never a heavy barbell lift
 * (calibration_safe is false for those); prefer the last safe isolation.
 */
export function pickCalibrationExercise(exercises: readonly Exercise[]): Exercise | null {
  const safe = exercises.filter((e) => e.calibration_safe && e.loading === "external");
  return [...safe].reverse().find((e) => e.kind === "isolation") ?? safe.at(-1) ?? null;
}
