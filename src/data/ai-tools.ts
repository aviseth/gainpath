import { MUSCLES } from "@/data/schema";
import { chatToolInputs, type ChatToolName } from "@/lib/ai-schemas";
import { matchExercise } from "@/engine/parser";
import { planExercise } from "@/engine/plan";
import { setsRemaining } from "@/engine/session";
import { findSubstitutes } from "@/engine/swap";
import { weeklyDone, weeklyTargets } from "@/engine/volume";
import type { MuscleMap } from "@/engine/fatigue";
import { localDate } from "./actions";
import type { GainpathDB } from "./db";
import { repo } from "./repo";
import { sessionLogs, todaysSession } from "./sessions";
import { loadTrainingContext, planInputFrom, readLive } from "./training";

/**
 * The "Ask Gainpath" chat tools (PROMPT "AI layer"). They run on the device
 * against the local database and the deterministic engine, so every number
 * the model quotes comes from here. Inputs are validated with Zod first.
 */

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

export async function runChatTool(
  db: GainpathDB,
  name: string,
  rawInput: unknown,
): Promise<{ content: string; isError?: boolean; summary: string }> {
  if (!(name in chatToolInputs))
    return { content: `Unknown tool ${name}`, isError: true, summary: name };
  const parsed = chatToolInputs[name as ChatToolName].safeParse(rawInput ?? {});
  if (!parsed.success) return { content: "Invalid input.", isError: true, summary: name };
  const ctx = await loadTrainingContext(db);
  if (!ctx)
    return {
      content: "The user hasn't set up a profile and gym yet.",
      isError: true,
      summary: name,
    };
  const json = (value: unknown) => JSON.stringify(value);

  switch (name as ChatToolName) {
    case "get_available_equipment": {
      const usable = ctx.equipment.filter(
        (e) =>
          e.status === "active" &&
          !ctx.excludedEquipment.has(e.id) &&
          !ctx.tempExcludedEquipment.has(e.id),
      );
      return {
        summary: "Checked your equipment",
        content: json({
          gym: ctx.gym.name,
          available: usable.map((e) => ({ id: e.id, name: e.name, type: e.type })),
          broken: ctx.equipment.filter((e) => e.status === "broken").map((e) => e.name),
          excluded_today: ctx.equipment
            .filter((e) => ctx.tempExcludedEquipment.has(e.id))
            .map((e) => e.name),
        }),
      };
    }
    case "get_recovery_state": {
      const targets = weeklyTargets(
        ctx.profile.goal,
        ctx.profile.experience,
        ctx.userAdjust,
        ctx.cfg,
      );
      const done = weeklyDone(ctx.history, ctx.catalog, ctx.now);
      return {
        summary: "Checked recovery and weekly volume",
        content: json({
          note: "recovery: 0–100 per muscle, 100 = fully recovered (REC-1, rule of thumb). Volume in fractional sets over the last 7 days vs weekly target (VOL-1, VOL-2).",
          muscles: MUSCLES.map((m) => ({
            muscle: m,
            recovery: round((ctx.recovery as MuscleMap)[m]),
            sets_last_7_days: round(done[m]),
            weekly_target: round(targets[m]),
          })),
          sessions_this_week: { completed: ctx.week.completed, planned: ctx.week.plannedSessions },
          deload: {
            active: ctx.deload.active,
            suggested: ctx.deload.check.trigger,
            reminder: ctx.deload.check.reminder,
            rationale: ctx.deload.check.rationale,
          },
        }),
      };
    }
    case "get_readiness": {
      return {
        summary: "Checked today's readiness",
        content: json({
          has_checkin_today: ctx.hasCheckin,
          score: round(ctx.readiness.score, 2),
          band: ctx.readiness.band,
          volume_multiplier: ctx.readiness.volumeMod,
          extra_reps_in_reserve: ctx.readiness.rirAdd,
          load_increase_allowed: ctx.readiness.allowLoadIncrease,
          rationale: ctx.readiness.rationale,
        }),
      };
    }
    case "find_substitutes": {
      const { exercise_name } = chatToolInputs.find_substitutes.parse(rawInput);
      const refs = [...ctx.catalog.values()].map((e) => ({ id: e.id, name: e.name }));
      const match = matchExercise(exercise_name, [], refs);
      const exercise = match && match.score >= 0.5 ? ctx.catalog.get(match.id) : undefined;
      if (!exercise)
        return {
          summary: "Looked for substitutes",
          content: json({ error: `No exercise matches "${exercise_name}".` }),
        };

      const session = await todaysSession(db);
      const live = session ? readLive(session) : null;
      const planned = live?.exercises.find((e) => e.exerciseId === exercise.id);
      const logs = session ? await sessionLogs(db, session.id) : [];
      const sets = planned?.setsTarget ?? 3;
      const caps =
        live?.meta.caps ??
        (Object.fromEntries(MUSCLES.map((m) => [m, ctx.cfg.sessionCapPerMuscle])) as MuscleMap);
      const result = findSubstitutes({
        removed: {
          exercise,
          plannedSets: sets,
          remainingSets: planned ? setsRemaining(planned, logs) : sets,
        },
        candidates: ctx.candidates.filter((c) => c.exercise.id !== exercise.id),
        sessionOthers: (live?.exercises ?? [])
          .filter(
            (e) => e.exerciseId !== exercise.id && (e.status === "pending" || e.status === "done"),
          )
          .flatMap((e) => {
            const ex = ctx.catalog.get(e.exerciseId);
            return ex ? [{ exercise: ex, sets: e.setsTarget }] : [];
          }),
        caps,
        recovery: ctx.recovery,
        favourites: ctx.favourites,
        cfg: ctx.cfg,
      });
      const input = planInputFrom(ctx);
      return {
        summary: `Ran the swap engine for ${exercise.name}`,
        content: json({
          exercise: exercise.name,
          no_options_reason: result.empty ?? null,
          options: result.options.map((o) => ({
            match_pct: o.matchPct,
            explanation: o.diffText,
            items: o.items.map((item) => {
              const candidate = ctx.candidates.find((c) => c.exercise.id === item.exercise.id);
              const load = candidate
                ? planExercise(candidate, item.sets, 1, false, new Set(), input, ctx.history)
                    .weightKg
                : null;
              return {
                exercise: item.exercise.name,
                equipment: item.equipment?.name ?? null,
                sets: item.sets,
                load_kg: load,
              };
            }),
            rule_ids: [...new Set(o.rationale.map((r) => r.rule))],
          })),
        }),
      };
    }
    case "exclude_equipment_today": {
      const { equipment_ids } = chatToolInputs.exclude_equipment_today.parse(rawInput);
      // The engine validates: only equipment registered at this gym.
      const valid = equipment_ids.filter((id) => ctx.equipmentById.has(id));
      for (const id of valid) {
        if (ctx.tempExcludedEquipment.has(id)) continue;
        await repo("temp_exclusions", db).create({
          date: localDate(),
          equipment_id: id,
          exercise_id: null,
          body_region: null,
          reason: "free_text",
        });
      }
      const names = valid.map((id) => ctx.equipmentById.get(id)!.name);
      return {
        summary: names.length ? `Excluded for today: ${names.join(", ")}` : "Nothing excluded",
        content: json({
          excluded: names,
          ignored_unknown_ids: equipment_ids.length - valid.length,
        }),
      };
    }
  }
}
