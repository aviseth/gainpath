"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CelebrationCard } from "@/components/celebration-card";
import { TextInput } from "@/components/forms";
import { CloseIcon } from "@/components/icons";
import { Button, Notice, PageHeader, linkClass } from "@/components/ui";
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
import { busyPattern, setsDone, setsRemaining } from "@/engine/session";
import { useSessionCelebration } from "@/hooks/use-celebration";
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
  const celebration = useSessionCelebration(session, ctx);
  useWakeLock(active);

  if (ctx === undefined || session === undefined || logs === undefined)
    return <p className="px-1 text-on-surface-variant">Loading…</p>;
  if (!ctx || !session) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Session" />
        <Notice>No session today yet.</Notice>
        <Link href="/" className={`${linkClass} self-start`}>
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

  const doneSets = visible.reduce((s, e) => s + setsDone(e, logs), 0);
  const totalSets = visible.reduce((s, e) => s + setsDone(e, logs) + setsRemaining(e, logs), 0);
  const restShowing = !!restEndsAt && active;

  return (
    // Extra room at the bottom while the rest timer is docked over the content.
    <div className={`flex flex-col gap-4 ${restShowing ? "pb-28" : "pb-4"}`}>
      <PageHeader
        title={session.status === "done" ? "Session done" : "Session"}
        overline={ctx.gym.name}
        action={
          <button type="button" className={linkClass} onClick={() => setWhy(true)}>
            Why?
          </button>
        }
      />

      {session.status === "done" && celebration && (
        <CelebrationCard label="Session done" celebration={celebration} />
      )}

      {active && totalSets > 0 && (
        // Goal-gradient: how far through today's sets you are.
        <div className="flex flex-col gap-2 rounded-card bg-primary-container px-5 py-4 text-on-primary-container">
          <div className="flex items-baseline justify-between">
            <span className="text-title">
              {doneSets} of {totalSets} sets
            </span>
            <span className="text-[13px] opacity-85">
              {doneSets === 0
                ? "Let's go"
                : totalSets - doneSets <= 2 && doneSets < totalSets
                  ? "Nearly there"
                  : doneSets >= totalSets
                    ? "All planned sets done"
                    : `${totalSets - doneSets} to go`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Sets done"
            aria-valuemin={0}
            aria-valuemax={totalSets}
            aria-valuenow={doneSets}
            className="h-2 overflow-hidden rounded-full bg-on-primary-container/15"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.min(100, (doneSets / totalSets) * 100)}%` }}
            />
          </div>
        </div>
      )}

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
            placeholder='Quick log, e.g. "80x8 @9"'
            aria-label="Quick log"
          />
          <Button
            type="submit"
            variant="tonal"
            className="min-h-14! w-auto! px-5"
            disabled={!quick.trim()}
          >
            Log
          </Button>
        </form>
      )}

      {review && (
        <div className="rounded-card bg-tertiary-container p-5 text-sm text-on-tertiary-container">
          <p className="text-title">Check this before logging</p>
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
            <p className="mt-1 opacity-85">{review.issues.join("; ")}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {review.exerciseId && review.sets.length > 0 && (
              <Button
                variant="primary"
                className="w-auto! px-5"
                onClick={() => void commitParsed(review)}
              >
                Log it
              </Button>
            )}
            {ai?.enabled && (
              <Button variant="tonal" className="w-auto! px-5" onClick={() => void askAiToParse()}>
                Ask AI
              </Button>
            )}
            <Button variant="text" className="w-auto! px-4" onClick={() => setReview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {busyPrompt && (
        <div role="status" className="rounded-card bg-surface-container-high p-5 text-sm">
          {ctx.equipmentById.get(busyPrompt.equipmentId)?.name} is often busy at this time.
          Deprioritise it on {WEEKDAYS[busyPrompt.weekday]}s around {busyPrompt.bucket * 2}:00–
          {busyPrompt.bucket * 2 + 2}:00?
          <span className="mt-3 flex gap-2">
            <Button
              variant="tonal"
              className="w-auto! px-5"
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
            <Button variant="text" className="w-auto! px-4" onClick={() => setBusyPrompt(null)}>
              No
            </Button>
          </span>
        </div>
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
          lead={e === visible.find((x) => x.isAnchor)}
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
          variant={current ? "tonal" : "primary"}
          size={current ? "md" : "lg"}
          className={current ? "" : "min-h-16"}
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
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl bg-inverse-surface py-2 pr-2 pl-4 text-sm text-inverse-on-surface shadow-lg"
        >
          <span className="py-1.5">{toast.text}</span>
          <span className="flex shrink-0 items-center gap-1">
            {toast.undo && (
              <button
                type="button"
                className="min-h-10 rounded-full px-3 font-semibold text-inverse-primary"
                onClick={() => void undo(toast.undo!)}
              >
                Undo
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              className="flex h-10 w-10 items-center justify-center rounded-full"
              onClick={() => setToast(null)}
            >
              <CloseIcon size={18} />
            </button>
          </span>
        </div>
      )}

      {restShowing && (
        <RestTimer
          endsAt={restEndsAt!}
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
