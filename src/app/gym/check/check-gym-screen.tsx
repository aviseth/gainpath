"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/forms";
import { Notice, Section } from "@/components/ui";
import { MUSCLES, MOVEMENT_PATTERNS } from "@/data/schema";
import { auditGym } from "@/engine/audit";
import { availableCandidates } from "@/engine/availability";
import { muscleLabel } from "@/engine/vector";
import { useGymContext } from "@/hooks/use-data";
import { capitalize, humanize } from "@/lib/labels";

export function CheckGymScreen() {
  const ctx = useGymContext();
  const audit = useMemo(() => {
    if (!ctx) return null;
    const candidates = availableCandidates({
      catalog: [...ctx.catalog.values()],
      equipment: ctx.equipment,
      links: ctx.links,
      excludedExercises: ctx.excludedExercises,
      excludedEquipment: ctx.excludedEquipment,
    });
    return auditGym({
      candidates,
      equipment: ctx.equipment,
      links: ctx.links,
      goal: ctx.profile?.goal ?? "general",
    });
  }, [ctx]);

  if (!ctx || !audit) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/gym" className="text-sm text-zinc-400">
        ← My gym
      </Link>
      <h1 className="text-2xl font-bold">Check {ctx.gym?.name ?? "my gym"}</h1>
      <p className="text-sm text-zinc-400">
        What your registered, working equipment can train. This only reports gaps; Liftwise never
        programs equipment you haven&apos;t registered.
      </p>

      <Section title="Gaps">
        {audit.gaps.length === 0 ? (
          <Notice tone="success">Every muscle group and key movement is covered.</Notice>
        ) : (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-amber-200">
            {audit.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
      </Section>

      {(audit.unlinked.length > 0 || audit.unavailable.length > 0) && (
        <Section title="Equipment to fix">
          {audit.unlinked.map((e) => (
            <p key={e.id} className="text-sm">
              <Badge tone="warn">No exercises</Badge> {e.name}: link exercises so it can be
              programmed.
            </p>
          ))}
          {audit.unavailable.map((e) => (
            <p key={e.id} className="text-sm">
              <Badge tone="bad">Broken</Badge> {e.name}
            </p>
          ))}
        </Section>
      )}

      <Section title="Muscles" description="Exercises available with each muscle as a prime mover.">
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {MUSCLES.map((m) => (
            <li
              key={m}
              className="flex items-center justify-between rounded-lg bg-zinc-950 px-3 py-2"
            >
              <span>{capitalize(muscleLabel(m))}</span>
              <Badge
                tone={
                  audit.muscles[m].prime === 0
                    ? "bad"
                    : audit.muscles[m].prime < 2
                      ? "warn"
                      : "good"
                }
              >
                {audit.muscles[m].prime}
              </Badge>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Movement patterns">
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {MOVEMENT_PATTERNS.map((p) => (
            <li
              key={p}
              className="flex items-center justify-between rounded-lg bg-zinc-950 px-3 py-2"
            >
              <span>{capitalize(humanize(p))}</span>
              <Badge tone={audit.patterns[p] === 0 ? "neutral" : "good"}>{audit.patterns[p]}</Badge>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
