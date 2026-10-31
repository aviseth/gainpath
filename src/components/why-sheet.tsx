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
        <span className="h-fit min-w-[3.75rem] shrink-0 rounded-chip bg-secondary-container px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-on-secondary-container">
          {citation(entry)}
        </span>
        <span>{text}</span>
      </li>
    );
  };

  return (
    <Sheet title="Why today looks like this" onClose={onClose}>
      <section className="rounded-card bg-surface-container-low p-4">
        <h3 className="mb-2 text-title">Today overall</h3>
        <ul className="flex flex-col gap-2.5 text-sm leading-relaxed">
          {live.meta.rationale.map(line)}
        </ul>
      </section>
      {live.exercises
        .filter((e) => e.status !== "swapped_out")
        .map((e) => {
          const items = e.rationale.map(line).filter(Boolean);
          if (items.length === 0) return null;
          return (
            <section key={e.exerciseId} className="rounded-card bg-surface-container-low p-4">
              <h3 className="mb-2 text-title">{catalog.get(e.exerciseId)?.name ?? e.exerciseId}</h3>
              <ul className="flex flex-col gap-2.5 text-sm leading-relaxed">{items}</ul>
            </section>
          );
        })}
      <p className="text-xs text-on-surface-variant">
        Rule IDs refer to EVIDENCE.md. &quot;Rule of thumb&quot; marks heuristics rather than
        research findings.
      </p>
    </Sheet>
  );
}
