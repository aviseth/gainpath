"use client";

import { useState } from "react";
import { Segmented, Sheet } from "@/components/forms";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { EquipmentSchematic, MachineSchematic, machinePattern } from "@/components/schematics";
import { Button, Notice } from "@/components/ui";
import { addEquipment, addFromTemplate } from "@/data/actions";
import type { GymContext } from "@/hooks/use-data";
import type { EquipmentType } from "@/data/schema";
import { EQUIPMENT_TYPE_LABELS } from "@/lib/labels";
import { EQUIPMENT_TEMPLATES } from "@/seed/catalog";
import {
  EquipmentForm,
  draftFields,
  emptyDraft,
  validateDraft,
  type EquipmentDraft,
} from "./equipment-form";
import { MachineAssist, useCachedDictionary } from "./machine-assist";

/** Add gear quickly: a template (one tap) or a custom machine (under a minute). */
export function AddEquipmentSheet({
  gymId,
  ctx,
  onClose,
}: {
  gymId: string;
  ctx: GymContext;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"templates" | "custom">("templates");
  const [draft, setDraft] = useState<EquipmentDraft>(emptyDraft);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cached = useCachedDictionary();

  async function saveCustom() {
    const problem = validateDraft(draft);
    if (problem) return setError(problem);
    await addEquipment(gymId, draftFields(draft), [...draft.exerciseIds]);
    onClose();
  }

  return (
    <Sheet
      title="Add equipment"
      onClose={onClose}
      footer={
        mode === "custom" ? (
          <Button variant="primary" onClick={saveCustom}>
            Save machine
          </Button>
        ) : (
          <Button variant="tonal" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      <Segmented
        label="Add from"
        value={mode}
        onChange={setMode}
        options={[
          { value: "templates", label: "Common gear" },
          { value: "custom", label: "Custom machine" },
        ]}
      />

      {mode === "templates" && (
        <>
          <p className="px-1 text-sm text-on-surface-variant">
            Tap to add. Each item is a starting point you can edit afterwards (exact weights, linked
            exercises).
          </p>
          {added.length > 0 && <Notice tone="success">Added: {added.join(", ")}</Notice>}
          {Object.entries(EQUIPMENT_TYPE_LABELS).map(([type, label]) => {
            const items = EQUIPMENT_TEMPLATES.filter((t) => t.type === type);
            if (items.length === 0) return null;
            return (
              <section key={type} className="rounded-card bg-surface-container-low py-2">
                <h3 className="flex items-center gap-3 px-4 pt-2 pb-1 text-title">
                  <EquipmentSchematic
                    type={type as EquipmentType}
                    size={24}
                    className="text-on-surface-variant"
                  />
                  {label}
                </h3>
                <ul className="flex flex-col">
                  {items.map((t) => {
                    const count = added.filter((n) => n === t.name).length;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left hover:bg-on-surface/5"
                          onClick={async () => {
                            await addFromTemplate(gymId, t);
                            setAdded((a) => [...a, t.name]);
                          }}
                        >
                          <span className="flex items-center gap-3">
                            <MachineSchematic
                              type={t.type}
                              pattern={machinePattern(t.exercise_ids, ctx.catalog)}
                              size={26}
                              className="shrink-0 text-on-surface-variant"
                            />
                            {t.name}
                          </span>
                          <span
                            className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold ${
                              count > 0
                                ? "bg-primary-container text-on-primary-container"
                                : "bg-secondary-container text-on-secondary-container"
                            }`}
                          >
                            {count > 0 ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
                            {count > 0 ? `Added${count > 1 ? ` ×${count}` : ""}` : "Add"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {mode === "custom" && (
        <>
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
        </>
      )}
    </Sheet>
  );
}
