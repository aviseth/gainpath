"use client";

import { useMemo, useState } from "react";
import { Badge, Chip, EmptyState, TextInput } from "@/components/forms";
import { Button } from "@/components/ui";
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

  if (!ctx) return <p className="text-zinc-400">Loading…</p>;
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
      <h1 className="text-2xl font-bold">Exercises</h1>
      <TextInput
        placeholder="Search by name, e.g. pec deck"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search exercises"
      />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
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
      <Button onClick={() => setCreating(true)}>+ New custom exercise</Button>

      {results.length === 0 ? (
        <EmptyState>
          {filter === "gym"
            ? "Nothing available here yet: register equipment in My gym."
            : "No exercises match."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setOpen(e.id)}
                className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-left ${
                  ctx.excludedExercises.has(e.id) ? "opacity-50" : ""
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {ctx.favouriteExercises.has(e.id) && "★ "}
                    {e.name}
                  </span>
                  <span className="truncate text-xs text-zinc-500">{musclesText(e)}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  {e.custom && <Badge>Custom</Badge>}
                  {ctx.excludedExercises.has(e.id) && <Badge tone="warn">Excluded</Badge>}
                  {filter !== "gym" && available.has(e.id) && <Badge tone="good">Here</Badge>}
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
