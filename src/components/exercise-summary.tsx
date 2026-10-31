"use client";

import { BODYWEIGHT_EQUIPMENT_ID } from "@/engine/availability";
import type { LiveExercise } from "@/engine/session";
import type { Equipment, Exercise } from "@/engine/types";
import { formatKg } from "@/lib/labels";
import { Badge } from "./forms";
import { CheckIcon } from "./icons";
import { PatternSchematic, SchematicTile } from "./schematics";

/** Full target, e.g. "3 × 8 @ 25 kg · range 8–12 · 1–3 RIR". */
export function targetText(e: LiveExercise): string {
  const reps = e.timed ? `${e.targetReps}s` : `${e.targetReps}`;
  const range = e.timed
    ? `${e.repRange[0]}–${e.repRange[1]}s`
    : `${e.repRange[0]}–${e.repRange[1]}`;
  const load =
    e.currentWeightKg !== null && e.currentWeightKg > 0 ? ` @ ${formatKg(e.currentWeightKg)}` : "";
  return `${e.setsTarget} × ${reps}${load} · range ${range} · ${e.rirRange[0]}–${e.rirRange[1]} RIR`;
}

/** Plain-language headline target, e.g. "3 sets of 8 · 25 kg". */
export function plainTarget(e: LiveExercise): string {
  const reps = e.timed ? `${e.targetReps}s` : `${e.targetReps}`;
  const sets = `${e.setsTarget} set${e.setsTarget === 1 ? "" : "s"} of ${reps}`;
  return e.currentWeightKg !== null && e.currentWeightKg > 0
    ? `${sets} · ${formatKg(e.currentWeightKg)}`
    : sets;
}

/** The secondary detail: range and effort, kept available but quiet. */
export function detailText(e: LiveExercise): string {
  const range = e.timed
    ? `${e.repRange[0]}–${e.repRange[1]}s`
    : `${e.repRange[0]}–${e.repRange[1]} reps`;
  return `${range} · ${e.rirRange[0]}–${e.rirRange[1]} RIR`;
}

export function equipmentName(e: LiveExercise, equipment: ReadonlyMap<string, Equipment>): string {
  if (e.equipmentId === BODYWEIGHT_EQUIPMENT_ID) return "No equipment";
  return equipment.get(e.equipmentId)?.name ?? "Unknown machine";
}

/**
 * One exercise as an M3 list row: schematic tile, name, plain target and a
 * muted second line. Only the anchor gets the coloured tile and chip, so it
 * stands out from the rest (Von Restorff).
 */
export function ExerciseSummary({
  e,
  exercise,
  equipment,
  lead = e.isAnchor,
  compact = false,
}: {
  e: LiveExercise;
  exercise: Exercise | undefined;
  equipment: ReadonlyMap<string, Equipment>;
  /**
   * The one anchor that gets the coloured tile and chip. The engine keeps an
   * anchor per region, so the rest stay neutral and the lead one stands out.
   */
  lead?: boolean;
  /**
   * Today's list: equipment on one line plus a small "first time" note. The
   * session card shows the full range, effort and estimate line.
   */
  compact?: boolean;
}) {
  const muted = e.status === "skipped" || e.status === "swapped_out";
  const done = e.status === "done";
  return (
    <div className={`flex items-center gap-3.5 ${muted ? "opacity-60" : ""}`}>
      <SchematicTile highlight={lead && !muted}>
        {exercise ? (
          <PatternSchematic pattern={exercise.pattern} />
        ) : (
          <span className="h-[34px] w-[34px]" />
        )}
      </SchematicTile>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`text-title ${muted ? "line-through" : ""}`}>
          {exercise?.name ?? e.exerciseId}
        </span>
        {!muted && <span className="text-[13px] text-on-surface-variant">{plainTarget(e)}</span>}
        {compact ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-on-surface-variant/80">
            <span className="truncate">{equipmentName(e, equipment)}</span>
            {!muted && e.estimate && (
              <span className="shrink-0 rounded-chip bg-surface-container-highest px-1.5 py-px font-medium text-on-surface-variant">
                first time
              </span>
            )}
          </span>
        ) : (
          <>
            <span className="truncate text-xs text-on-surface-variant/80">
              {equipmentName(e, equipment)}
            </span>
            {!muted && (
              <span className="text-xs text-on-surface-variant/80">
                {detailText(e)}
                {e.estimate && ` · first time · estimate ±${e.estimate.uncertaintyPct}%`}
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {e.isAnchor && !muted && <Badge tone={lead ? "accent" : "neutral"}>Anchor</Badge>}
        {e.calibration && !muted && <Badge>Calibration</Badge>}
        {done && (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container text-on-primary-container"
            aria-label="Done"
            role="img"
          >
            <CheckIcon size={16} />
          </span>
        )}
        {e.status === "skipped" && <Badge>Skipped</Badge>}
        {e.status === "swapped_out" && <Badge>Swapped</Badge>}
      </div>
    </div>
  );
}
