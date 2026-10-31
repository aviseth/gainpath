"use client";

import { useState } from "react";
import { Badge, Field, Sheet, TextInput } from "@/components/forms";
import { StarIcon } from "@/components/icons";
import { PatternSchematic } from "@/components/schematics";
import { Button, Notice } from "@/components/ui";
import { setPreference } from "@/data/actions";
import { repo } from "@/data/repo";
import { muscleLabel } from "@/engine/vector";
import type { Exercise } from "@/engine/types";
import type { GymContext } from "@/hooks/use-data";
import {
  capitalize,
  EQUIPMENT_TYPE_SHORT,
  humanize,
  primaryMuscles,
  secondaryMuscles,
} from "@/lib/labels";

export function ExerciseSheet({
  exercise: e,
  available,
  ctx,
  onClose,
}: {
  exercise: Exercise;
  available: boolean;
  ctx: GymContext;
  onClose: () => void;
}) {
  const favourite = ctx.favouriteExercises.has(e.id);
  const excluded = ctx.excludedExercises.has(e.id);
  const pref = ctx.prefs.find((p) => p.kind === "exclude" && p.exercise_id === e.id);
  const [reason, setReason] = useState(pref?.reason ?? "");
  const machines = ctx.equipment.filter((eq) =>
    ctx.links.some((l) => l.equipment_id === eq.id && l.exercise_id === e.id),
  );

  return (
    <Sheet title={e.name} onClose={onClose}>
      <div className="flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-surface-container-highest text-on-surface-variant">
          <PatternSchematic pattern={e.pattern} size={56} />
        </span>
        <div className="flex flex-wrap gap-2">
          <Badge>{capitalize(e.kind)}</Badge>
          <Badge>{capitalize(humanize(e.pattern))}</Badge>
          {e.custom && <Badge>Custom</Badge>}
          {available ? (
            <Badge tone="good">Available here</Badge>
          ) : (
            <Badge tone="warn">Not available here</Badge>
          )}
        </div>
      </div>

      <section className="rounded-card bg-surface-container-low p-5 text-sm leading-relaxed">
        <p>
          <span className="text-on-surface-variant">Prime movers (1 set each): </span>
          {primaryMuscles(e).map(muscleLabel).join(", ")}
        </p>
        {secondaryMuscles(e).length > 0 && (
          <p className="mt-1">
            <span className="text-on-surface-variant">Synergists (½ set each): </span>
            {secondaryMuscles(e).map(muscleLabel).join(", ")}
          </p>
        )}
        <p className="mt-2 text-xs text-on-surface-variant">
          Volume is counted fractionally (VOL-2).
        </p>
        <p className="mt-2">
          <span className="text-on-surface-variant">Needs: </span>
          {e.equipment_types.length === 0
            ? "no equipment"
            : e.equipment_types.map((t) => EQUIPMENT_TYPE_SHORT[t]).join(" + ")}
        </p>
        {machines.length > 0 && (
          <p className="mt-1">
            <span className="text-on-surface-variant">On: </span>
            {machines.map((m) => m.name).join(", ")}
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={favourite ? "tonal" : "secondary"}
          onClick={() => void setPreference({ exerciseId: e.id }, "favourite", !favourite)}
          aria-pressed={favourite}
        >
          <StarIcon filled={favourite} size={18} />
          Favourite
        </Button>
        <Button
          variant={excluded ? "danger" : "secondary"}
          onClick={() =>
            void setPreference({ exerciseId: e.id }, "exclude", !excluded, reason || null)
          }
        >
          {excluded ? "Excluded" : "Exclude"}
        </Button>
      </div>
      {excluded && (
        <>
          <Notice>Never programmed while excluded. Tap Excluded to bring it back.</Notice>
          <Field label="Reason (optional)">
            <TextInput
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              onBlur={() =>
                void setPreference({ exerciseId: e.id }, "exclude", true, reason || null)
              }
            />
          </Field>
        </>
      )}

      {e.custom && (
        <Button
          variant="danger"
          onClick={async () => {
            if (!window.confirm(`Delete ${e.name}? Logged sets are kept.`)) return;
            await repo("exercises").remove(e.id);
            onClose();
          }}
        >
          Delete custom exercise
        </Button>
      )}
    </Sheet>
  );
}
