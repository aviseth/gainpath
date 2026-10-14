"use client";

import { BODYWEIGHT_EQUIPMENT_ID } from "@/engine/availability";
import type { LiveExercise } from "@/engine/session";
import type { Equipment, Exercise } from "@/engine/types";
import { formatKg } from "@/lib/labels";
import { Badge } from "./forms";

export function targetText(e: LiveExercise): string {
  const reps = e.timed ? `${e.targetReps}s` : `${e.targetReps}`;
  const range = e.timed
    ? `${e.repRange[0]}–${e.repRange[1]}s`
    : `${e.repRange[0]}–${e.repRange[1]}`;
  const load =
    e.currentWeightKg !== null && e.currentWeightKg > 0 ? ` @ ${formatKg(e.currentWeightKg)}` : "";
  return `${e.setsTarget} × ${reps}${load} · range ${range} · ${e.rirRange[0]}–${e.rirRange[1]} RIR`;
}

export function equipmentName(e: LiveExercise, equipment: ReadonlyMap<string, Equipment>): string {
  if (e.equipmentId === BODYWEIGHT_EQUIPMENT_ID) return "No equipment";
  return equipment.get(e.equipmentId)?.name ?? "Unknown machine";
}

export function ExerciseSummary({
  e,
  exercise,
  equipment,
}: {
  e: LiveExercise;
  exercise: Exercise | undefined;
  equipment: ReadonlyMap<string, Equipment>;
}) {
  const muted = e.status === "skipped" || e.status === "swapped_out";
  return (
    <div className={`flex flex-col gap-1 ${muted ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-semibold ${muted ? "line-through" : ""}`}>
          {exercise?.name ?? e.exerciseId}
        </span>
        {e.isAnchor && <Badge>Anchor</Badge>}
        {e.calibration && <Badge tone="warn">Calibration</Badge>}
        {e.estimate && <Badge tone="warn">New machine ±{e.estimate.uncertaintyPct}%</Badge>}
        {e.status === "done" && <Badge tone="good">Done</Badge>}
        {e.status === "skipped" && <Badge>Skipped</Badge>}
        {e.status === "swapped_out" && <Badge>Swapped</Badge>}
      </div>
      <span className="text-xs text-zinc-500">{equipmentName(e, equipment)}</span>
      {!muted && <span className="text-sm text-zinc-300">{targetText(e)}</span>}
    </div>
  );
}
