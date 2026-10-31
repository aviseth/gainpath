"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { repo } from "@/data/repo";
import type { RecordOf } from "@/data/schema";
import type { TrainingContext } from "@/data/training";
import { e1rmSeries } from "@/engine/progress";
import { sessionCelebration, type Celebration } from "@/lib/celebrate";

/**
 * The finish-screen card for a done session: its working sets against the
 * previous finished session, plus lifts whose e1RM reached a new high.
 * undefined while loading; null when there's nothing to celebrate yet.
 */
export function useSessionCelebration(
  session: RecordOf<"sessions"> | null | undefined,
  ctx: TrainingContext | null | undefined,
): Celebration | null | undefined {
  return useLiveQuery(async () => {
    if (!session || session.status !== "done" || !ctx) return null;
    const [logs, sessions] = await Promise.all([repo("set_logs").list(), repo("sessions").list()]);
    const working = logs.filter((l) => !l.is_warmup);
    const count = (id: string) => working.filter((l) => l.session_id === id).length;
    const previous = sessions
      .filter((s) => s.status === "done" && s.id !== session.id && s.date <= session.date)
      .sort((a, b) => b.date.localeCompare(a.date) || b.updated_at - a.updated_at)[0];

    const mine = new Set(working.filter((l) => l.session_id === session.id).map((l) => l.ts));
    const newBests = e1rmSeries(working, ctx.profile.calibration_offset, ctx.cfg)
      .filter((s) => {
        if (s.points.length < 2 || !mine.has(s.points.at(-1)!.ts)) return false;
        const before = Math.max(...s.points.slice(0, -1).map((p) => p.e1rm));
        return s.latest > before;
      })
      .map((s) => ctx.catalog.get(s.exerciseId)?.name ?? "a lift");

    return sessionCelebration({
      workingSets: count(session.id),
      previousSets: previous ? count(previous.id) : null,
      newBests: [...new Set(newBests)],
    });
  }, [session?.id, session?.status, ctx]);
}
