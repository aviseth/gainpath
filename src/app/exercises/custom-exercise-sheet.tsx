"use client";

import { useState } from "react";
import { Chip, Field, NumberInput, Segmented, Select, Sheet, TextInput } from "@/components/forms";
import { PatternSchematic, SchematicTile } from "@/components/schematics";
import { Button, Notice } from "@/components/ui";
import { createCustomExercise } from "@/data/actions";
import {
  EQUIPMENT_TYPES,
  MOVEMENT_PATTERNS,
  MUSCLES,
  type EquipmentType,
  type MovementPattern,
  type Muscle,
} from "@/data/schema";
import { customFatigueCost } from "@/engine/machine-proposal";
import { muscleLabel } from "@/engine/vector";
import { capitalize, EQUIPMENT_TYPE_SHORT, humanize } from "@/lib/labels";

/** A custom exercise needs a muscle mapping: swaps and volume counting depend on it (VOL-2). */
export function CustomExerciseSheet({
  onClose,
  onCreated,
  initialName = "",
  initialType = "selectorized",
}: {
  onClose: () => void;
  onCreated?: (id: string) => void;
  initialName?: string;
  initialType?: EquipmentType;
}) {
  const [name, setName] = useState(initialName);
  const [pattern, setPattern] = useState<MovementPattern>("horizontal_push");
  const [kind, setKind] = useState<"compound" | "isolation">("isolation");
  const [weights, setWeights] = useState<Partial<Record<Muscle, 1 | 0.5>>>({});
  const [type, setType] = useState<EquipmentType>(initialType);
  const [low, setLow] = useState<number | null>(10);
  const [high, setHigh] = useState<number | null>(15);
  const [error, setError] = useState<string | null>(null);

  // Cycle: none → prime mover (1.0) → synergist (0.5) → none.
  const cycle = (m: Muscle) =>
    setWeights((w) => {
      const next = { ...w };
      if (next[m] === undefined) next[m] = 1;
      else if (next[m] === 1) next[m] = 0.5;
      else delete next[m];
      return next;
    });

  async function save() {
    if (!name.trim()) return setError("Name the exercise.");
    if (!Object.values(weights).includes(1))
      return setError("Pick at least one prime mover (tap a muscle once).");
    if (!low || !high || low > high) return setError("Check the rep range.");
    const exercise = await createCustomExercise({
      name: name.trim(),
      pattern,
      vector: weights,
      kind,
      equipment_types: [type],
      fatigue_cost: customFatigueCost(kind, weights),
      rep_range: {
        strength: [Math.max(1, low - 4), Math.max(1, high - 4)],
        hypertrophy: [low, high],
      },
    });
    onCreated?.(exercise.id);
    onClose();
  }

  return (
    <Sheet
      title="New custom exercise"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={save}>
          Save exercise
        </Button>
      }
    >
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Type">
        <Segmented
          label="Type"
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (k === "compound") {
              setLow(6);
              setHigh(12);
            } else {
              setLow(10);
              setHigh(15);
            }
          }}
          options={[
            { value: "compound", label: "Compound" },
            { value: "isolation", label: "Isolation" },
          ]}
        />
      </Field>
      <div>
        <p className="mb-1 px-1 text-sm font-medium text-on-surface-variant">Muscles worked</p>
        <p className="mb-2 px-1 text-xs text-on-surface-variant">
          Tap once for a prime mover (counts 1 set), twice for a synergist (½ set), three times to
          clear.
        </p>
        <div className="flex flex-wrap gap-2">
          {MUSCLES.map((m) => (
            <Chip key={m} active={weights[m] !== undefined} onClick={() => cycle(m)}>
              {muscleLabel(m)}
              {weights[m] === 1 ? " · 1" : weights[m] === 0.5 ? " · ½" : ""}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Movement pattern">
            <Select<MovementPattern>
              value={pattern}
              onChange={setPattern}
              options={MOVEMENT_PATTERNS.map((p) => ({ value: p, label: capitalize(humanize(p)) }))}
            />
          </Field>
        </div>
        <SchematicTile>
          <PatternSchematic pattern={pattern} />
        </SchematicTile>
      </div>
      <Field label="Equipment type">
        <Select<EquipmentType>
          value={type}
          onChange={setType}
          options={EQUIPMENT_TYPES.map((t) => ({ value: t, label: EQUIPMENT_TYPE_SHORT[t] }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reps from">
          <NumberInput value={low} min={1} onChange={setLow} />
        </Field>
        <Field label="Reps to">
          <NumberInput value={high} min={1} onChange={setHigh} />
        </Field>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </Sheet>
  );
}
