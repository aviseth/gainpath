"use client";

import { useState } from "react";
import { Badge, Field, Sheet, TextInput } from "@/components/forms";
import { Button, Notice } from "@/components/ui";
import { localDate } from "@/data/actions";
import { getDB } from "@/data/db";
import { repo } from "@/data/repo";
import {
  acceptSwap,
  applySwapReason,
  removeForPain,
  sessionLogs,
  skip,
  type SessionRow,
  type SwapReason,
} from "@/data/sessions";
import {
  loadTrainingContext,
  planInputFrom,
  readLive,
  type TrainingContext,
} from "@/data/training";
import { matchConstraint } from "@/engine/constraint";
import { planExercise } from "@/engine/plan";
import { setsRemaining, type LiveExercise } from "@/engine/session";
import { findSubstitutes, type SwapOption } from "@/engine/swap";
import { formatKg, humanize } from "@/lib/labels";
import { BODY_REGIONS } from "@/seed/schema";

type Step = "reason" | "dislike" | "pain" | "options" | "pain_done";

const REASONS: Array<{ value: SwapReason; label: string; hint: string }> = [
  { value: "busy", label: "Machine busy", hint: "Today only" },
  { value: "broken", label: "Machine broken", hint: "Marks it broken until fixed" },
  { value: "feel", label: "Don't feel like it today", hint: "Today only" },
  { value: "dislike", label: "Don't like this exercise", hint: "Optionally exclude it for good" },
  { value: "pain", label: "Pain / discomfort", hint: "Removes everything loading that area today" },
];

export interface SwapOutcome {
  /** Set when a "busy" swap was recorded, to check the busy-machine pattern. */
  busyEquipmentId?: string;
}

export function SwapSheet({
  session,
  target,
  onClose,
  onAskAiConstraint,
}: {
  session: SessionRow;
  target: LiveExercise;
  onClose: (outcome?: SwapOutcome) => void;
  /** Opt-in AI fallback for constraints the keyword matcher can't map (ALGORITHMS §18). */
  onAskAiConstraint?: (text: string) => Promise<string[]>;
}) {
  const db = getDB();
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<SwapReason | null>(null);
  const [options, setOptions] = useState<Array<{ option: SwapOption; loads: (number | null)[] }>>(
    [],
  );
  const [empty, setEmpty] = useState<string | null>(null);
  const [ctx, setCtx] = useState<TrainingContext | null>(null);
  const [constraint, setConstraint] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = ctx?.catalog.get(target.exerciseId)?.name ?? "this exercise";

  async function computeOptions() {
    const fresh = await loadTrainingContext(db);
    if (!fresh) return;
    setCtx(fresh);
    const live = readLive((await repo("sessions", db).get(session.id)) ?? session)!;
    const logs = await sessionLogs(db, session.id);
    const exercise = fresh.catalog.get(target.exerciseId)!;
    const result = findSubstitutes({
      removed: {
        exercise,
        plannedSets: target.setsTarget,
        remainingSets: setsRemaining(target, logs),
      },
      candidates: fresh.candidates,
      sessionOthers: live.exercises
        .filter(
          (e) =>
            e.exerciseId !== target.exerciseId && (e.status === "pending" || e.status === "done"),
        )
        .flatMap((e) => {
          const ex = fresh.catalog.get(e.exerciseId);
          return ex ? [{ exercise: ex, sets: e.setsTarget }] : [];
        }),
      caps: live.meta.caps,
      recovery: fresh.recovery,
      favourites: fresh.favourites,
      cfg: fresh.cfg,
    });
    const input = planInputFrom(fresh);
    setOptions(
      result.options.map((option) => ({
        option,
        loads: option.items.map((item) => {
          const candidate = fresh.candidates.find((c) => c.exercise.id === item.exercise.id);
          return candidate
            ? planExercise(candidate, item.sets, 1, false, new Set(), input, fresh.history).weightKg
            : null;
        }),
      })),
    );
    setEmpty(
      result.empty === "no_equipment"
        ? "No alternative is available with the equipment that's free right now."
        : result.empty === "caps"
          ? "Every alternative would push a muscle past today's per-session limit (VOL-4)."
          : null,
    );
    setStep("options");
  }

  async function pickReason(r: SwapReason) {
    setReason(r);
    if (r === "dislike") return setStep("dislike");
    if (r === "pain") return setStep("pain");
    setBusy(true);
    await applySwapReason(db, {
      reason: r,
      exerciseId: target.exerciseId,
      equipmentId: target.equipmentId,
    });
    await computeOptions();
    setBusy(false);
  }

  async function accept(option: SwapOption) {
    setBusy(true);
    const current = (await repo("sessions", db).get(session.id)) ?? session;
    await acceptSwap(db, current, target.exerciseId, reason ?? "free_text", option);
    onClose(reason === "busy" ? { busyEquipmentId: target.equipmentId } : undefined);
  }

  async function skipIt() {
    setBusy(true);
    const current = (await repo("sessions", db).get(session.id)) ?? session;
    await skip(db, current, target.exerciseId, reason ?? "skip");
    onClose(reason === "busy" ? { busyEquipmentId: target.equipmentId } : undefined);
  }

  async function applyConstraint() {
    if (!ctx || !constraint.trim()) return;
    setBusy(true);
    let ids = matchConstraint(constraint, ctx.equipment).equipmentIds;
    if (ids.length === 0 && onAskAiConstraint) {
      // The engine validates: only equipment registered at this gym can be excluded.
      const known = new Set(ctx.equipment.map((e) => e.id));
      ids = (await onAskAiConstraint(constraint).catch(() => [])).filter((id) => known.has(id));
    }
    if (ids.length === 0) {
      setMessage("Couldn't match that to your equipment. Try naming the machine.");
    } else {
      for (const id of ids) {
        await repo("temp_exclusions", db).create({
          date: localDate(),
          equipment_id: id,
          exercise_id: null,
          body_region: null,
          reason: "free_text",
        });
      }
      setMessage(
        `Excluded for today: ${ids.map((id) => ctx.equipmentById.get(id)?.name ?? id).join(", ")}.`,
      );
      setConstraint("");
      await computeOptions();
    }
    setBusy(false);
  }

  return (
    <Sheet title={`Swap ${name}`} onClose={() => onClose()}>
      {step === "reason" && (
        <>
          <p className="text-sm text-zinc-400">Why?</p>
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              disabled={busy}
              onClick={() => void pickReason(r.value)}
              className="flex min-h-14 flex-col items-start justify-center rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-left"
            >
              <span className="font-medium">{r.label}</span>
              <span className="text-xs text-zinc-500">{r.hint}</span>
            </button>
          ))}
          <Button onClick={() => void skipIt()} disabled={busy}>
            Skip without replacing
          </Button>
        </>
      )}

      {step === "dislike" && (
        <>
          <p>Exclude {name} permanently? You can undo this in Exercises.</p>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await applySwapReason(db, {
                reason: "dislike",
                exerciseId: target.exerciseId,
                equipmentId: target.equipmentId,
                excludePermanently: true,
              });
              await computeOptions();
              setBusy(false);
            }}
          >
            Yes, never program it
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await applySwapReason(db, {
                reason: "dislike",
                exerciseId: target.exerciseId,
                equipmentId: target.equipmentId,
              });
              await computeOptions();
              setBusy(false);
            }}
          >
            Just today
          </Button>
        </>
      )}

      {step === "pain" && (
        <>
          <p className="text-sm text-zinc-300">
            Where is it? Everything loading that area is removed for today.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {BODY_REGIONS.map((region) => (
              <Button
                key={region}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await applySwapReason(db, {
                    reason: "pain",
                    exerciseId: target.exerciseId,
                    equipmentId: target.equipmentId,
                    painRegion: region,
                  });
                  const current = (await repo("sessions", db).get(session.id)) ?? session;
                  await removeForPain(db, current, region);
                  setBusy(false);
                  setStep("pain_done");
                }}
              >
                {humanize(region)}
              </Button>
            ))}
          </div>
        </>
      )}

      {step === "pain_done" && (
        <>
          <Notice>
            Removed today&apos;s exercises that load that area. If the pain persists, see a doctor
            or physiotherapist. Gainpath can&apos;t diagnose it.
          </Notice>
          <Button variant="primary" onClick={() => onClose()}>
            Back to session
          </Button>
        </>
      )}

      {step === "options" && (
        <>
          {empty && <Notice>{empty}</Notice>}
          {options.map(({ option, loads }, i) => (
            <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge tone={option.matchPct >= 85 ? "good" : "warn"}>
                  {option.matchPct}% match
                </Badge>
                {option.kind === "combo" && <Badge>2 exercises</Badge>}
              </div>
              <ul className="flex flex-col gap-1">
                {option.items.map((item, j) => (
                  <li key={item.exercise.id} className="flex justify-between gap-2">
                    <span className="font-medium">{item.exercise.name}</span>
                    <span className="shrink-0 text-sm text-zinc-300 tabular-nums">
                      {item.sets} ×{" "}
                      {loads[j] !== null && loads[j]! > 0 ? `@ ${formatKg(loads[j])}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {option.items.some((i) => i.equipment) && (
                <p className="mt-1 text-xs text-zinc-500">
                  {option.items.map((i) => i.equipment?.name ?? "No equipment").join(" + ")}
                </p>
              )}
              <p className="mt-2 text-sm text-zinc-400">{option.diffText}</p>
              <Button
                variant="primary"
                className="mt-3"
                disabled={busy}
                onClick={() => void accept(option)}
              >
                Use this
              </Button>
            </div>
          ))}
          <Button disabled={busy} onClick={() => void skipIt()}>
            Skip without replacing
          </Button>
          <Field label="Something else unavailable?" hint='e.g. "all the cable stations are taken"'>
            <TextInput value={constraint} onChange={(e) => setConstraint(e.target.value)} />
          </Field>
          <Button disabled={busy || !constraint.trim()} onClick={() => void applyConstraint()}>
            Update options
          </Button>
          {message && <Notice>{message}</Notice>}
        </>
      )}
    </Sheet>
  );
}
