import type { GainpathDB } from "@/data/db";
import type { Muscle } from "@/data/schema";
import type { ReadinessInput } from "@/engine/readiness";

/**
 * Readiness sources (PROMPT.md "Health data integrations"). The manual
 * check-in is the default and works alone; wearable data (Google Health, or a
 * future Health Connect companion posting to /api/ingest/readiness) lands in
 * the wearable_daily table and only softly modifies readiness (READY-2).
 */

export interface DailyReadiness {
  sleepQuality?: number;
  energy?: number;
  sleepHours?: number;
  hrv?: number;
  restingHr?: number;
  soreness?: Partial<Record<Muscle, number>>;
}

export interface ReadinessProvider {
  id: "manual" | "google_health" | "samsung_health";
  label: string;
  /** Data for one local date (YYYY-MM-DD); missing fields are simply absent. */
  getDaily(db: GainpathDB, date: string): Promise<DailyReadiness>;
}

export const manualCheckinProvider: ReadinessProvider = {
  id: "manual",
  label: "Daily check-in",
  async getDaily(db, date) {
    const rows = (await db.checkins.where("date").equals(date).toArray()).filter(
      (c) => c.deleted_at === null,
    );
    const latest = rows.sort((a, b) => b.updated_at - a.updated_at)[0];
    if (!latest) return {};
    return {
      sleepQuality: latest.sleep_quality,
      energy: latest.energy,
      sleepHours: latest.sleep_hours ?? undefined,
      soreness: latest.soreness,
    };
  },
};

/** Reads wearable_daily rows, whichever service wrote them. */
export const wearableProvider: ReadinessProvider = {
  id: "google_health",
  label: "Google Health",
  async getDaily(db, date) {
    const rows = (await db.wearable_daily.where("date").equals(date).toArray()).filter(
      (w) => w.deleted_at === null,
    );
    const latest = rows.sort((a, b) => b.updated_at - a.updated_at)[0];
    if (!latest) return {};
    return {
      sleepHours: latest.sleep_hours ?? undefined,
      hrv: latest.hrv_ms ?? undefined,
      restingHr: latest.resting_hr ?? undefined,
    };
  },
};

/**
 * Samsung Health has no web API (PROMPT.md). This stub exists so a future
 * Android companion reading Health Connect can post to /api/ingest/readiness;
 * that data then arrives through wearable_daily. See docs/samsung-health.md.
 */
export const samsungHealthStub: ReadinessProvider = {
  id: "samsung_health",
  label: "Samsung Health (not available on the web)",
  async getDaily() {
    return {};
  },
};

export const PROVIDERS: readonly ReadinessProvider[] = [
  manualCheckinProvider,
  wearableProvider,
  samsungHealthStub,
];

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Today's engine input: check-in fields first, wearable sleep hours as a
 * fallback, and HRV / resting HR against the previous 14 days (READY-2).
 */
export async function gatherReadiness(
  db: GainpathDB,
  date: string,
  baselineDays = 14,
): Promise<{
  input: ReadinessInput;
  soreness: Partial<Record<Muscle, number>>;
  hasCheckin: boolean;
}> {
  const manual = await manualCheckinProvider.getDaily(db, date);
  const wearable = await wearableProvider.getDaily(db, date);
  const history: DailyReadiness[] = [];
  for (let i = 1; i <= baselineDays; i++)
    history.push(await wearableProvider.getDaily(db, shiftDate(date, -i)));
  const values = (key: "hrv" | "restingHr") =>
    history.map((h) => h[key]).filter((v): v is number => typeof v === "number");

  return {
    input: {
      sleepQuality: manual.sleepQuality ?? null,
      energy: manual.energy ?? null,
      sleepHours: manual.sleepHours ?? wearable.sleepHours ?? null,
      hrv: { today: wearable.hrv ?? null, baseline: values("hrv") },
      restingHr: { today: wearable.restingHr ?? null, baseline: values("restingHr") },
    },
    soreness: manual.soreness ?? {},
    hasCheckin: manual.sleepQuality !== undefined,
  };
}
