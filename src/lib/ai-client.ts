"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getProfile } from "@/data/actions";
import { resolveConfig } from "@/engine/config";
import { getSupabase } from "./supabase";

/**
 * Client side of the opt-in AI layer. AI is off until the user turns it on in
 * Settings, needs sign-in (the daily limit is enforced per account on the
 * server), and every call is an explicit user action.
 */

const OPT_IN_KEY = "gainpath.ai";

export interface AiStatus {
  /** Opted in on this device, configured on the server and signed in. */
  enabled: boolean;
  optedIn: boolean;
  reason?: "opted_out" | "not_configured" | "signed_out" | "offline";
  used: number;
  limit: number;
}

export class AiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---- opt-in flag (per device) -------------------------------------------------

export function isAiOptedIn(): boolean {
  try {
    return localStorage.getItem(OPT_IN_KEY) === "on";
  } catch {
    return false;
  }
}

export function setAiOptIn(on: boolean): void {
  try {
    if (on) localStorage.setItem(OPT_IN_KEY, "on");
    else localStorage.removeItem(OPT_IN_KEY);
  } catch {
    // Private mode: the flag just won't persist.
  }
  void refreshAiStatus();
}

// ---- status store -------------------------------------------------------------

let status: AiStatus | undefined;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit(next: AiStatus) {
  status = next;
  for (const l of listeners) l();
}

async function accessToken(): Promise<string | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

async function userLimit(): Promise<number> {
  const profile = await getProfile();
  return resolveConfig(profile?.config_overrides).aiDailyLimit;
}

export function refreshAiStatus(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const optedIn = isAiOptedIn();
    const off = (reason: AiStatus["reason"]): AiStatus => ({
      enabled: false,
      optedIn,
      reason,
      used: 0,
      limit: 0,
    });
    if (!optedIn) return emit(off("opted_out"));
    const token = await accessToken();
    if (!token) return emit(off(getSupabase() ? "signed_out" : "not_configured"));
    try {
      const response = await fetch(`/api/ai/status?limit=${await userLimit()}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = (await response.json()) as {
        enabled?: boolean;
        reason?: AiStatus["reason"];
        used?: number;
        limit?: number;
      };
      emit({
        enabled: !!json.enabled,
        optedIn,
        reason: json.enabled ? undefined : (json.reason ?? "not_configured"),
        used: json.used ?? 0,
        limit: json.limit ?? 0,
      });
    } catch {
      emit(off("offline"));
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** undefined while loading. */
export function useAiStatus(): AiStatus | undefined {
  const value = useSyncExternalStore(
    subscribe,
    () => status,
    () => undefined,
  );
  useEffect(() => {
    if (status === undefined) void refreshAiStatus();
  }, []);
  return value;
}

// ---- calls ----------------------------------------------------------------------

/** Calls an AI route. Throws AiError with a user-facing message on failure. */
export async function callAi<T>(endpoint: string, body: object): Promise<T> {
  if (!isAiOptedIn()) throw new AiError("opted_out", "Turn on AI in Settings first.");
  const token = await accessToken();
  if (!token) throw new AiError("signed_out", "Sign in to use AI features.");
  let response: Response;
  try {
    response = await fetch(`/api/ai/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, limit: await userLimit() }),
    });
  } catch {
    throw new AiError("offline", "You're offline. AI needs a connection.");
  }
  const json = (await response.json().catch(() => null)) as
    | { ok: true; result: T; used: number; limit: number }
    | { ok: false; code: string; message: string }
    | null;
  if (!json) throw new AiError("internal", "The AI service returned an unexpected response.");
  if (!json.ok) {
    if (json.code === "limit") void refreshAiStatus();
    throw new AiError(json.code, json.message);
  }
  if (status) emit({ ...status, used: json.used, limit: json.limit });
  return json.result;
}

/** Like callAi, but returns null on any failure (for optional fallbacks). */
export async function askAi<T>(endpoint: string, body: object): Promise<T | null> {
  try {
    return await callAi<T>(endpoint, body);
  } catch {
    return null;
  }
}
