"use client";

import { getDB, type LiftwiseDB } from "@/data/db";
import { storeWearableDays, syncRange, type WearableDay } from "@/data/wearables";
import { getSupabase } from "./supabase";

/**
 * Client side of the Google Health integration (feature-flagged on the
 * server with GOOGLE_HEALTH_ENABLED). The server keeps the refresh token;
 * the device stores the daily values in wearable_daily.
 */

const LAST_SYNC_KEY = "google_health_last_sync";
const AUTO_SYNC_EVERY_MS = 12 * 3600_000;
const SYNC_DAYS = 14;

export interface GoogleHealthStatus {
  available: boolean;
  connected: boolean;
  signedOut?: boolean;
  lastSyncAt?: string | null;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const client = getSupabase();
  const token = client ? (await client.auth.getSession()).data.session?.access_token : null;
  const response = await fetch(`/api/google-health/${path}`, {
    method: init?.method ?? "GET",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json().catch(() => null)) as
    (T & { ok: boolean; message?: string }) | null;
  if (!json?.ok) throw new Error(json?.message ?? "Google Health request failed.");
  return json;
}

export function googleHealthStatus(): Promise<GoogleHealthStatus> {
  return call<GoogleHealthStatus>("status").catch(() => ({ available: false, connected: false }));
}

export async function connectGoogleHealth(): Promise<void> {
  const { url } = await call<{ url: string }>("connect", { method: "POST" });
  window.location.assign(url);
}

export async function completeGoogleHealth(code: string, state: string): Promise<void> {
  await call("exchange", { method: "POST", body: { code, state } });
  await syncGoogleHealth();
}

export async function syncGoogleHealth(db: LiftwiseDB = getDB()): Promise<number> {
  const { days } = await call<{ days: WearableDay[] }>("sync", {
    method: "POST",
    body: syncRange(SYNC_DAYS),
  });
  const changed = await storeWearableDays(db, "google_health", days);
  await db.meta.put({ key: LAST_SYNC_KEY, value: Date.now() });
  return changed;
}

export async function disconnectGoogleHealth(db: LiftwiseDB = getDB()): Promise<void> {
  await call("disconnect", { method: "POST" });
  await db.meta.delete(LAST_SYNC_KEY);
}

/** Daily background sync on app start, when connected. Never throws. */
export async function maybeAutoSyncGoogleHealth(db: LiftwiseDB = getDB()): Promise<void> {
  try {
    const last = (await db.meta.get(LAST_SYNC_KEY))?.value as number | undefined;
    if (last && Date.now() - last < AUTO_SYNC_EVERY_MS) return;
    const status = await googleHealthStatus();
    if (status.connected) await syncGoogleHealth(db);
  } catch (e) {
    console.warn("google health sync", e);
  }
}
