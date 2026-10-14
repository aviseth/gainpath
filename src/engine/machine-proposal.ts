import type { MachineProposal } from "@/lib/ai-schemas";
import type { Muscle, MovementPattern } from "@/data/schema";
import type { EquipmentType } from "@/data/schema";
import type { Exercise } from "./types";

/**
 * Validates an AI machine proposal against local data before anything is
 * shown (PROMPT M6). Catalogue IDs must exist; a new exercise needs at least
 * one prime mover. Muscles are weighted 1.0 primary / 0.5 secondary (VOL-2).
 */

export interface NewExerciseProposal {
  name: string;
  pattern: MovementPattern;
  vector: Partial<Record<Muscle, number>>;
  kind: "compound" | "isolation";
}

export interface ValidatedProposal {
  recognised: boolean;
  name: string;
  type: EquipmentType;
  brand: string | null;
  model: string | null;
  notes: string | null;
  exerciseIds: string[];
  newExercises: NewExerciseProposal[];
  dropped: number;
}

const clean = (s: string | null | undefined, max = 120) => {
  const t = s?.trim().slice(0, max);
  return t ? t : null;
};

export function validateMachineProposal(
  proposal: MachineProposal,
  catalog: ReadonlyMap<string, Exercise>,
): ValidatedProposal {
  const exerciseIds: string[] = [];
  const newExercises: NewExerciseProposal[] = [];
  let dropped = 0;
  const lowerNames = new Map([...catalog.values()].map((e) => [e.name.toLowerCase(), e.id]));

  for (const ex of proposal.exercises.slice(0, 6)) {
    // A "new" exercise that matches a catalogue name exactly is the catalogue one.
    const id = ex.catalog_id ?? lowerNames.get(ex.name.trim().toLowerCase()) ?? null;
    if (id !== null) {
      if (catalog.has(id)) {
        if (!exerciseIds.includes(id)) exerciseIds.push(id);
      } else dropped++;
      continue;
    }
    const name = clean(ex.name);
    const primary = [...new Set(ex.primary_muscles)].slice(0, 4);
    if (!name || primary.length === 0) {
      dropped++;
      continue;
    }
    const vector: Partial<Record<Muscle, number>> = {};
    for (const m of primary) vector[m] = 1;
    for (const m of ex.secondary_muscles.slice(0, 6)) if (vector[m] === undefined) vector[m] = 0.5;
    const muscles = Object.keys(vector).length;
    newExercises.push({
      name,
      pattern: ex.pattern,
      vector,
      kind: muscles >= 3 ? "compound" : "isolation",
    });
  }

  return {
    recognised: proposal.recognised && exerciseIds.length + newExercises.length > 0,
    name: clean(proposal.equipment_name) ?? "Machine",
    type: proposal.equipment_type,
    brand: clean(proposal.brand, 60),
    model: clean(proposal.model, 60),
    notes: clean(proposal.notes, 300),
    exerciseIds,
    newExercises,
    dropped,
  };
}

/** Cache key for a typed machine name. */
export const machineNameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const LOWER_BODY: ReadonlySet<Muscle> = new Set([
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "abductors",
  "calves",
]);

/** Fatigue cost for a custom exercise (EFF-2, HEURISTIC): isolation 0.8, lower compound 1.5, upper 1.2. */
export function customFatigueCost(
  kind: "compound" | "isolation",
  vector: Partial<Record<Muscle, number>>,
): number {
  if (kind === "isolation") return 0.8;
  return Object.keys(vector).some((m) => LOWER_BODY.has(m as Muscle)) ? 1.5 : 1.2;
}
