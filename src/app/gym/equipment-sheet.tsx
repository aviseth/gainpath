"use client";

import { useState } from "react";
import { Field, Segmented, Sheet, TextInput } from "@/components/forms";
import { StarIcon } from "@/components/icons";
import { MachineSchematic, machinePattern } from "@/components/schematics";
import { Button, Notice } from "@/components/ui";
import {
  removeEquipment,
  setEquipmentStatus,
  setLinkedExercises,
  setPreference,
  updateEquipment,
} from "@/data/actions";
import type { Equipment } from "@/data/schema";
import type { GymContext } from "@/hooks/use-data";
import { EQUIPMENT_TYPE_SHORT, formatDate } from "@/lib/labels";
import { formatWeights } from "@/lib/weights";
import { EquipmentForm, draftFields, validateDraft, type EquipmentDraft } from "./equipment-form";
import { MachineAssist, useCachedDictionary } from "./machine-assist";

export function EquipmentSheet({
  equipment,
  ctx,
  onClose,
}: {
  equipment: Equipment;
  ctx: GymContext;
  onClose: () => void;
}) {
  const linked = ctx.allLinks
    .filter((l) => l.equipment_id === equipment.id)
    .map((l) => l.exercise_id);
  const [draft, setDraft] = useState<EquipmentDraft>({
    name: equipment.name,
    type: equipment.type,
    brand: equipment.brand,
    model: equipment.model,
    min_kg: equipment.min_kg,
    max_kg: equipment.max_kg,
    increment_kg: equipment.increment_kg,
    micro_increment_kg: equipment.micro_increment_kg,
    notes: equipment.notes,
    exerciseIds: new Set(linked),
    weightsText: formatWeights(equipment.weights_kg),
  });
  const [reason, setReason] = useState(equipment.status_reason ?? "");
  const excludePref = ctx.prefs.find(
    (p) => p.kind === "exclude" && p.equipment_id === equipment.id,
  );
  const [excludeReason, setExcludeReason] = useState(excludePref?.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const cached = useCachedDictionary();
  const favourite = ctx.favouriteEquipment.has(equipment.id);
  const excluded = ctx.excludedEquipment.has(equipment.id);

  async function save() {
    const problem = validateDraft(draft);
    if (problem) return setError(problem);
    await updateEquipment(equipment.id, draftFields(draft));
    await setLinkedExercises(equipment.id, [...draft.exerciseIds]);
    onClose();
  }

  return (
    <Sheet
      title={equipment.name}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={save}>
          Save changes
        </Button>
      }
    >
      <div className="flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-surface-container-highest text-on-surface-variant">
          <MachineSchematic
            type={draft.type}
            pattern={machinePattern(draft.exerciseIds, ctx.catalog)}
            size={56}
          />
        </span>
        <span className="flex flex-col text-sm text-on-surface-variant">
          <span className="text-title text-on-surface">{EQUIPMENT_TYPE_SHORT[draft.type]}</span>
          {[equipment.brand, equipment.model].filter(Boolean).join(" ") || "Brand not set"}
        </span>
      </div>
      <Field label="Status">
        <Segmented
          label="Status"
          value={equipment.status}
          onChange={(status) => void setEquipmentStatus(equipment.id, status, reason || null)}
          options={[
            { value: "active", label: "Active" },
            { value: "broken", label: "Broken" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </Field>
      {equipment.status === "broken" && (
        <Notice>
          Broken{equipment.broken_since ? ` since ${formatDate(equipment.broken_since)}` : ""}. It
          won&apos;t be programmed until you mark it active again.
        </Notice>
      )}
      {equipment.status !== "active" && (
        <Field label="Reason (optional)">
          <TextInput
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => void updateEquipment(equipment.id, { status_reason: reason || null })}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={favourite ? "tonal" : "secondary"}
          onClick={() => void setPreference({ equipmentId: equipment.id }, "favourite", !favourite)}
          aria-pressed={favourite}
        >
          <StarIcon filled={favourite} size={18} />
          Favourite
        </Button>
        <Button
          variant={excluded ? "danger" : "secondary"}
          onClick={() =>
            void setPreference(
              { equipmentId: equipment.id },
              "exclude",
              !excluded,
              excludeReason || null,
            )
          }
        >
          {excluded ? "Excluded" : "Exclude"}
        </Button>
      </div>
      {excluded && (
        <Field
          label="Why excluded? (optional)"
          hint="Excluded equipment is never programmed. Tap Excluded to undo."
        >
          <TextInput
            value={excludeReason}
            onChange={(e) => setExcludeReason(e.target.value)}
            onBlur={() =>
              void setPreference(
                { equipmentId: equipment.id },
                "exclude",
                true,
                excludeReason || null,
              )
            }
          />
        </Field>
      )}

      <EquipmentForm
        draft={draft}
        onChange={(d) => {
          setDraft(d);
          setError(null);
        }}
        catalog={ctx.catalog}
        extraDictionary={cached}
        aiAssist={<MachineAssist draft={draft} onApply={setDraft} catalog={ctx.catalog} />}
      />
      {error && <Notice tone="error">{error}</Notice>}

      <Button
        variant="danger"
        onClick={async () => {
          if (!window.confirm(`Remove ${equipment.name}? Its training history is kept.`)) return;
          await removeEquipment(equipment.id);
          onClose();
        }}
      >
        Remove from gym
      </Button>
    </Sheet>
  );
}
