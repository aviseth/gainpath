import type { EquipmentType, Muscle } from "@/data/schema";
import { muscleLabel } from "@/engine/vector";
import type { Exercise } from "@/engine/types";

/** Display labels shared by screens. */

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  selectorized: "Selectorized machines",
  plate_loaded: "Plate-loaded machines",
  cable_station: "Cable stations",
  free_weights: "Free weights",
  bench_rack: "Benches & racks",
  bodyweight_station: "Bodyweight stations",
};

export const EQUIPMENT_TYPE_SHORT: Record<EquipmentType, string> = {
  selectorized: "Selectorized",
  plate_loaded: "Plate-loaded",
  cable_station: "Cable",
  free_weights: "Free weights",
  bench_rack: "Bench / rack",
  bodyweight_station: "Bodyweight",
};

export const humanize = (s: string) => s.replace(/_/g, " ");
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function primaryMuscles(e: Pick<Exercise, "vector">): Muscle[] {
  return (Object.keys(e.vector) as Muscle[]).filter((m) => e.vector[m] === 1);
}

export function secondaryMuscles(e: Pick<Exercise, "vector">): Muscle[] {
  return (Object.keys(e.vector) as Muscle[]).filter((m) => e.vector[m] === 0.5);
}

export function musclesText(e: Pick<Exercise, "vector">): string {
  const primary = primaryMuscles(e).map(muscleLabel).join(", ");
  const secondary = secondaryMuscles(e).map(muscleLabel).join(", ");
  return secondary ? `${primary} · ${secondary}` : primary;
}

export function formatKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return "–";
  return `${Number(kg.toFixed(2))} kg`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
