import fuzzysort from "fuzzysort";
import type { Exercise } from "@/engine/types";

/** Fuzzy exercise search over names and aliases; alphabetical when the query is empty. */
export function searchExercises(
  query: string,
  exercises: readonly Exercise[],
  limit = 100,
): Exercise[] {
  const q = query.trim();
  if (!q) return [...exercises].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  const targets = exercises.map((e) => ({ e, name: e.name, aliases: e.aliases.join(" · ") }));
  return fuzzysort
    .go(q, targets, { keys: ["name", "aliases"], limit, threshold: 0.3 })
    .map((r) => r.obj.e);
}
