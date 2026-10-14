"use client";

import { useState } from "react";
import { Chip, Field, NumberInput, Segmented } from "@/components/forms";
import { Button, Section } from "@/components/ui";
import { localDate } from "@/data/actions";
import { getDB } from "@/data/db";
import { repo } from "@/data/repo";
import type { Muscle } from "@/data/schema";
import { MAJOR_MUSCLES } from "@/engine/volume";
import { muscleLabel } from "@/engine/vector";

const SORENESS = ["–", "a bit", "sore", "very"];

/**
 * Daily check-in (READY-3): sleep, energy and soreness set the starting
 * targets; set-by-set RPE does the real adjustment.
 */
export function CheckinCard({ onDone }: { onDone: () => void }) {
  const [sleepQuality, setSleepQuality] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<Partial<Record<Muscle, number>>>({});
  const [busy, setBusy] = useState(false);

  const cycle = (m: Muscle) =>
    setSoreness((s) => {
      const next = ((s[m] ?? 0) + 1) % 4;
      const copy = { ...s };
      if (next === 0) delete copy[m];
      else copy[m] = next;
      return copy;
    });

  async function save() {
    setBusy(true);
    const date = localDate();
    const checkins = repo("checkins", getDB());
    const existing = (await checkins.list()).find((c) => c.date === date);
    const fields = { date, sleep_quality: sleepQuality, energy, sleep_hours: sleepHours, soreness };
    if (existing) await checkins.update(existing.id, fields);
    else await checkins.create(fields);
    onDone();
  }

  const scale = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));
  return (
    <Section title="Check-in" description="Takes 10 seconds. It sets today's starting targets.">
      <Field label="Sleep quality (1 = awful, 5 = great)">
        <Segmented
          label="Sleep quality"
          value={sleepQuality}
          onChange={setSleepQuality}
          options={scale}
        />
      </Field>
      <Field label="Energy (1 = drained, 5 = fired up)">
        <Segmented label="Energy" value={energy} onChange={setEnergy} options={scale} />
      </Field>
      <Field label="Hours slept (optional)">
        <NumberInput
          value={sleepHours}
          step={0.5}
          min={0}
          max={24}
          onChange={setSleepHours}
          placeholder="e.g. 7"
        />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium text-zinc-300">Anything sore? (tap to cycle)</p>
        <div className="flex flex-wrap gap-2">
          {MAJOR_MUSCLES.map((m) => (
            <Chip key={m} active={!!soreness[m]} onClick={() => cycle(m)}>
              {muscleLabel(m)}
              {soreness[m] ? ` · ${SORENESS[soreness[m]!]}` : ""}
            </Chip>
          ))}
        </div>
      </div>
      <Button variant="primary" disabled={busy} onClick={save}>
        Save check-in
      </Button>
    </Section>
  );
}
