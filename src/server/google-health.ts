import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Google Health API (successor to the Fitbit Web API). Verified against the
 * v4 discovery document (https://health.googleapis.com/$discovery/rest?version=v4)
 * on 2026-10-14:
 *   GET https://health.googleapis.com/v4/users/me/dataTypes/{dataType}/dataPoints
 *   dataTypes: daily-heart-rate-variability, daily-resting-heart-rate, sleep
 *   filters:   daily_heart_rate_variability.date, daily_resting_heart_rate.date,
 *              sleep.interval.civil_end_time (all >= / <, ANDed)
 * The scopes are Restricted; run the OAuth client in "testing" mode with your
 * own account as a test user (docs/google-health.md).
 */

export const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
] as const;

const API = "https://health.googleapis.com/v4/users/me/dataTypes";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_TTL_MS = 10 * 60_000;

export function googleHealthConfig() {
  const enabled = process.env.GOOGLE_HEALTH_ENABLED === "1";
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  if (!enabled || !clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export const redirectUri = (origin: string) => `${origin}/settings/google-health`;

// ---- OAuth state: binds the consent round trip to the signed-in user --------

export function signState(userId: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, n: randomBytes(9).toString("base64url"), e: now + STATE_TTL_MS }),
  ).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyState(
  state: string,
  userId: string,
  secret: string,
  now = Date.now(),
): boolean {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      u: string;
      e: number;
    };
    return u === userId && now < e;
  } catch {
    return false;
  }
}

export function authUrl(clientId: string, origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_HEALTH_SCOPES.join(" "),
    access_type: "offline",
    // Always return a refresh token, even on re-connect.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
  };
  if (!response.ok || !json.access_token)
    throw new Error(`token request failed: ${json.error ?? response.status}`);
  return json;
}

export function exchangeCode(
  cfg: { clientId: string; clientSecret: string },
  code: string,
  origin: string,
) {
  return tokenRequest({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });
}

export function refreshAccessToken(
  cfg: { clientId: string; clientSecret: string },
  refreshToken: string,
) {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

// ---- data --------------------------------------------------------------------

interface GDate {
  year: number;
  month: number;
  day: number;
}
export interface GDataPoint {
  dailyHeartRateVariability?: { date?: GDate; averageHeartRateVariabilityMilliseconds?: number };
  dailyRestingHeartRate?: { date?: GDate; beatsPerMinute?: string | number };
  sleep?: {
    interval?: { civilEndTime?: { date?: GDate } };
    summary?: { minutesAsleep?: string | number };
  };
}

export async function listDataPoints(
  accessToken: string,
  dataType: string,
  filter: string,
): Promise<GDataPoint[]> {
  const out: GDataPoint[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ filter, pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${API}/${dataType}/dataPoints?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Google Health ${dataType}: ${response.status}`);
    const json = (await response.json()) as { dataPoints?: GDataPoint[]; nextPageToken?: string };
    out.push(...(json.dataPoints ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

const iso = (d: GDate | undefined) =>
  d?.year && d.month && d.day
    ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
    : null;

export interface WearableDay {
  date: string;
  hrv_ms: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
}

/** Folds the three data types into one row per local date. Sleep counts toward the date you woke up. */
export function aggregateDaily(
  hrv: GDataPoint[],
  rhr: GDataPoint[],
  sleep: GDataPoint[],
): WearableDay[] {
  const days = new Map<string, WearableDay>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) days.set(date, (d = { date, hrv_ms: null, resting_hr: null, sleep_hours: null }));
    return d;
  };
  for (const p of hrv) {
    const date = iso(p.dailyHeartRateVariability?.date);
    const v = Number(p.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds);
    if (date && v > 0) day(date).hrv_ms = Math.round(v * 10) / 10;
  }
  for (const p of rhr) {
    const date = iso(p.dailyRestingHeartRate?.date);
    const v = Number(p.dailyRestingHeartRate?.beatsPerMinute);
    if (date && v > 0) day(date).resting_hr = v;
  }
  for (const p of sleep) {
    const date = iso(p.sleep?.interval?.civilEndTime?.date);
    const minutes = Number(p.sleep?.summary?.minutesAsleep);
    if (!date || !(minutes > 0)) continue;
    const d = day(date);
    d.sleep_hours = Math.min(24, Math.round(((d.sleep_hours ?? 0) + minutes / 60) * 100) / 100);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchDaily(
  accessToken: string,
  from: string,
  to: string,
): Promise<WearableDay[]> {
  const range = (field: string) => `${field} >= "${from}" AND ${field} < "${to}"`;
  const [hrv, rhr, sleep] = await Promise.all([
    listDataPoints(
      accessToken,
      "daily-heart-rate-variability",
      range("daily_heart_rate_variability.date"),
    ),
    listDataPoints(accessToken, "daily-resting-heart-rate", range("daily_resting_heart_rate.date")),
    listDataPoints(accessToken, "sleep", range("sleep.interval.civil_end_time")),
  ]);
  return aggregateDaily(hrv, rhr, sleep);
}
