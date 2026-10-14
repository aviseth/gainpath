import type { RationaleEntry } from "./types";

/**
 * Explanations without the LLM (ALGORITHMS §16). Each rule id maps to a
 * sentence template. Rules graded H in EVIDENCE.md say "rule of thumb" rather
 * than "research shows" (EVIDENCE §10.3).
 */

interface Template {
  text: string;
  /** EVIDENCE.md rule this sentence cites. */
  cites: string;
  heuristic: boolean;
}

export const TEMPLATES: Record<string, Template> = {
  "REST-1": {
    text: "Rest {rest}s: longer than 60–90 s helps preserve your working sets.",
    cites: "REST-1",
    heuristic: false,
  },
  "REST-1-TIMESAVER": {
    text: "Rest {rest}s (time-saver mode). Shorter rests trade a little muscle growth for time.",
    cites: "REST-1",
    heuristic: false,
  },
  "READY-1": {
    text: "Volume trimmed because you slept {hours} hours (6 or less).",
    cites: "READY-1",
    heuristic: false,
  },
  "READY-2": {
    text: "HRV is below your usual range, so today is slightly lighter (soft signal only).",
    cites: "READY-2",
    heuristic: true,
  },
  "READY-3": {
    text: "Readiness {score}/100: about {pct}% fewer sets and a little more in reserve today.",
    cites: "READY-3",
    heuristic: true,
  },
  "PROG-1": {
    text: "You hit {reps} reps at RPE {rpe} last time, so load goes up to {load} kg.",
    cites: "PROG-1",
    heuristic: false,
  },
  "PROG-1-HOLD": {
    text: "Same load ({load} kg); aim for {reps} reps.",
    cites: "PROG-1",
    heuristic: false,
  },
  "PROG-1-REDUCE": {
    text: "Reps fell short twice in a row, so load drops to {load} kg to rebuild.",
    cites: "PROG-1",
    heuristic: false,
  },
  "PROG-1-INSESSION-DOWN": {
    text: "That set was harder than planned (RPE {rpe}), so the next sets use {load} kg.",
    cites: "PROG-1",
    heuristic: false,
  },
  "PROG-1-INSESSION-UP": {
    text: "That set was easier than planned (RPE {rpe}), so the next sets use {load} kg.",
    cites: "PROG-1",
    heuristic: false,
  },
  "PROG-2": {
    text: "The next step (+{step} kg) is a big jump on this machine, so build reps first.",
    cites: "PROG-2",
    heuristic: true,
  },
  "EFF-2": {
    text: "Last set was taken to failure on a heavy lift, so one set is dropped to protect recovery.",
    cites: "EFF-2",
    heuristic: false,
  },
  "EFF-3": {
    text: "Last set of {exercise} is a calibration set: go to failure to tune your RPE.",
    cites: "EFF-3",
    heuristic: false,
  },
  "VOL-1": {
    text: "{muscle} is at {done}/{target} sets this week.",
    cites: "VOL-1",
    heuristic: false,
  },
  "VOL-4": {
    text: "Capped at {cap} sets per muscle today (per-session limit).",
    cites: "VOL-4",
    heuristic: false,
  },
  "REC-1": {
    text: "{muscle} is still recovering ({recovery}%), so it gets fewer sets today.",
    cites: "REC-1",
    heuristic: true,
  },
  "PHIL-1": {
    text: "{muscle} hasn't been trained yet this week, so it gets priority.",
    cites: "PHIL-1",
    heuristic: false,
  },
  SWAP: { text: "{match}% muscle match for {original}. {diff}", cites: "VOL-2", heuristic: false },
  "DELOAD-2": {
    text: "Lighter week: same exercises, about {pct}% fewer sets, keep 3+ reps in reserve.",
    cites: "DELOAD-2",
    heuristic: false,
  },
  "DELOAD-1-PLATEAU": {
    text: "{count} of your main lifts have stalled; a lighter week may help.",
    cites: "DELOAD-1",
    heuristic: true,
  },
  "DELOAD-1-READINESS": {
    text: "Readiness has been low on {days} of the last 7 days; a lighter week may help.",
    cites: "DELOAD-1",
    heuristic: true,
  },
  "DELOAD-1-REQUEST": {
    text: "You asked for a lighter week.",
    cites: "DELOAD-1",
    heuristic: false,
  },
  "DELOAD-1-REMINDER": {
    text: "It's been {weeks} weeks since your last lighter week. Consider one if you feel run down.",
    cites: "DELOAD-1",
    heuristic: true,
  },
  ESTIMATE: {
    text: "First time on this machine: starting conservatively (±{pct}%); the first set will recalibrate.",
    cites: "PROG-3",
    heuristic: false,
  },
  ANCHOR: {
    text: "{exercise} stays in your plan this block so progress is measurable.",
    cites: "PROG-1",
    heuristic: true,
  },
  PAIN: {
    text: "Exercises loading your {region} were removed today. If the pain persists, see a professional.",
    cites: "EVIDENCE §10",
    heuristic: false,
  },
};

const fill = (text: string, vars: RationaleEntry["vars"]) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));

export function explain(entry: RationaleEntry): string {
  const template = TEMPLATES[entry.rule];
  if (!template) return entry.rule;
  const sentence = fill(template.text, entry.vars);
  return template.heuristic ? `${sentence} (rule of thumb)` : sentence;
}

/** Cited rule id for display, e.g. "REST-1". */
export function citation(entry: RationaleEntry): string {
  return TEMPLATES[entry.rule]?.cites ?? entry.rule;
}

/** One line per distinct explanation, in order. */
export function explainAll(entries: readonly RationaleEntry[]): string[] {
  return [...new Set(entries.map(explain))];
}
