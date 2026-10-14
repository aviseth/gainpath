import { describe, expect, it } from "vitest";
import {
  aggregateDaily,
  authUrl,
  GOOGLE_HEALTH_SCOPES,
  signState,
  verifyState,
} from "./google-health";

describe("google health", () => {
  it("signs state bound to the user and expiring", () => {
    const state = signState("user-1", "secret", 1000);
    expect(verifyState(state, "user-1", "secret", 2000)).toBe(true);
    expect(verifyState(state, "user-2", "secret", 2000)).toBe(false);
    expect(verifyState(state, "user-1", "other", 2000)).toBe(false);
    expect(verifyState(state, "user-1", "secret", 1000 + 11 * 60_000)).toBe(false);
    expect(verifyState(state.replace(/.$/, "x"), "user-1", "secret", 2000)).toBe(false);
  });

  it("requests offline access with read-only scopes", () => {
    const url = new URL(authUrl("cid", "https://app.example", "s"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_HEALTH_SCOPES.join(" "));
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/settings/google-health");
  });

  it("aggregates daily HRV, resting HR and sleep by wake-up date", () => {
    const d = (day: number) => ({ year: 2026, month: 10, day });
    const days = aggregateDaily(
      [
        {
          dailyHeartRateVariability: {
            date: d(13),
            averageHeartRateVariabilityMilliseconds: 48.26,
          },
        },
      ],
      [
        { dailyRestingHeartRate: { date: d(13), beatsPerMinute: "54" } },
        { dailyRestingHeartRate: { date: d(14), beatsPerMinute: "0" } },
      ],
      [
        {
          sleep: { interval: { civilEndTime: { date: d(13) } }, summary: { minutesAsleep: "420" } },
        },
        {
          sleep: { interval: { civilEndTime: { date: d(13) } }, summary: { minutesAsleep: "30" } },
        },
        { sleep: { interval: {}, summary: { minutesAsleep: "100" } } },
      ],
    );
    expect(days).toEqual([{ date: "2026-10-13", hrv_ms: 48.3, resting_hr: 54, sleep_hours: 7.5 }]);
  });
});
