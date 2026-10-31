"use client";

import { useMemo, useState } from "react";
import { Badge, Chip, EmptyState, TextInput } from "@/components/forms";
import { ChevronRightIcon, PlusIcon, StarIcon } from "@/components/icons";
import { PatternSchematic, SchematicTile } from "@/components/schematics";
import { Button, PageHeader } from "@/components/ui";
import { availableCandidates } from "@/engine/availability";
import type { Exercise } from "@/engine/types";
import { useGymContext } from "@/hooks/use-data";
import { musclesText } from "@/lib/labels";
import { searchExercises } from "@/lib/search";
import { CustomExerciseSheet } from "./custom-exercise-sheet";
import { ExerciseSheet } from "./exercise-sheet";

type Filter = "gym" | "all" | "favourites" | "excluded" | "custom";

export function ExercisesScreen() {
  const ctx = useGymContext();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("gym");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const available = useMemo(() => {
    if (!ctx) return new Set<string>();
    return new Set(
      availableCandidates({
        catalog: [...ctx.catalog.values()],
        equipment: ctx.equipment,
        links: ctx.links,
        excludedEquipment: ctx.excludedEquipment,
      }).map((c) => c.exercise.id),
    );
  }, [ctx]);

  if (!ctx) return <p className="px-1 text-on-surface-variant">Loading…</p>;
  const all = [...ctx.catalog.values()];
  const pool: Exercise[] = {
    gym: all.filter((e) => available.has(e.id)),
    all,
    favourites: all.filter((e) => ctx.favouriteExercises.has(e.id)),
    excluded: all.filter((e) => ctx.excludedExercises.has(e.id)),
    custom: all.filter((e) => e.custom),
  }[filter];
  const results = searchExercises(query, pool, 200);
  const openExercise = open ? ctx.catalog.get(open) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Exercises" />
      <TextInput
        placeholder="Search by name, e.g. pec deck"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search exercises"
      />
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["gym", `At ${ctx.gym?.name ?? "this gym"}`],
            ["all", "All"],
            ["favourites", "Favourites"],
            ["excluded", "Excluded"],
            ["custom", "Custom"],
          ] as const
        ).map(([value, label]) => (
          <Chip key={value} active={filter === value} onClick={() => setFilter(value)}>
            {label}
          </Chip>
        ))}
      </div>
      <Button variant="tonal" onClick={() => setCreating(true)}>
        <PlusIcon size={18} />
        New custom exercise
      </Button>

      {results.length === 0 ? (
        <EmptyState>
          {filter === "gym"
            ? "Nothing available here yet: register equipment in My gym."
            : "No exercises match."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col rounded-card bg-surface-container-low py-2">
          {results.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setOpen(e.id)}
                className={`flex min-h-[4.25rem] w-full items-center gap-3.5 px-4 py-2 text-left hover:bg-on-surface/5 ${
                  ctx.excludedExercises.has(e.id) ? "opacity-50" : ""
                }`}
              >
                <SchematicTile size={44}>
                  <PatternSchematic pattern={e.pattern} size={30} />
                </SchematicTile>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1 text-title">
                    {ctx.favouriteExercises.has(e.id) && (
                      <span aria-label="favourite" role="img" className="shrink-0 text-tertiary">
                        <StarIcon filled size={16} />
                      </span>
                    )}
                    <span className="truncate">{e.name}</span>
                  </span>
                  <span className="truncate text-[13px] text-on-surface-variant">
                    {musclesText(e)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {e.custom && <Badge>Custom</Badge>}
                  {ctx.excludedExercises.has(e.id) && <Badge tone="warn">Excluded</Badge>}
                  {filter !== "gym" && available.has(e.id) && <Badge tone="good">Here</Badge>}
                  <ChevronRightIcon size={18} className="text-on-surface-variant" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openExercise && (
        <ExerciseSheet
          exercise={openExercise}
          available={available.has(openExercise.id)}
          ctx={ctx}
          onClose={() => setOpen(null)}
        />
      )}
      {creating && <CustomExerciseSheet onClose={() => setCreating(false)} />}
    </div>
  );
}
