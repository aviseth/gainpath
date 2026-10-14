import type { Muscle } from "@/data/schema";
import type { Selection } from "./builder";
import type { Config } from "./config";
import type { Exercise } from "./types";

/**
 * Anchor lifts (ALGORITHMS §8, HEURISTIC): per region, one compound stays in
 * place for a mesocycle so progression is measurable (PROG-1). Accessories
 * rotate freely.
 */

export const ANCHOR_REGIONS = {
  chest: ["chest"],
  back: ["lats", "upper_back"],
  shoulders: ["front_delt", "side_delt"],
  quads: ["quads"],
  posterior_chain: ["hamstrings", "glutes"],
} as const satisfies Record<string, readonly Muscle[]>;

export type AnchorRegion = keyof typeof ANCHOR_REGIONS;

export function anchorRegion(exercise: Exercise): AnchorRegion | null {
  if (exercise.kind !== "compound") return null;
  for (const [region, muscles] of Object.entries(ANCHOR_REGIONS) as [
    AnchorRegion,
    readonly Muscle[],
  ][]) {
    if (muscles.some((m) => exercise.vector[m] === 1)) return region;
  }
  return null;
}

export interface AnchorState {
  region: AnchorRegion;
  exerciseId: string;
  equipmentId: string | null;
  mesocycleStart: number;
}

export type AnchorInvalidReason = "excluded" | "broken" | "plateau" | "expired";

/**
 * Keep valid anchors; fill empty regions from today's selected compounds
 * (they are already ordered by the builder's scoring, so the first wins).
 */
export function updateAnchors(params: {
  current: readonly AnchorState[];
  selections: readonly Selection[];
  now: number;
  /** Why an anchor can no longer stand (excluded, equipment broken > N days, plateau), or null. */
  invalid: (anchor: AnchorState) => Exclude<AnchorInvalidReason, "expired"> | null;
  cfg: Config;
}): {
  anchors: AnchorState[];
  replaced: Array<{ anchor: AnchorState; reason: AnchorInvalidReason }>;
} {
  const mesocycleMs = params.cfg.mesocycleWeeks * 7 * 24 * 3600_000;
  const anchors: AnchorState[] = [];
  const replaced: Array<{ anchor: AnchorState; reason: AnchorInvalidReason }> = [];
  for (const anchor of params.current) {
    const reason: AnchorInvalidReason | null =
      params.now - anchor.mesocycleStart >= mesocycleMs ? "expired" : params.invalid(anchor);
    if (reason) replaced.push({ anchor, reason });
    else anchors.push(anchor);
  }
  const mesocycleStart = anchors[0]?.mesocycleStart ?? params.now;
  for (const { candidate } of params.selections) {
    const region = anchorRegion(candidate.exercise);
    if (!region || anchors.some((a) => a.region === region)) continue;
    anchors.push({
      region,
      exerciseId: candidate.exercise.id,
      equipmentId: candidate.equipment?.id ?? null,
      mesocycleStart,
    });
  }
  return { anchors, replaced };
}
