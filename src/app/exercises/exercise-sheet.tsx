"use client";

import { useState } from "react";
import { Badge, Field, Sheet, TextInput } from "@/components/forms";
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

      <section className="border-t-2 border-zinc-100 pt-3 text-sm">
        <p>
          <span className="text-zinc-400">Prime movers (1 set each): </span>
          {primaryMuscles(e).map(muscleLabel).join(", ")}
        </p>
        {secondaryMuscles(e).length > 0 && (
          <p className="mt-1">
            <span className="text-zinc-400">Synergists (½ set each): </span>
            {secondaryMuscles(e).map(muscleLabel).join(", ")}
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500">Volume is counted fractionally (VOL-2).</p>
        <p className="mt-2">
          <span className="text-zinc-400">Needs: </span>
          {e.equipment_types.length === 0
            ? "no equipment"
            : e.equipment_types.map((t) => EQUIPMENT_TYPE_SHORT[t]).join(" + ")}
        </p>
        {machines.length > 0 && (
          <p className="mt-1">
            <span className="text-zinc-400">On: </span>
            {machines.map((m) => m.name).join(", ")}
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={favourite ? "primary" : "secondary"}
          onClick={() => void setPreference({ exerciseId: e.id }, "favourite", !favourite)}
        >
          {favourite ? "★ Favourite" : "☆ Favourite"}
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
