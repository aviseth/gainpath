import type { Equipment, Muscle, RecordOf } from "@/data/schema";
import type { BodyRegion, SeedExercise } from "@/seed/schema";

/**
 * Engine inputs are plain data. Record shapes match the database (snake_case)
 * so the app passes rows straight in without adapters.
 */

/** A catalogue exercise: a seed exercise, or a custom one normalised to the same shape. */
export type Exercise = SeedExercise & { custom?: boolean };

/** Fractional sets per muscle (VOL-2). Missing muscles are 0. */
export type Vector = Partial<Record<Muscle, number>>;

export type { Equipment, Muscle, BodyRegion };
export type SetLog = RecordOf<"set_logs">;
export type Checkin = RecordOf<"checkins">;
export type WearableDay = RecordOf<"wearable_daily">;
export type Profile = RecordOf<"profiles">;

export type Goal = Profile["goal"];
export type Experience = Profile["experience"];

/** A rule the engine applied, rendered later by explain.ts (ALGORITHMS §16). */
export interface RationaleEntry {
  rule: string;
  vars: Record<string, string | number>;
}
