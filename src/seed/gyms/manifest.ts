import { z } from "zod";
import { equipmentTypeSchema } from "@/data/schema";

/**
 * Gym manifests: a whole gym's equipment, identified during development from
 * the owner's photos and committed here so it appears in the app without
 * manual entry (PLAN.md milestone 2). See src/seed/gyms/README.md.
 */

export const manifestEquipmentSchema = z.object({
  /** Stable key, unique within the gym; ids are derived from it. */
  key: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  type: equipmentTypeSchema,
  brand: z.string().nullable(),
  model: z.string().nullable(),
  min_kg: z.number().nonnegative(),
  max_kg: z.number().nonnegative(),
  increment_kg: z.number().positive(),
  micro_increment_kg: z.number().positive().nullable(),
  notes: z.string().nullable(),
  exercise_ids: z.array(z.string()),
  /** Source photo file name(s), for traceability. */
  photos: z.array(z.string()).default([]),
  /** Fields that couldn't be read from the photos and need the owner's confirmation. */
  unverified: z.array(z.string()).default([]),
});

export const gymManifestSchema = z.object({
  /** ms timestamp; bump whenever the manifest changes so the new version wins (LWW). */
  version: z.number().int().positive(),
  gym: z.object({ key: z.string().regex(/^[a-z0-9_]+$/), name: z.string().min(1) }),
  equipment: z.array(manifestEquipmentSchema),
});

export type GymManifest = z.infer<typeof gymManifestSchema>;
export type ManifestEquipment = z.infer<typeof manifestEquipmentSchema>;
