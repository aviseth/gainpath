"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CelebrationCard, SegmentedProgress } from "@/components/celebration-card";
import { Badge, EmptyState, Select } from "@/components/forms";
import { PageHeader, Section } from "@/components/ui";
import { repo } from "@/data/repo";
import { MUSCLES, type Muscle } from "@/data/schema";
import { e1rmSeries, isBodyweight, weeklyVolume } from "@/engine/progress";
import { muscleLabel } from "@/engine/vector";
import { weeklyTargets } from "@/engine/volume";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-colors";
import { useTrainingContext } from "@/hooks/use-training";
import { weekCelebration } from "@/lib/celebrate";
import { changeDisplay, formatDate, formatKg, recoveryTone } from "@/lib/labels";
import { WeeklyReview } from "./weekly-review";

const chartTheme = (c: ThemeColors) => ({
  axis: { stroke: c["on-surface-variant"], fill: c["on-surface-variant"], fontSize: 11 },
  tooltip: {
    contentStyle: {
      background: c["surface-container-lowest"],
      border: "none",
      borderRadius: 12,
      boxShadow: "0 2px 8px rgb(0 0 0 / 0.15)",
      color: c["on-surface"],
      fontSize: 12,
    },
    labelStyle: { color: c["on-surface-variant"] },
    itemStyle: { color: c["on-surface"] },
    cursor: { fill: c["surface-container-highest"], fillOpacity: 0.5 },
  },
});

export function ProgressScreen() {
  const ctx = useTrainingContext();
  const sets = useLiveQuery(() => repo("set_logs").list(), []);
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string | null>(null);

  const series = useMemo(
    () => (ctx && sets ? e1rmSeries(sets, ctx.profile.calibration_offset, ctx.cfg) : []),
    [ctx, sets],
  );
  const weeks = useMemo(
    // ctx.now is read in the browser when the context loads, so render stays pure.
    () => (ctx && sets ? weeklyVolume(sets, ctx.catalog, ctx.now, 8) : []),
    [ctx, sets],
  );

  if (ctx === undefined || sets === undefined)
    return <p className="px-1 text-on-surface-variant">Loading…</p>;
  if (!ctx) return <EmptyState>Finish setup on the Today tab first.</EmptyState>;

  const theme = chartTheme(colors);
  const label = (s: (typeof series)[number]) => {
    const name = ctx.catalog.get(s.exerciseId)?.name ?? "Exercise";
    const eq = isBodyweight(s.equipmentId) ? null : ctx.equipmentById.get(s.equipmentId)?.name;
    return eq ? `${name} · ${eq}` : name;
  };
  const current = series.find((s) => s.key === selected) ?? series[0];
  const targets = weeklyTargets(ctx.profile.goal, ctx.profile.experience, ctx.userAdjust, ctx.cfg);
  const thisWeek = weeks.at(-1);
  const round = (x: number) => Math.round(x * 10) / 10;
  // A muscle is behind when it's under the share of its target the week so far calls for.
  const muscles = MUSCLES.filter((m) => targets[m] > 0).map((m) => {
    const done = round(thisWeek?.perMuscle[m] ?? 0);
    const target = round(targets[m]);
    return { m, done, target, behind: done < target * ctx.week.progress - 0.5 };
  });
  const behind = muscles.filter((x) => x.behind).map((x) => muscleLabel(x.m));
  const completed = thisWeek?.sessions ?? 0;
  const celebration = weekCelebration(weeks, completed, ctx.week.plannedSessions);

  return (
    <div className="flex flex-col gap-3 pb-8">
      <PageHeader title="Your progress" />

      {/* Peak-End: open on what went well this week, from real numbers. */}
      <CelebrationCard label="This week" celebration={celebration}>
        <SegmentedProgress
          done={completed}
          total={ctx.week.plannedSessions}
          label={`${completed} of ${ctx.week.plannedSessions} sessions this week`}
        />
      </CelebrationCard>

      <Section
        title="Muscles this week"
        description="Working sets against your weekly target (a synergist counts half, VOL-2)."
      >
        <ul className="flex flex-col gap-2.5" aria-label="Sets per muscle this week">
          {muscles.map(({ m, done, target, behind: isBehind }) => (
            <li
              key={m}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.25rem] items-center gap-2.5 text-sm"
            >
              <span className="truncate">{muscleLabel(m)}</span>
              <span
                className="flex h-3 overflow-hidden rounded-full bg-surface-container-highest"
                role="meter"
                aria-label={`${muscleLabel(m)}: ${done} of ${target} sets`}
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={Math.min(done, target)}
              >
                <span
                  className={`rounded-full ${isBehind ? "bg-tertiary" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, (done / target) * 100)}%` }}
                />
              </span>
              <span className="text-right text-on-surface-variant tabular-nums">
                {done}/{target}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-on-surface-variant">
          {behind.length > 0
            ? `Behind this week's pace: ${behind.join(", ")}. The next sessions lean towards them (VOL-1, VOL-5).`
            : "Every muscle is on pace for this point in the week."}
        </p>
      </Section>

      <Section
        title="Strength estimates"
        description="Estimated 1RM per exercise and per machine: the same movement on different machines is tracked separately (PROG-3)."
      >
        {series.length === 0 ? (
          <EmptyState>Log some working sets to see strength trends.</EmptyState>
        ) : (
          <>
            <ul className="flex flex-col gap-2.5">
              {series.slice(0, 5).map((s) => {
                const change = changeDisplay(s.change);
                return (
                  <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{label(s)}</span>
                    <span className="flex shrink-0 items-center gap-2 font-extrabold tabular-nums">
                      {formatKg(round(s.latest))}
                      {s.points.length > 1 && change.tone !== "flat" && (
                        <Badge tone={change.tone === "up" ? "good" : "bad"}>{change.text}</Badge>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-col gap-3 rounded-[20px] bg-surface-container-lowest p-3">
              <Select
                aria-label="Exercise and machine"
                value={current.key}
                onChange={setSelected}
                options={series.map((s) => ({ value: s.key, label: label(s) }))}
              />
              <p className="px-1 text-sm">
                <span className="text-2xl font-bold tabular-nums">
                  {formatKg(round(current.latest))}
                </span>{" "}
                {current.points.length > 1 && (
                  <ChangeText change={current.change} since={current.points[0].ts} />
                )}
              </p>
              <div className="h-52" data-testid="e1rm-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={current.points.map((p) => ({
                      date: formatDate(p.ts),
                      e1rm: round(p.e1rm),
                    }))}
                    margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid stroke={colors["outline-variant"]} vertical={false} />
                    <XAxis dataKey="date" tick={theme.axis} stroke={colors["outline-variant"]} />
                    <YAxis
                      tick={theme.axis}
                      stroke={colors["outline-variant"]}
                      width={40}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip {...theme.tooltip} formatter={(v) => [`${v} kg`, "e1RM"]} />
                    <Line
                      type="monotone"
                      dataKey="e1rm"
                      stroke={colors.primary}
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: colors.primary, strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </Section>

      <Section
        title="Working sets per week"
        description="The last 8 weeks, this week on the right."
      >
        <div className="h-40" data-testid="volume-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={weeks.map((w) => ({ week: formatDate(w.weekStart), sets: w.total }))}
              margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
            >
              <XAxis dataKey="week" tick={theme.axis} stroke={colors["outline-variant"]} />
              <YAxis
                tick={theme.axis}
                stroke={colors["outline-variant"]}
                width={30}
                allowDecimals={false}
              />
              <Tooltip {...theme.tooltip} />
              <Bar
                dataKey="sets"
                fill={colors.primary}
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section
        title="Recovery"
        description="Estimated from recent sets and soreness (REC-1). A rule of thumb, not a measurement."
      >
        <RecoveryMap recovery={ctx.recovery} />
      </Section>

      <WeeklyReview ctx={ctx} />
    </div>
  );
}

function ChangeText({ change, since }: { change: number; since: number }) {
  const { text, tone } = changeDisplay(change);
  return (
    <span className={CHANGE_CLASS[tone]}>
      {text} since {formatDate(since)}
    </span>
  );
}

// Gains in primary, losses in error.
const CHANGE_CLASS = {
  up: "font-semibold text-primary",
  down: "font-semibold text-error",
  flat: "text-on-surface-variant",
};
// M3 tonal chips: recovered = neutral, partly = tertiary, low = error.
const RECOVERY_CLASS = {
  ok: "bg-surface-container-highest text-on-surface",
  partial: "bg-tertiary-container text-on-tertiary-container",
  low: "bg-error-container text-on-error-container",
};

function RecoveryMap({ recovery }: { recovery: Record<Muscle, number> }) {
  return (
    <ul className="grid grid-cols-2 gap-2" aria-label="Recovery by muscle">
      {MUSCLES.map((m) => {
        // Engine recovery is 0–100 (100 = fully recovered).
        const r = Math.round(Math.max(0, Math.min(100, recovery[m] ?? 100)));
        return (
          <li
            key={m}
            className={`flex min-h-11 items-center justify-between rounded-xl px-3 text-sm ${RECOVERY_CLASS[recoveryTone(r)]}`}
          >
            <span className="truncate">{muscleLabel(m)}</span>
            <span className="font-semibold tabular-nums">{r}%</span>
          </li>
        );
      })}
    </ul>
  );
}
