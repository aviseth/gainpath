import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { e1rmSeries, mondayOf, weeklyVolume } from "./progress";
import { buildCatalog } from "@/seed/catalog";
import type { SetLog } from "./types";

const catalog = buildCatalog([]);
const press = [...catalog.values()].find(
  (e) => e.pattern === "horizontal_push" && e.kind === "compound",
)!;
const DAY = 24 * 3600_000;
const now = new Date("2026-10-14T18:00:00").getTime(); // a Wednesday

function set(over: Partial<SetLog>): SetLog {
  return {
    id: Math.random().toString(36),
    user_id: "local",
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    session_id: "s1",
    exercise_id: press.id,
    equipment_id: "machine-a",
    ts: now,
    weight_kg: 60,
    reps: 8,
    rpe: 8,
    is_warmup: false,
    is_amrap: false,
    approximate: false,
    predicted_rir: null,
    ...over,
  } as SetLog;
}

describe("progress", () => {
  it("keeps e1RM separate per exercise and machine", () => {
    const series = e1rmSeries(
      [
        set({ ts: now - 7 * DAY, session_id: "a" }),
        set({ ts: now, session_id: "b", weight_kg: 65 }),
        set({ ts: now, session_id: "c", equipment_id: "machine-b", weight_kg: 40 }),
        set({
          ts: now,
          session_id: "c",
          equipment_id: "machine-b",
          is_warmup: true,
          weight_kg: 100,
        }),
      ],
      0,
      DEFAULT_CONFIG,
    );
    expect(series).toHaveLength(2);
    const a = series.find((s) => s.equipmentId === "machine-a")!;
    expect(a.points).toHaveLength(2);
    expect(a.change).toBeGreaterThan(0);
    expect(series.find((s) => s.equipmentId === "machine-b")!.latest).toBeLessThan(a.latest);
  });

  it("counts fractional weekly volume per muscle in calendar weeks", () => {
    const weeks = weeklyVolume(
      [
        set({ ts: now }),
        set({ ts: now }),
        set({ ts: now - 7 * DAY, session_id: "old" }),
        set({ ts: now, is_warmup: true }),
      ],
      catalog,
      now,
      4,
    );
    expect(weeks).toHaveLength(4);
    expect(weeks[3].weekStart).toBe(mondayOf(now));
    expect(weeks[3].total).toBe(2);
    expect(weeks[3].perMuscle.chest).toBe(2 * (press.vector.chest ?? 0));
    expect(weeks[2].total).toBe(1);
    expect(weeks[0].total).toBe(0);
  });

  it("counts training days, not session ids, so one day counts once (PHIL-1)", () => {
    const weeks = weeklyVolume(
      [
        set({ ts: now - DAY, session_id: "a" }),
        set({ ts: now - DAY + 3600_000, session_id: "b" }),
        set({ ts: now - 2 * DAY, session_id: null }),
      ],
      catalog,
      now,
      1,
    );
    expect(weeks[0].sessions).toBe(2);
  });
});
