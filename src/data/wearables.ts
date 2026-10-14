import { localDate } from "./actions";
import type { LiftwiseDB } from "./db";
import { repo } from "./repo";

export interface WearableDay {
  date: string;
  hrv_ms: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
}

/** Upserts one wearable_daily row per (date, source); unchanged days are left alone. */
export async function storeWearableDays(
  db: LiftwiseDB,
  source: "google_health" | "ingest",
  days: readonly WearableDay[],
): Promise<number> {
  const table = repo("wearable_daily", db);
  let changed = 0;
  for (const day of days) {
    const existing = (await db.wearable_daily.where("date").equals(day.date).toArray()).find(
      (w) => w.source === source && w.deleted_at === null,
    );
    const fields = { hrv_ms: day.hrv_ms, resting_hr: day.resting_hr, sleep_hours: day.sleep_hours };
    if (!existing) {
      await table.create({ date: day.date, source, ...fields });
      changed++;
    } else if (
      existing.hrv_ms !== fields.hrv_ms ||
      existing.resting_hr !== fields.resting_hr ||
      existing.sleep_hours !== fields.sleep_hours
    ) {
      await table.update(existing.id, fields);
      changed++;
    }
  }
  return changed;
}

/** [from, to) covering the last `days` local dates, including today. */
export function syncRange(days: number, now = Date.now()): { from: string; to: string } {
  const DAY = 24 * 3600_000;
  return { from: localDate(now - (days - 1) * DAY), to: localDate(now + DAY) };
}
