"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ExercisePicker } from "@/components/exercise-picker";
import { Field, NumberInput, Select, TextInput } from "@/components/forms";
import { Button, Notice } from "@/components/ui";
import type { EquipmentFields } from "@/data/actions";
import { EQUIPMENT_TYPES, type EquipmentType } from "@/data/schema";
import { DEFAULT_CONFIG } from "@/engine/config";
import { matchMachine, proposeExercises, type DictionaryEntry } from "@/engine/registry";
import type { Exercise } from "@/engine/types";
import { EQUIPMENT_TYPE_SHORT } from "@/lib/labels";
import { BRANDS, KEYWORDS } from "@/seed/catalog";

export interface EquipmentDraft extends EquipmentFields {
  exerciseIds: Set<string>;
}

export function emptyDraft(): EquipmentDraft {
  return {
    name: "",
    type: "selectorized",
    brand: null,
    model: null,
    min_kg: 5,
    max_kg: 100,
    increment_kg: 5,
    micro_increment_kg: null,
    notes: null,
    exerciseIds: new Set(),
  };
}

export function validateDraft(d: EquipmentDraft): string | null {
  if (!d.name.trim()) return "Give the machine a name.";
  if (!(d.increment_kg > 0)) return "Increment must be more than 0 kg.";
  if (d.max_kg < d.min_kg) return "Max load must be at least the min load.";
  if (d.exerciseIds.size === 0) return "Link at least one exercise so it can be programmed.";
  return null;
}

/**
 * Machine name → suggested exercises via the keyword dictionary
 * (ALGORITHMS §13). `extraDictionary` holds the user's cached AI answers.
 */
export function useMachineSuggestion(
  name: string,
  extraDictionary: readonly DictionaryEntry[] = [],
) {
  return useMemo(() => {
    if (name.trim().length < 3) return null;
    const matches = matchMachine(
      name,
      [...extraDictionary, ...KEYWORDS],
      BRANDS,
      DEFAULT_CONFIG.matchThreshold,
    );
    if (matches.length === 0) return null;
    return { type: matches[0].entry.equipment_type, exerciseIds: proposeExercises(matches) };
  }, [name, extraDictionary]);
}

export function EquipmentForm({
  draft,
  onChange,
  catalog,
  extraDictionary,
  aiAssist,
}: {
  draft: EquipmentDraft;
  onChange: (d: EquipmentDraft) => void;
  catalog: ReadonlyMap<string, Exercise>;
  extraDictionary?: readonly DictionaryEntry[];
  /** Slot for the "Ask AI" assist (milestone 6). */
  aiAssist?: ReactNode;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const suggestion = useMachineSuggestion(draft.name, extraDictionary);
  const set = <K extends keyof EquipmentDraft>(key: K, value: EquipmentDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const suggestionKey = suggestion ? suggestion.exerciseIds.join(",") : null;
  const showSuggestion =
    suggestion &&
    suggestionKey !== dismissed &&
    suggestion.exerciseIds.some((id) => !draft.exerciseIds.has(id));

  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" hint='As written on the machine, e.g. "Technogym Selection Chest Press"'>
        <TextInput
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          autoComplete="off"
        />
      </Field>

      {showSuggestion && suggestion && (
        <div className="rounded-xl border border-lime-400/30 bg-lime-400/10 p-3 text-sm">
          <p className="text-lime-200">
            Looks like a {EQUIPMENT_TYPE_SHORT[suggestion.type].toLowerCase()} machine for:{" "}
            {suggestion.exerciseIds.map((id) => catalog.get(id)?.name ?? id).join(", ")}.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="primary"
              onClick={() =>
                onChange({
                  ...draft,
                  type: suggestion.type,
                  exerciseIds: new Set([...draft.exerciseIds, ...suggestion.exerciseIds]),
                })
              }
            >
              Use this
            </Button>
            <Button onClick={() => setDismissed(suggestionKey)}>Not it</Button>
          </div>
        </div>
      )}
      {aiAssist}

      <Field label="Type">
        <Select<EquipmentType>
          value={draft.type}
          onChange={(v) => set("type", v)}
          options={EQUIPMENT_TYPES.map((t) => ({ value: t, label: EQUIPMENT_TYPE_SHORT[t] }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min load (kg)">
          <NumberInput
            value={draft.min_kg}
            step={0.5}
            min={0}
            onChange={(v) => set("min_kg", v ?? 0)}
          />
        </Field>
        <Field label="Max load (kg)">
          <NumberInput
            value={draft.max_kg}
            step={0.5}
            min={0}
            onChange={(v) => set("max_kg", v ?? 0)}
          />
        </Field>
        <Field label="Increment (kg)" hint="Stack plate or jump size">
          <NumberInput
            value={draft.increment_kg}
            step={0.25}
            min={0.25}
            onChange={(v) => set("increment_kg", v ?? 0)}
          />
        </Field>
        <Field label="Micro-plate (kg)" hint="Optional add-on weight">
          <NumberInput
            value={draft.micro_increment_kg}
            step={0.25}
            min={0}
            onChange={(v) => set("micro_increment_kg", v && v > 0 ? v : null)}
          />
        </Field>
        <Field label="Brand">
          <TextInput
            value={draft.brand ?? ""}
            onChange={(e) => set("brand", e.target.value || null)}
          />
        </Field>
        <Field label="Model">
          <TextInput
            value={draft.model ?? ""}
            onChange={(e) => set("model", e.target.value || null)}
          />
        </Field>
      </div>
      <Field label="Notes" hint='e.g. "seat height 4"'>
        <TextInput
          value={draft.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
        />
      </Field>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-300">Exercises this machine supports</p>
        <ExercisePicker
          catalog={catalog}
          selected={draft.exerciseIds}
          onChange={(ids) => set("exerciseIds", ids)}
          equipmentType={draft.type}
        />
      </div>
      {draft.exerciseIds.size === 0 && (
        <Notice>
          Link at least one exercise. Can&apos;t find it? Create a custom exercise in Exercises.
        </Notice>
      )}
    </div>
  );
}
