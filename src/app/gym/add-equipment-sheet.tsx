"use client";

import { useState } from "react";
import { Segmented, Sheet } from "@/components/forms";
import { Button, Notice } from "@/components/ui";
import { addEquipment, addFromTemplate } from "@/data/actions";
import type { GymContext } from "@/hooks/use-data";
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
          <Button onClick={onClose}>Done</Button>
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
          <p className="text-sm text-zinc-400">
            Tap to add. Each item is a starting point you can edit afterwards (exact weights, linked
            exercises).
          </p>
          {added.length > 0 && <Notice tone="success">Added: {added.join(", ")}</Notice>}
          {Object.entries(EQUIPMENT_TYPE_LABELS).map(([type, label]) => {
            const items = EQUIPMENT_TEMPLATES.filter((t) => t.type === type);
            if (items.length === 0) return null;
            return (
              <section key={type}>
                <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{label}</h3>
                <ul className="flex flex-col gap-1">
                  {items.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="flex min-h-12 w-full items-center justify-between rounded-xl border border-zinc-800 px-3 text-left"
                        onClick={async () => {
                          await addFromTemplate(gymId, t);
                          setAdded((a) => [...a, t.name]);
                        }}
                      >
                        <span>{t.name}</span>
                        <span className="font-semibold underline underline-offset-4">+ Add</span>
                      </button>
                    </li>
                  ))}
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
