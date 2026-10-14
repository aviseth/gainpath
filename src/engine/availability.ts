import type { BodyRegion } from "@/seed/schema";
import type { Equipment, Exercise } from "./types";

/**
 * Which exercises can be programmed right now (ALGORITHMS §7 candidate filter).
 * Exercises only ever come from equipment registered, active and not excluded
 * at the current gym (PROMPT: "Gyms and machines"), minus anything loading a
 * pain-flagged region (EVIDENCE §10 rule 6).
 */

/** Stand-in equipment id for exercises that need no equipment (push-up, plank). */
export const BODYWEIGHT_EQUIPMENT_ID = "00000000-0000-0000-0000-000000000000";

export interface AvailabilityInput {
  catalog: readonly Exercise[];
  /** Equipment registered at the current gym (deleted rows already removed). */
  equipment: readonly Equipment[];
  /** equipment_exercises: which exercises each machine supports. */
  links: ReadonlyArray<{ equipment_id: string; exercise_id: string }>;
  excludedExercises?: ReadonlySet<string>;
  excludedEquipment?: ReadonlySet<string>;
  /** Today-only exclusions (busy, didn't feel like it). */
  tempExcludedExercises?: ReadonlySet<string>;
  tempExcludedEquipment?: ReadonlySet<string>;
  painRegions?: ReadonlySet<BodyRegion>;
  /** Preferred machine for an exercise (favourite or most-used), if any. */
  preferredEquipment?: (exerciseId: string, options: readonly Equipment[]) => string | undefined;
}

export interface Candidate {
  exercise: Exercise;
  /** Chosen machine; null for no-equipment exercises. */
  equipment: Equipment | null;
  /** Every usable machine for this exercise at this gym. */
  options: Equipment[];
}

export function equipmentId(candidate: Pick<Candidate, "equipment">): string {
  return candidate.equipment?.id ?? BODYWEIGHT_EQUIPMENT_ID;
}

export function loadsPainRegion(
  exercise: Exercise,
  pain: ReadonlySet<BodyRegion> | undefined,
): boolean {
  return !!pain && pain.size > 0 && exercise.joints.some((j) => pain.has(j));
}

export function availableCandidates(input: AvailabilityInput): Candidate[] {
  const usable = input.equipment.filter(
    (eq) =>
      eq.status === "active" &&
      eq.deleted_at === null &&
      !input.excludedEquipment?.has(eq.id) &&
      !input.tempExcludedEquipment?.has(eq.id),
  );
  const usableById = new Map(usable.map((eq) => [eq.id, eq]));
  const typesPresent = new Set(usable.map((eq) => eq.type));
  const linked = new Map<string, Equipment[]>();
  for (const link of input.links) {
    const eq = usableById.get(link.equipment_id);
    if (!eq) continue;
    const list = linked.get(link.exercise_id) ?? [];
    if (!list.includes(eq)) list.push(eq);
    linked.set(link.exercise_id, list);
  }

  const candidates: Candidate[] = [];
  for (const exercise of input.catalog) {
    if (input.excludedExercises?.has(exercise.id) || input.tempExcludedExercises?.has(exercise.id))
      continue;
    if (loadsPainRegion(exercise, input.painRegions)) continue;
    if (exercise.equipment_types.length === 0) {
      candidates.push({ exercise, equipment: null, options: [] });
      continue;
    }
    const options = (linked.get(exercise.id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    if (options.length === 0) continue;
    // Accessories (e.g. a bench for dumbbell presses) only need to be present.
    if (!exercise.equipment_types.slice(1).every((t) => typesPresent.has(t))) continue;
    const preferred = input.preferredEquipment?.(exercise.id, options);
    const equipment = options.find((eq) => eq.id === preferred) ?? options[0];
    candidates.push({ exercise, equipment, options });
  }
  return candidates.sort((a, b) => a.exercise.id.localeCompare(b.exercise.id));
}
