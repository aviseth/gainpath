import { describe, expect, it } from "vitest";
import { freshDB } from "@/test/fixtures";
import { repo } from "./repo";
import { storeWearableDays, syncRange } from "./wearables";

describe("wearable storage", () => {
  it("upserts one row per date and source", async () => {
    const db = freshDB();
    const day = { date: "2026-10-13", hrv_ms: 50, resting_hr: 55, sleep_hours: 7 };
    expect(await storeWearableDays(db, "google_health", [day])).toBe(1);
    expect(await storeWearableDays(db, "google_health", [day])).toBe(0);
    expect(await storeWearableDays(db, "google_health", [{ ...day, hrv_ms: 52 }])).toBe(1);
    expect(await storeWearableDays(db, "ingest", [day])).toBe(1);
    const rows = await repo("wearable_daily", db).list();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.source === "google_health")!.hrv_ms).toBe(52);
  });

  it("covers the last N days through today", () => {
    const r = syncRange(3, new Date("2026-10-14T12:00:00").getTime());
    expect(r).toEqual({ from: "2026-10-12", to: "2026-10-15" });
  });
});
