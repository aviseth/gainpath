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
import { EmptyState, Select } from "@/components/forms";
import { Section } from "@/components/ui";
import { getDB } from "@/data/db";
import { MUSCLES, type Muscle } from "@/data/schema";
import { e1rmSeries, isBodyweight, weeklyVolume } from "@/engine/progress";
import { muscleLabel } from "@/engine/vector";
import { weeklyTargets } from "@/engine/volume";
import { useTrainingContext } from "@/hooks/use-training";
import { formatDate, formatKg } from "@/lib/labels";
import { WeeklyReview } from "./weekly-review";

const AXIS = { stroke: "#5a5d61", fontSize: 11 };
const TOOLTIP = {
  contentStyle: {
    background: "#fbfaf7",
    border: "1px solid #16181a",
    borderRadius: 12,
    fontSize: 12,
  },
  labelStyle: { color: "#5a5d61" },
};

export function ProgressScreen() {
  const ctx = useTrainingContext();
  const sets = useLiveQuery(
    async () => (await getDB().set_logs.toArray()).filter((s) => s.deleted_at === null),
    [],
  );
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

  if (ctx === undefined || sets === undefined) return <p className="text-zinc-400">Loading…</p>;
  if (!ctx) return <EmptyState>Finish setup on the Today tab first.</EmptyState>;

  const label = (s: (typeof series)[number]) => {
    const name = ctx.catalog.get(s.exerciseId)?.name ?? "Exercise";
    const eq = isBodyweight(s.equipmentId) ? null : ctx.equipmentById.get(s.equipmentId)?.name;
    return eq ? `${name} · ${eq}` : name;
  };
  const current = series.find((s) => s.key === selected) ?? series[0];
  const targets = weeklyTargets(ctx.profile.goal, ctx.profile.experience, ctx.userAdjust, ctx.cfg);
  const thisWeek = weeks.at(-1);
  const volumeRows = MUSCLES.map((m) => ({
    muscle: muscleLabel(m),
    done: Math.round((thisWeek?.perMuscle[m] ?? 0) * 10) / 10,
    target: Math.round(targets[m] * 10) / 10,
  }));

  return (
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="text-2xl font-bold">Progress</h1>

      <Section
        title="Estimated 1RM"
        description="Per exercise and per machine: the same movement on different machines is tracked separately (PROG-3)."
      >
        {series.length === 0 ? (
          <EmptyState>Log some working sets to see strength trends.</EmptyState>
        ) : (
          <>
            <Select
              aria-label="Exercise and machine"
              value={current.key}
              onChange={setSelected}
              options={series.map((s) => ({ value: s.key, label: label(s) }))}
            />
            <p className="text-sm">
              <span className="text-2xl font-bold tabular-nums">
                {formatKg(Math.round(current.latest * 10) / 10)}
              </span>{" "}
              {current.points.length > 1 && (
                <span className={current.change >= 0 ? "text-lime-400" : "text-amber-300"}>
                  {current.change >= 0 ? "+" : ""}
                  {(current.change * 100).toFixed(1)}% since {formatDate(current.points[0].ts)}
                </span>
              )}
            </p>
            <div className="h-56" data-testid="e1rm-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={current.points.map((p) => ({
                    date: formatDate(p.ts),
                    e1rm: Math.round(p.e1rm * 10) / 10,
                  }))}
                >
                  <CartesianGrid stroke="#dddbd3" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} />
                  <YAxis tick={AXIS} width={40} domain={["auto", "auto"]} />
                  <Tooltip {...TOOLTIP} formatter={(v) => [`${v} kg`, "e1RM"]} />
                  <Line
                    type="monotone"
                    dataKey="e1rm"
                    stroke="#b8301a"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Section>

      <Section
        title="This week's volume"
        description="Working sets per muscle (a synergist counts half, VOL-2) against your weekly target (VOL-1, VOL-5)."
      >
        <div className="h-[28rem]" data-testid="volume-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={volumeRows} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke="#dddbd3" horizontal={false} />
              <XAxis type="number" tick={AXIS} />
              <YAxis type="category" dataKey="muscle" tick={AXIS} width={80} />
              <Tooltip {...TOOLTIP} />
              <Bar
                dataKey="target"
                name="Target"
                fill="#dddbd3"
                barSize={8}
                isAnimationActive={false}
              />
              <Bar
                dataKey="done"
                name="Done"
                fill="#16181a"
                barSize={8}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="h-40">
          <p className="text-xs text-zinc-400">Working sets per week</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks.map((w) => ({ week: formatDate(w.weekStart), sets: w.total }))}>
              <XAxis dataKey="week" tick={AXIS} />
              <YAxis tick={AXIS} width={30} allowDecimals={false} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="sets" fill="#16181a" isAnimationActive={false} />
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

function RecoveryMap({ recovery }: { recovery: Record<Muscle, number> }) {
  return (
    <ul className="grid grid-cols-2 gap-2" aria-label="Recovery by muscle">
      {MUSCLES.map((m) => {
        const r = Math.max(0, Math.min(1, recovery[m] ?? 1));
        const tone =
          r >= 0.85
            ? "bg-zinc-900 text-zinc-100"
            : r >= 0.6
              ? "bg-amber-400/20 text-amber-100"
              : "bg-red-500/15 text-red-200";
        return (
          <li
            key={m}
            className={`flex min-h-11 items-center justify-between rounded-lg px-3 text-sm ${tone}`}
          >
            <span>{muscleLabel(m)}</span>
            <span className="tabular-nums">{Math.round(r * 100)}%</span>
          </li>
        );
      })}
    </ul>
  );
}
