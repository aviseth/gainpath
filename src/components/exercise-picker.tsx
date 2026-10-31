"use client";

import { useMemo, useState } from "react";
import type { EquipmentType } from "@/data/schema";
import type { Exercise } from "@/engine/types";
import { musclesText } from "@/lib/labels";
import { searchExercises } from "@/lib/search";
import { Chip, TextInput } from "./forms";

/**
 * Multi-select of exercises a machine supports. Exercises whose primary
 * equipment type matches the machine are listed first.
 */
export function ExercisePicker({
  catalog,
  selected,
  onChange,
  equipmentType,
}: {
  catalog: ReadonlyMap<string, Exercise>;
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  equipmentType?: EquipmentType;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const all = useMemo(() => [...catalog.values()], [catalog]);
  const matchesType = (e: Exercise) => !equipmentType || e.equipment_types[0] === equipmentType;
  const pool = showAll || query ? all : all.filter(matchesType);
  const results = searchExercises(query, pool, 60);
  const chosen = all.filter((e) => selected.has(e.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Linked exercises">
          {chosen.map((e) => (
            <Chip key={e.id} active onClick={() => toggle(e.id)}>
              {e.name} ×
            </Chip>
          ))}
        </div>
      )}
      <TextInput
        placeholder="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search exercises"
      />
      {equipmentType && !query && (
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show exercises for other equipment types
        </label>
      )}
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {results.map((e) => (
          <li key={e.id}>
            <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-surface-container-low px-4 py-2">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-primary"
                checked={selected.has(e.id)}
                onChange={() => toggle(e.id)}
              />
              <span className="flex flex-col">
                <span>{e.name}</span>
                <span className="text-xs text-on-surface-variant">{musclesText(e)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
