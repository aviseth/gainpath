"use client";

import { citation, explain } from "@/engine/explain";
import type { LiveSession } from "@/engine/session";
import type { Exercise } from "@/engine/types";
import { Sheet } from "./forms";

/** "Why does today look like this?" — the templates the engine recorded while deciding (§16). */
export function WhySheet({
  live,
  catalog,
  onClose,
}: {
  live: LiveSession;
  catalog: ReadonlyMap<string, Exercise>;
  onClose: () => void;
}) {
  const seen = new Set<string>();
  const line = (entry: Parameters<typeof explain>[0]) => {
    const text = explain(entry);
    if (seen.has(text)) return null;
    seen.add(text);
    return (
      <li key={text} className="flex gap-2">
        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          {citation(entry)}
        </span>
        <span>{text}</span>
      </li>
    );
  };

  return (
    <Sheet title="Why today looks like this" onClose={onClose}>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Today overall</h3>
        <ul className="flex flex-col gap-2 text-sm">{live.meta.rationale.map(line)}</ul>
      </section>
      {live.exercises
        .filter((e) => e.status !== "swapped_out")
        .map((e) => {
          const items = e.rationale.map(line).filter(Boolean);
          if (items.length === 0) return null;
          return (
            <section key={e.exerciseId}>
              <h3 className="mb-2 text-sm font-semibold text-zinc-300">
                {catalog.get(e.exerciseId)?.name ?? e.exerciseId}
              </h3>
              <ul className="flex flex-col gap-2 text-sm">{items}</ul>
            </section>
          );
        })}
      <p className="text-xs text-zinc-500">
        Rule IDs refer to EVIDENCE.md. &quot;Rule of thumb&quot; marks heuristics rather than
        research findings.
      </p>
    </Sheet>
  );
}
