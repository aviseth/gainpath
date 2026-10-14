"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextInput } from "@/components/forms";
import { Button, Notice } from "@/components/ui";
import { WhySheet } from "@/components/why-sheet";
import { getDB } from "@/data/db";
import { repo } from "@/data/repo";
import {
  addExercise,
  finishSession,
  logSet,
  setPredictedRir,
  skip,
  undoSet,
  type LoggedSet,
} from "@/data/sessions";
import { readLive, slotOf } from "@/data/training";
import { explain } from "@/engine/explain";
import { parseLog, type ParsedLog } from "@/engine/parser";
import { busyPattern, setsRemaining } from "@/engine/session";
import { useTodaySession, useSessionLogs, useTrainingContext } from "@/hooks/use-training";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { z } from "zod";
import { askAi, useAiStatus } from "@/lib/ai-client";
import { parsedSetSchema, type ConstraintResult, type ParseLogResult } from "@/lib/ai-schemas";
import { formatKg } from "@/lib/labels";
import { ExerciseCard } from "./exercise-card";
import { RestTimer } from "./rest-timer";
import { SwapSheet, type SwapOutcome } from "./swap-sheet";

/** Event-time clock (kept out of render for the React compiler's purity check). */
const now = () => Date.now();

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SessionScreen() {
  const router = useRouter();
  const db = getDB();
  const ctx = useTrainingContext();
  const session = useTodaySession();
  const logs = useSessionLogs(session?.id);
  const ai = useAiStatus();
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: string[] } | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [review, setReview] = useState<ParsedLog | null>(null);
  const [why, setWhy] = useState(false);
  const [busyPrompt, setBusyPrompt] = useState<{
    equipmentId: string;
    weekday: number;
    bucket: number;
  } | null>(null);
  const active = !!session && session.status !== "done";
  useWakeLock(active);

  if (ctx === undefined || session === undefined || logs === undefined)
    return <p className="text-zinc-400">Loading…</p>;
  if (!ctx || !session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Session</h1>
        <Notice>No session today yet.</Notice>
        <Link href="/" className="text-lime-400">
          ← Today
        </Link>
      </div>
    );
  }
  const live = readLive(session)!;
  const visible = live.exercises.filter((e) => e.status !== "swapped_out");
  const current = visible.find((e) => e.status === "pending");

  async function onLog(exerciseId: string, set: LoggedSet) {
    const fresh = (await repo("sessions", db).get(session!.id)) ?? session!;
    const { adjustment, log } = await logSet(db, fresh, exerciseId, set);
    const ex = live.exercises.find((e) => e.exerciseId === exerciseId);
    if (!set.isWarmup && ex) setRestEndsAt(now() + ex.restSeconds * 1000);
    const notes = adjustment?.rationale.map(explain).join(" ");
    setToast({ text: notes || (set.isWarmup ? "Warm-up logged." : "Set logged."), undo: [log.id] });
  }

  async function undo(ids: string[]) {
    let fresh = (await repo("sessions", db).get(session!.id)) ?? session!;
    for (const id of ids) fresh = await undoSet(db, fresh, id);
    setToast(null);
    setRestEndsAt(null);
  }

  async function onSwapClosed(outcome?: SwapOutcome) {
    setSwapping(null);
    if (!outcome?.busyEquipmentId) return;
    const swaps = await repo("swaps", db).list();
    const pattern = busyPattern(swaps, outcome.busyEquipmentId, now(), ctx!.cfg);
    const already = ctx!.deprioritised.some(
      (d) => d.equipmentId === outcome.busyEquipmentId && d.slot === slotOf(now()),
    );
    if (pattern && !already) setBusyPrompt({ equipmentId: outcome.busyEquipmentId, ...pattern });
  }

  /** Free-text logging (ALGORITHMS §17): high confidence logs straight away with undo. */
  async function submitQuick() {
    const refs = (list: { id: string }[]) =>
      list.map((x) => {
        const e = ctx!.catalog.get(x.id)!;
        return { id: e.id, name: e.name, aliases: e.aliases };
      });
    const parsed = parseLog(
      quick,
      {
        sessionExercises: refs(
          visible.filter((e) => e.status === "pending").map((e) => ({ id: e.exerciseId })),
        ),
        gymExercises: refs(ctx!.candidates.map((c) => ({ id: c.exercise.id }))),
        currentExerciseId: current?.exerciseId ?? null,
      },
      ctx!.cfg,
    );
    if (parsed.confidence === "high") await commitParsed(parsed);
    else setReview(parsed);
  }

  async function commitParsed(parsed: ParsedLog) {
    if (!parsed.exerciseId) return;
    let fresh = (await repo("sessions", db).get(session!.id)) ?? session!;
    if (
      !readLive(fresh)!.exercises.some(
        (e) => e.exerciseId === parsed.exerciseId && e.status === "pending",
      )
    ) {
      fresh = await addExercise(db, fresh, parsed.exerciseId, parsed.sets.length);
    }
    const ex = readLive(fresh)!.exercises.find(
      (e) => e.exerciseId === parsed.exerciseId && e.status === "pending",
    );
    const ids: string[] = [];
    for (const s of parsed.sets) {
      const result = await logSet(db, fresh, parsed.exerciseId, {
        weightKg: s.weightKg ?? ex?.currentWeightKg ?? null,
        reps: s.reps,
        rpe: s.rpe,
        approximate: parsed.approximate,
      });
      fresh = result.session;
      ids.push(result.log.id);
    }
    const name = ctx!.catalog.get(parsed.exerciseId)?.name;
    setToast({
      text: `Logged ${parsed.sets.length} set${parsed.sets.length === 1 ? "" : "s"} of ${name}${parsed.approximate ? " (approximate)" : ""}.`,
      undo: ids,
    });
    setQuick("");
    setReview(null);
    if (ex) setRestEndsAt(now() + ex.restSeconds * 1000);
  }

  async function askAiToParse() {
    if (!review) return;
    const result = await askAi<ParseLogResult>("parse-log", {
      text: quick,
      exercises: ctx!.candidates.map((c) => ({ id: c.exercise.id, name: c.exercise.name })),
    });
    // The engine validates: only exercises available here, sane numbers.
    const sets = z.array(parsedSetSchema).min(1).safeParse(result?.sets);
    const known =
      !!result?.exercise_id && ctx!.candidates.some((c) => c.exercise.id === result.exercise_id);
    if (known && sets.success) {
      // Still a review step: nothing is logged until the user taps "Log it".
      setReview({
        ...review,
        exerciseId: result!.exercise_id,
        sets: sets.data,
        confidence: "low",
        issues: ["Read by AI. Check before logging."],
      });
    } else setReview({ ...review, issues: [...review.issues, "The AI couldn't read it either."] });
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {session.status === "done" ? "Session done" : "Session"}
        </h1>
        <button type="button" className="text-sm text-lime-400" onClick={() => setWhy(true)}>
          Why?
        </button>
      </div>

      {active && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitQuick();
          }}
          className="flex gap-2"
        >
          <TextInput
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder='Quick log: "80x8 @9" or "bench 3x8 @ 80"'
            aria-label="Quick log"
          />
          <Button type="submit" className="w-auto! px-4" disabled={!quick.trim()}>
            Log
          </Button>
        </form>
      )}

      {review && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm">
          <p className="font-medium text-amber-100">Check this before logging</p>
          <p className="mt-1">
            {review.exerciseId ? ctx.catalog.get(review.exerciseId)?.name : "Exercise?"}:{" "}
            {review.sets
              .map(
                (s) =>
                  `${s.weightKg !== null ? formatKg(s.weightKg) : "?"} × ${s.reps}${s.rpe ? ` @${s.rpe}` : ""}`,
              )
              .join(", ") || "no sets"}
          </p>
          {review.issues.length > 0 && (
            <p className="mt-1 text-amber-200">{review.issues.join("; ")}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {review.exerciseId && review.sets.length > 0 && (
              <Button
                variant="primary"
                className="w-auto! px-4"
                onClick={() => void commitParsed(review)}
              >
                Log it
              </Button>
            )}
            {ai?.enabled && (
              <Button className="w-auto! px-4" onClick={() => void askAiToParse()}>
                Ask AI
              </Button>
            )}
            <Button className="w-auto! px-4" onClick={() => setReview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {busyPrompt && (
        <Notice>
          {ctx.equipmentById.get(busyPrompt.equipmentId)?.name} is often busy at this time.
          Deprioritise it on {WEEKDAYS[busyPrompt.weekday]}s around {busyPrompt.bucket * 2}:00–
          {busyPrompt.bucket * 2 + 2}:00?
          <span className="mt-2 flex gap-2">
            <Button
              variant="primary"
              className="w-auto! px-4"
              onClick={async () => {
                await repo("exercise_prefs", db).create({
                  exercise_id: null,
                  equipment_id: busyPrompt.equipmentId,
                  kind: "deprioritise",
                  reason: `${busyPrompt.weekday}:${busyPrompt.bucket}`,
                });
                setBusyPrompt(null);
              }}
            >
              Yes
            </Button>
            <Button className="w-auto! px-4" onClick={() => setBusyPrompt(null)}>
              No
            </Button>
          </span>
        </Notice>
      )}

      {visible.map((e) => (
        <ExerciseCard
          key={`${e.exerciseId}-${e.replaces ?? ""}`}
          live={e}
          exercise={ctx.catalog.get(e.exerciseId)}
          equipment={ctx.equipmentById.get(e.equipmentId) ?? null}
          equipmentById={ctx.equipmentById}
          logs={logs}
          current={e === current}
          onLog={(set) => onLog(e.exerciseId, set)}
          onSwap={() => setSwapping(e.exerciseId)}
          onSkip={async () => {
            const fresh = (await repo("sessions", db).get(session.id)) ?? session;
            const { added } = await skip(db, fresh, e.exerciseId);
            setToast({
              text: added.length
                ? `Skipped. Added ${added.map((id) => ctx.catalog.get(id)?.name).join(", ")} to keep today balanced.`
                : "Skipped. The missed volume moves to a later session this week.",
            });
          }}
          onPredict={async (rir) => {
            const fresh = (await repo("sessions", db).get(session.id)) ?? session;
            await setPredictedRir(db, fresh, e.exerciseId, rir);
          }}
        />
      ))}

      {active && (
        <Button
          variant={current ? "secondary" : "primary"}
          onClick={async () => {
            const remaining = live.exercises.reduce((s, e) => s + setsRemaining(e, logs), 0);
            if (
              remaining > 0 &&
              !window.confirm(
                `Finish now? ${remaining} planned set(s) will move to later this week.`,
              )
            )
              return;
            const fresh = (await repo("sessions", db).get(session.id)) ?? session;
            await finishSession(db, fresh);
            setRestEndsAt(null);
            router.push("/");
          }}
        >
          Finish session
        </Button>
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 top-16 z-30 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-800 p-3 text-sm shadow-lg"
        >
          <span>{toast.text}</span>
          <span className="flex shrink-0 gap-2">
            {toast.undo && (
              <button
                type="button"
                className="font-semibold text-lime-400"
                onClick={() => void undo(toast.undo!)}
              >
                Undo
              </button>
            )}
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
              ×
            </button>
          </span>
        </div>
      )}

      {restEndsAt && active && (
        <RestTimer
          endsAt={restEndsAt}
          onExtend={() => setRestEndsAt((t) => (t ?? now()) + 30_000)}
          onDismiss={() => setRestEndsAt(null)}
        />
      )}
      {swapping && (
        <SwapSheet
          session={session}
          target={live.exercises.find((e) => e.exerciseId === swapping && e.status === "pending")!}
          onClose={(o) => void onSwapClosed(o)}
          onAskAiConstraint={
            ai?.enabled
              ? async (text) =>
                  (
                    await askAi<ConstraintResult>("constraint", {
                      text,
                      equipment: ctx.equipment.map((e) => ({
                        id: e.id,
                        name: e.name,
                        type: e.type,
                        status: e.status,
                      })),
                    })
                  )?.equipment_ids ?? []
              : undefined
          }
        />
      )}
      {why && <WhySheet live={live} catalog={ctx.catalog} onClose={() => setWhy(false)} />}
    </div>
  );
}
