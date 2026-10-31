"use client";

import { useState } from "react";
import { ExerciseSummary } from "@/components/exercise-summary";
import { Segmented } from "@/components/forms";
import { CheckIcon, MinusIcon, PlusIcon, SkipIcon, SwapIcon } from "@/components/icons";
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
  unit,
  onDown,
  onUp,
}: {
  label: string;
  value: number | null;
  display: string;
  /** Shown small under the value, so the number itself has room. */
  unit?: string;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 rounded-[20px] bg-surface-container-lowest px-2 py-3">
      <span className="text-label text-on-surface-variant">{label}</span>
      <div className="flex w-full items-center justify-between gap-1">
        <button
          type="button"
          aria-label={`Less ${label.toLowerCase()}`}
          onClick={onDown}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container active:bg-secondary-container/70"
        >
          <MinusIcon size={22} />
        </button>
        <output
          aria-label={label}
          className="flex min-w-0 flex-col items-center leading-none"
          data-value={value ?? ""}
        >
          <span className="text-[22px] font-bold whitespace-nowrap tabular-nums">{display}</span>
          {unit && <span className="mt-0.5 text-xs text-on-surface-variant">{unit}</span>}
        </output>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          onClick={onUp}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container active:bg-secondary-container/70"
        >
          <PlusIcon size={22} />
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
  lead = live.isAnchor,
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
  /** This is the one highlighted anchor (Von Restorff). */
  lead?: boolean;
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
      className={`rounded-card p-4 ${
        current ? "bg-surface-container ring-2 ring-primary/60" : "bg-surface-container-low"
      }`}
    >
      {current && (
        <p className="mb-2 px-1 text-label font-semibold text-primary">
          Now · set {setsDone(live, logs) + 1} of {live.setsTarget}
        </p>
      )}
      <ExerciseSummary e={live} exercise={exercise} equipment={equipmentById} lead={lead} />
      {equipment?.notes && <p className="mt-2 px-1 text-xs text-tertiary">{equipment.notes}</p>}

      {pending && live.warmups.length > 0 && working.length === 0 && (
        <div className="mt-3">
          <p className="px-1 text-label text-on-surface-variant">Warm-up</p>
          <ul className="mt-1 flex flex-col gap-1">
            {live.warmups.map((w, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={i < warmupsDone}
                  onClick={() =>
                    void onLog({ weightKg: w.weightKg, reps: w.reps, rpe: null, isWarmup: true })
                  }
                  className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-surface-container-lowest px-4 text-sm disabled:opacity-60"
                >
                  <span className="tabular-nums">
                    {formatKg(w.weightKg)} × {w.reps}
                  </span>
                  {i < warmupsDone ? (
                    <CheckIcon size={18} className="text-primary" />
                  ) : (
                    <span className="font-semibold text-primary">Done</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {working.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1 text-sm">
          {working.map((l, i) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-2xl bg-surface-container-lowest px-4 py-2.5"
            >
              <span className="flex items-center gap-2">
                <CheckIcon size={16} className="text-primary" />
                Set {i + 1}
                {l.is_amrap ? " (AMRAP)" : ""}
              </span>
              <span className="tabular-nums text-on-surface-variant">
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
          {amrapNext && (
            <div className="rounded-[20px] bg-tertiary-container p-4 text-sm text-on-tertiary-container">
              <p className="font-semibold">Calibration set: take it to failure (AMRAP).</p>
              <p className="mt-1">
                Before you start: at {live.targetReps} reps, how many more could you do?
              </p>
              <div className="mt-3">
                <Segmented
                  label="Predicted reps in reserve"
                  value={live.predictedRir ?? -1}
                  onChange={(v) => onPredict(v)}
                  options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
                />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {hasLoad && (
              <Stepper
                label="Weight"
                value={weight}
                display={weight === null ? "–" : String(Number(weight.toFixed(2)))}
                unit="kg"
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
              <p className="mb-2 px-1 text-xs text-on-surface-variant">
                <span className="font-semibold text-on-surface">RPE</span>{" "}
                {rpe !== null
                  ? `· ${Math.max(0, 10 - rpe)} reps in reserve`
                  : "· how hard? 10 = nothing left"}
              </p>
              <div role="radiogroup" aria-label="RPE" className="grid grid-cols-5 gap-1.5">
                {RPES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={rpe === r}
                    onClick={() => setRpe(r)}
                    className={`min-h-11 rounded-xl text-sm font-semibold tabular-nums transition-colors ${
                      rpe === r
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-lowest text-on-surface hover:bg-on-surface/8"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Fitts: the main action is the biggest target, right under the thumb after RPE. */}
          <Button
            variant="primary"
            size="lg"
            className="min-h-16"
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
          <Button variant="tonal" onClick={onSwap}>
            <SwapIcon size={18} />
            Swap
          </Button>
          <Button variant="tonal" onClick={onSkip}>
            <SkipIcon size={18} />
            Skip
          </Button>
        </div>
      )}
    </article>
  );
}
