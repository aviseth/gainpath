import { explain } from "@/engine/explain";
import type { Readiness } from "@/engine/readiness";
import type { LiveSession } from "@/engine/session";
import type { Exercise, RationaleEntry } from "@/engine/types";

/**
 * Plain-language copy for the Today coach card. Deterministic: every sentence
 * is built from data the plan already holds, through the explanation
 * templates (ALGORITHMS §16). No LLM, no numbers that aren't in the data.
 */

export function greeting(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

/** "avi.seth@x.com" → "Avi". null when the local part doesn't look like a name. */
export function firstNameFromEmail(email: string | null | undefined): string | null {
  const local = email?.split("@")[0];
  const first = local?.split(/[._+\-]/)[0];
  if (!first || !/^[a-z]{2,20}$/i.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function readinessTitle(band: Readiness["band"]): string {
  if (band === "normal") return "Ready for a full session";
  if (band === "reduced") return "A bit flat: slightly lighter today";
  return "Take it easier today";
}

/** The anchor's progression sentence (PROG-1 family or a first-time estimate), if any. */
const ANCHOR_RULES = ["PROG-1", "PROG-1-HOLD", "PROG-1-REDUCE", "PROG-2", "ESTIMATE"];

function readinessSentence(
  readiness: Readiness,
  hasCheckin: boolean,
  sleepHours: number | null,
  deload: RationaleEntry | undefined,
): string {
  if (deload) return explain(deload);
  // READY-1 (short sleep) is the most concrete reason; READY-3 otherwise.
  const reason =
    readiness.rationale.find((r) => r.rule === "READY-1") ??
    readiness.rationale.find((r) => r.rule === "READY-3") ??
    readiness.rationale[0];
  if (reason) return explain(reason);
  if (!hasCheckin) return "No check-in today, so the plan uses your usual targets.";
  if (sleepHours !== null) return `You slept ${sleepHours} hours, so today is a normal session.`;
  return "Your check-in looks good, so today is a normal session.";
}

export function coachNote({
  readiness,
  hasCheckin,
  sleepHours,
  live,
  catalog,
}: {
  readiness: Readiness;
  hasCheckin: boolean;
  /** Hours slept from today's check-in, when given. */
  sleepHours: number | null;
  live: LiveSession | null;
  catalog: ReadonlyMap<string, Exercise>;
}): string {
  const deload = live?.meta.isDeload
    ? live.meta.rationale.find((r) => r.rule === "DELOAD-2")
    : undefined;
  const sentences = [readinessSentence(readiness, hasCheckin, sleepHours, deload)];
  const anchor = live?.exercises.find((e) => e.isAnchor && e.status !== "swapped_out");
  if (anchor) {
    const name = catalog.get(anchor.exerciseId)?.name ?? "Your main lift";
    const step = anchor.rationale.find((r) => ANCHOR_RULES.includes(r.rule));
    sentences.push(`${name} is your anchor.`);
    if (step?.rule === "ESTIMATE") {
      // Same facts as the ESTIMATE template (PROG-3), phrased as a plain sentence.
      sentences.push(
        `It's your first time on this machine, so it starts light (±${step.vars.pct}%) and your first set recalibrates it.`,
      );
    } else if (step) {
      sentences.push(explain(step));
    }
  }
  return sentences.join(" ");
}
