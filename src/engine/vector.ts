import { MUSCLES, type Muscle } from "@/data/schema";
import type { Vector } from "./types";

/** Muscle-stimulus vector maths (VOL-2 fractional sets). */

export function dot(a: Vector, b: Vector): number {
  let sum = 0;
  for (const m of MUSCLES) sum += (a[m] ?? 0) * (b[m] ?? 0);
  return sum;
}

export function norm(a: Vector): number {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity; 0 if either vector is empty. */
export function cosine(a: Vector, b: Vector): number {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot(a, b) / d;
}

export function scale(a: Vector, k: number): Vector {
  const out: Vector = {};
  for (const m of MUSCLES) if (a[m]) out[m] = (a[m] ?? 0) * k;
  return out;
}

export function add(...vectors: Vector[]): Vector {
  const out: Vector = {};
  for (const v of vectors) for (const m of MUSCLES) if (v[m]) out[m] = (out[m] ?? 0) + (v[m] ?? 0);
  return out;
}

export function subtract(a: Vector, b: Vector): Vector {
  const out: Vector = {};
  for (const m of MUSCLES) {
    const d = (a[m] ?? 0) - (b[m] ?? 0);
    if (d !== 0) out[m] = d;
  }
  return out;
}

export function l1(a: Vector): number {
  let sum = 0;
  for (const m of MUSCLES) sum += Math.abs(a[m] ?? 0);
  return sum;
}

export function muscles(a: Vector): Muscle[] {
  return MUSCLES.filter((m) => (a[m] ?? 0) > 0);
}

const LABELS: Record<Muscle, string> = {
  chest: "chest",
  front_delt: "front delts",
  side_delt: "side delts",
  rear_delt: "rear delts",
  lats: "lats",
  upper_back: "upper back",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  adductors: "adductors",
  abductors: "abductors",
  calves: "calves",
  abs: "abs",
};

export function muscleLabel(m: Muscle): string {
  return LABELS[m];
}

/**
 * Human summary of `option - target`, e.g. "+ more glutes, – less quads"
 * (ALGORITHMS §12). Differences under `threshold` sets are ignored.
 */
export function describeDiff(diff: Vector, threshold = 0.5): string {
  const more = MUSCLES.filter((m) => (diff[m] ?? 0) >= threshold).map(muscleLabel);
  const less = MUSCLES.filter((m) => (diff[m] ?? 0) <= -threshold).map(muscleLabel);
  const parts: string[] = [];
  if (more.length) parts.push(`+ more ${more.join(", ")}`);
  if (less.length) parts.push(`– less ${less.join(", ")}`);
  return parts.length ? parts.join(", ") : "Same muscles";
}
