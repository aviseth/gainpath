"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Badge } from "@/components/forms";
import { Button, Notice, Section } from "@/components/ui";
import { getDB } from "@/data/db";
import { repo } from "@/data/repo";
import { buildWeeklySummary, isoDate, lastWeekStart } from "@/data/review";
import type { TrainingContext } from "@/data/training";
import { AiError, callAi, useAiStatus } from "@/lib/ai-client";
import { reviewResult, type ReviewResult } from "@/lib/ai-schemas";

/** Opt-in AI narrative of last week, cached per week (≤ 1 call a week, ALGORITHMS §18). */
export function WeeklyReview({ ctx }: { ctx: TrainingContext }) {
  const ai = useAiStatus();
  const start = lastWeekStart(ctx.now);
  const key = isoDate(start);
  const cached = useLiveQuery(async () => {
    const rows = await getDB()
      .ai_cache.where("[kind+key]")
      .equals(["weekly_review", key])
      .toArray();
    const parsed = reviewResult.safeParse(rows.find((r) => r.deleted_at === null)?.value);
    return parsed.success ? parsed.data : null;
  }, [key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ai?.enabled && !cached) return null;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const summary = await buildWeeklySummary(getDB(), ctx, start);
      if (summary.total_working_sets === 0) {
        setError("No training logged last week, so there's nothing to review.");
        return;
      }
      const result = reviewResult.parse(
        await callAi<ReviewResult>("review", { week_start: key, summary }),
      );
      await repo("ai_cache", getDB()).create({ kind: "weekly_review", key, value: result });
    } catch (e) {
      setError(e instanceof AiError ? e.message : "Couldn't create the review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title={`Week of ${new Date(start).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
    >
      {cached ? (
        <article className="flex flex-col gap-2 text-sm">
          <p className="text-title">{cached.headline}</p>
          {cached.paragraphs.map((p, i) => (
            <p key={i} className="text-on-surface">
              {p}
            </p>
          ))}
          {cached.suggestions.length > 0 && (
            <ul className="list-disc pl-5 text-on-surface">
              {cached.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1">
            {cached.rule_ids.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">
            Written by AI from the app&apos;s own numbers.
          </p>
        </article>
      ) : (
        <Button variant="tonal" disabled={busy} onClick={() => void generate()}>
          {busy ? "Writing…" : "Weekly review (AI)"}
        </Button>
      )}
      {error && <Notice>{error}</Notice>}
    </Section>
  );
}
