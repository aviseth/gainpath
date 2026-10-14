"use client";

import { useState } from "react";
import { Badge, NumberInput } from "@/components/forms";
import { Button, Section } from "@/components/ui";
import { saveProfile } from "@/data/actions";
import { CONFIG, type ConfigKey } from "@/engine/config";
import { useProfile } from "@/hooks/use-data";

const ENTRIES = Object.entries(CONFIG) as Array<[ConfigKey, (typeof CONFIG)[ConfigKey]]>;

/**
 * Settings → Advanced: every engine constant, editable within its bounds.
 * Overrides live in profile.config_overrides and sync like everything else.
 */
export function AdvancedSection() {
  const profile = useProfile();
  const [filter, setFilter] = useState<"changed" | "heuristic" | "all">("heuristic");
  const [drafts, setDrafts] = useState<Partial<Record<ConfigKey, number | null>>>({});
  if (!profile) return null;
  const overrides = profile.config_overrides;
  const changed = ENTRIES.filter(([key]) => key in overrides).length;

  function commit(key: ConfigKey, value: number | null) {
    const entry = CONFIG[key];
    const next = { ...overrides };
    if (value === null || !Number.isFinite(value) || value === entry.value) delete next[key];
    else next[key] = Math.min(entry.max, Math.max(entry.min, value));
    setDrafts((d) => ({ ...d, [key]: undefined }));
    void saveProfile({ config_overrides: next });
  }

  const shown = ENTRIES.filter(([key, entry]) =>
    filter === "all" ? true : filter === "changed" ? key in overrides : entry.heuristic,
  );

  return (
    <Section
      title="Advanced"
      description="The engine's constants. Ones marked “rule of thumb” are heuristics, not research findings; change them if your experience says otherwise. Values are kept within safe bounds."
    >
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          Engine constants {changed > 0 ? `(${changed} changed)` : ""}
        </summary>
        <div className="mt-2 flex gap-2 text-sm">
          {(["heuristic", "changed", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`min-h-9 rounded-full border px-3 ${filter === f ? "border-lime-400 text-lime-300" : "border-zinc-700"}`}
            >
              {f === "heuristic" ? "Rules of thumb" : f === "changed" ? "Changed" : "All"}
            </button>
          ))}
        </div>
        <ul className="mt-3 flex flex-col gap-3">
          {shown.map(([key, entry]) => {
            const current = key in overrides ? overrides[key] : entry.value;
            const draft = drafts[key];
            return (
              <li key={key} className="rounded-xl bg-zinc-950 p-3">
                <div className="flex items-start justify-between gap-2">
                  <label htmlFor={`cfg-${key}`} className="text-sm">
                    {entry.label}
                  </label>
                  <div className="flex shrink-0 gap-1">
                    <Badge>{entry.rule}</Badge>
                    {entry.heuristic && <Badge tone="warn">rule of thumb</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <NumberInput
                    id={`cfg-${key}`}
                    value={draft !== undefined ? draft : current}
                    min={entry.min}
                    max={entry.max}
                    step="any"
                    onChange={(v) => setDrafts((d) => ({ ...d, [key]: v }))}
                    onBlur={() => draft !== undefined && commit(key, draft)}
                    className="max-w-32"
                  />
                  <span className="text-xs text-zinc-500">
                    {entry.min}–{entry.max} · default {entry.value}
                  </span>
                </div>
                {key in overrides && (
                  <button
                    type="button"
                    className="mt-1 text-xs text-lime-300 underline"
                    onClick={() => commit(key, null)}
                  >
                    Reset to default
                  </button>
                )}
              </li>
            );
          })}
          {shown.length === 0 && <li className="text-sm text-zinc-500">Nothing changed yet.</li>}
        </ul>
        {changed > 0 && (
          <Button className="mt-3" onClick={() => void saveProfile({ config_overrides: {} })}>
            Reset all to defaults
          </Button>
        )}
      </details>
    </Section>
  );
}
