"use client";

import { useState } from "react";
import { ExerciseSummary } from "@/components/exercise-summary";
import { Segmented } from "@/components/forms";
import { Button } from "@/components/ui";
import type { LoggedSet } from "@/data/sessions";
import type { RecordOf } from "@/data/schema";
import { availableLoads } from "@/engine/load";
import { setsDone, setsRemaining, type LiveExercise } from "@/engine/session";
import type { Equipment, Exercise } from "@/engine/types";
import { formatKg } from "@/lib/labels";

const RPES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

function Stepper({
  label,
  value,
  display,
  onDown,
  onUp,
}: {
  label: string;
  value: number | null;
  display: string;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Less ${label.toLowerCase()}`}
          onClick={onDown}
          className="h-12 w-12 rounded-xl bg-zinc-800 text-2xl"
        >
          −
        </button>
        <output
          aria-label={label}
          className="min-w-20 text-center text-xl font-bold tabular-nums"
          data-value={value ?? ""}
        >
          {display}
        </output>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          onClick={onUp}
          className="h-12 w-12 rounded-xl bg-zinc-800 text-2xl"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function ExerciseCard({
  live,
  exercise,
  equipment,
  equipmentById,
  logs,
  current,
  onLog,
  onSwap,
  onSkip,
  onPredict,
}: {
  live: LiveExercise;
  exercise: Exercise | undefined;
  equipment: Equipment | null;
  equipmentById: ReadonlyMap<string, Equipment>;
  logs: RecordOf<"set_logs">[];
  current: boolean;
  onLog: (set: LoggedSet) => Promise<void>;
  onSwap: () => void;
  onSkip: () => void;
  onPredict: (predictedRir: number) => void;
}) {
  const mine = logs.filter((l) => l.exercise_id === live.exerciseId);
  const working = mine.filter((l) => !l.is_warmup);
  const warmupsDone = mine.filter((l) => l.is_warmup).length;
  const loads = equipment ? availableLoads(equipment) : [];
  const [weight, setWeight] = useState<number | null>(live.currentWeightKg);
  const [weightSource, setWeightSource] = useState(live.currentWeightKg);
  const [reps, setReps] = useState(live.targetReps);
  const [rpe, setRpe] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Follow in-session adjustments unless the user changed the weight themselves.
  if (live.currentWeightKg !== weightSource) {
    setWeightSource(live.currentWeightKg);
    setWeight(live.currentWeightKg);
  }

  const pending = live.status === "pending";
  const remaining = setsRemaining(live, logs);
  const amrapNext = pending && live.calibration && remaining === 1;
  const hasLoad = !!equipment && loads.length > 1;

  const step = (dir: 1 | -1) => {
    if (!hasLoad) return;
    const w = weight ?? loads[0];
    const index = loads.findIndex((l) => l >= w - 1e-9);
    const i = index === -1 ? loads.length - 1 : index;
    setWeight(loads[Math.min(loads.length - 1, Math.max(0, i + dir))]);
  };

  async function log() {
    if (amrapNext && live.predictedRir == null) return;
    setBusy(true);
    try {
      await onLog({
        weightKg: hasLoad ? weight : null,
        reps,
        rpe: amrapNext ? 10 : rpe,
        predictedRir: amrapNext ? live.predictedRir : undefined,
      });
      setRpe(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      aria-label={exercise?.name}
      className={`rounded-2xl border p-4 ${current ? "border-lime-400/60 bg-zinc-900" : "border-zinc-800 bg-zinc-900/60"}`}
    >
      <ExerciseSummary e={live} exercise={exercise} equipment={equipmentById} />
      {equipment?.notes && <p className="mt-1 text-xs text-amber-200">{equipment.notes}</p>}

      {pending && live.warmups.length > 0 && working.length === 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Warm-up</p>
          <ul className="mt-1 flex flex-col gap-1">
            {live.warmups.map((w, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={i < warmupsDone}
                  onClick={() =>
                    void onLog({ weightKg: w.weightKg, reps: w.reps, rpe: null, isWarmup: true })
                  }
                  className="flex min-h-11 w-full items-center justify-between rounded-lg bg-zinc-950 px-3 text-sm disabled:opacity-50"
                >
                  <span>
                    {formatKg(w.weightKg)} × {w.reps}
                  </span>
                  <span>{i < warmupsDone ? "✓" : "Done"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {working.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1 text-sm">
          {working.map((l, i) => (
            <li key={l.id} className="flex justify-between rounded-lg bg-zinc-950 px-3 py-2">
              <span>
                Set {i + 1}
                {l.is_amrap ? " (AMRAP)" : ""}
              </span>
              <span className="tabular-nums">
                {l.weight_kg > 0 ? `${formatKg(l.weight_kg)} × ` : ""}
                {l.reps}
                {live.timed ? "s" : ""} {l.rpe !== null ? `@ RPE ${l.rpe}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}

      {pending && current && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-zinc-400">
            Set {setsDone(live, logs) + 1} of {live.setsTarget}
          </p>
          {amrapNext && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
              <p className="font-medium">Calibration set: take it to failure (AMRAP).</p>
              <p className="mt-1">
                Before you start: at {live.targetReps} reps, how many more could you do?
              </p>
              <div className="mt-2">
                <Segmented
                  label="Predicted reps in reserve"
                  value={live.predictedRir ?? -1}
                  onChange={(v) => onPredict(v)}
                  options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
                />
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-around gap-3">
            {hasLoad && (
              <Stepper
                label="Weight"
                value={weight}
                display={formatKg(weight)}
                onDown={() => step(-1)}
                onUp={() => step(1)}
              />
            )}
            <Stepper
              label={live.timed ? "Seconds" : "Reps"}
              value={reps}
              display={String(reps)}
              onDown={() => setReps((r) => Math.max(live.timed ? 5 : 1, r - (live.timed ? 5 : 1)))}
              onUp={() => setReps((r) => r + (live.timed ? 5 : 1))}
            />
          </div>
          {!amrapNext && (
            <div>
              <p className="mb-1 text-xs text-zinc-400">
                RPE{" "}
                {rpe !== null
                  ? `(${Math.max(0, 10 - rpe)} reps in reserve)`
                  : "(how hard? 10 = nothing left)"}
              </p>
              <div role="radiogroup" aria-label="RPE" className="grid grid-cols-5 gap-1.5">
                {RPES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={rpe === r}
                    onClick={() => setRpe(r)}
                    className={`min-h-11 rounded-lg border text-sm font-semibold ${
                      rpe === r
                        ? "border-lime-400 bg-lime-400/15 text-lime-300"
                        : "border-zinc-700 bg-zinc-950"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button
            variant="primary"
            disabled={
              busy || (!amrapNext && rpe === null) || (amrapNext && live.predictedRir == null)
            }
            onClick={log}
          >
            {amrapNext ? "Log AMRAP set" : "Log set"}
          </Button>
        </div>
      )}

      {pending && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={onSwap}>Swap</Button>
          <Button onClick={onSkip}>Skip</Button>
        </div>
      )}
    </article>
  );
}
