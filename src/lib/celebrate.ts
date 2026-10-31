import type { WeekVolume } from "@/engine/progress";

/**
 * Copy for the celebratory cards (the session finish and the top of
 * Progress). Every claim is computed from logged sets; when there is nothing
 * to compare against, the copy says something true and modest instead.
 */

export interface Celebration {
  headline: string;
  body: string;
}

const sets = (n: number) => `${n} working set${n === 1 ? "" : "s"}`;

function sessionsLine(completed: number, planned: number): string {
  if (planned <= 0) return "";
  if (completed >= planned) return ` All ${planned} planned sessions done.`;
  const left = planned - completed;
  return ` ${completed} of ${planned} sessions done, ${left} to go.`;
}

/**
 * This week against earlier weeks. `weeks` is oldest first with this week
 * last (engine/progress weeklyVolume).
 */
export function weekCelebration(
  weeks: readonly WeekVolume[],
  completed: number,
  planned: number,
): Celebration {
  const current = weeks.at(-1)?.total ?? 0;
  const earlier = weeks.slice(0, -1).map((w) => w.total);
  const lastWeek = earlier.at(-1) ?? 0;
  const best = Math.max(0, ...earlier);
  const tail = sessionsLine(completed, planned);

  if (current === 0) {
    return {
      headline: "A fresh week",
      body: `No working sets logged yet this week.${tail}`.trim(),
    };
  }
  let body: string;
  if (best === 0) body = "No recent week to compare with yet.";
  else if (current > best) body = `Your biggest week so far, up from ${best}.`;
  else if (current === best) body = `Level with your biggest week so far.`;
  else if (lastWeek > 0 && current > lastWeek) body = `Up from ${lastWeek} last week.`;
  else if (lastWeek > 0 && current === lastWeek) body = `Same as last week so far.`;
  else if (lastWeek > 0) body = `Last week finished on ${lastWeek}.`;
  else body = `Your best week recently was ${best}.`;
  return { headline: sets(current), body: `${body}${tail}` };
}

/** A finished session against the previous finished one. */
export function sessionCelebration({
  workingSets,
  previousSets,
  newBests,
}: {
  workingSets: number;
  /** Working sets in the previous finished session; null when there isn't one. */
  previousSets: number | null;
  /** Names of exercises whose estimated 1RM reached a new high today. */
  newBests: readonly string[];
}): Celebration {
  let body: string;
  if (workingSets === 0) body = "Nothing logged today; the planned sets move to later this week.";
  else if (previousSets === null) body = "Your first finished session is on the record.";
  else if (workingSets > previousSets)
    body = `${workingSets - previousSets} more than last session (${previousSets}).`;
  else if (workingSets === previousSets) body = "Same volume as last session.";
  else body = `Last session had ${previousSets}; today still counts.`;

  if (newBests.length === 1) body += ` New best estimate on ${newBests[0]}.`;
  else if (newBests.length > 1)
    body += ` New best estimates on ${newBests.slice(0, -1).join(", ")} and ${newBests.at(-1)}.`;
  return { headline: workingSets === 0 ? "Session closed" : sets(workingSets), body };
}
