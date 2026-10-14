import type { SupabaseClient } from "@supabase/supabase-js";
import { getDB } from "@/data/db";
import { onLocalWrite } from "@/data/repo";
import { getSupabase } from "@/lib/supabase";
import { countPending, LAST_SYNCED_KEY, OwnershipConflictError, syncOnce } from "./engine";
import { supabaseRemote } from "./supabase-remote";

/**
 * Background sync for the browser (PLAN.md §2.4). Runs on startup, when the
 * network returns, when the app becomes visible, every 30 s while visible and
 * 2 s after a local edit. Failures back off exponentially (2 s → 5 min) and
 * never block the app, which keeps working on IndexedDB alone.
 */

export type SyncState =
  | "disabled" // Supabase not configured: local-only
  | "signed_out"
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  | "conflict"; // device holds another account's data

export interface SyncStatus {
  state: SyncState;
  email: string | null;
  lastSyncedAt: number | null;
  pending: number;
  error: string | null;
}

export const INTERVAL_MS = 30_000;
export const DEBOUNCE_MS = 2_000;
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

export function backoffDelay(failures: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1), BACKOFF_MAX_MS);
}

class SyncManager {
  private status: SyncStatus = {
    state: "disabled",
    email: null,
    lastSyncedAt: null,
    pending: 0,
    error: null,
  };
  private listeners = new Set<() => void>();
  private client: SupabaseClient | null = null;
  private userId: string | null = null;
  private running = false;
  private rerun = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cleanup: Array<() => void> = [];

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.status;

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Idempotent; returns a stop function (safe under React Strict Mode double effects). */
  start(): () => void {
    if (this.cleanup.length > 0) return () => this.stop();
    void this.refreshLocalStatus();
    this.cleanup.push(
      onLocalWrite(() => {
        void this.refreshLocalStatus();
        this.schedule(DEBOUNCE_MS);
      }),
    );

    this.client = getSupabase();
    if (!this.client) {
      this.set({ state: "disabled" });
      return () => this.stop();
    }

    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null;
      const changed = userId !== this.userId;
      this.userId = userId;
      this.set({ email: session?.user.email ?? null });
      if (!userId) {
        this.clearTimer();
        this.set({ state: "signed_out", error: null });
      } else if (changed) {
        this.failures = 0;
        this.schedule(0);
      }
    });
    this.cleanup.push(() => data.subscription.unsubscribe());

    const onOnline = () => this.schedule(0);
    const onOffline = () => this.userId && this.set({ state: "offline" });
    const onVisible = () => document.visibilityState === "visible" && this.schedule(0);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && this.failures === 0) this.schedule(0);
    }, INTERVAL_MS);
    this.cleanup.push(() => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    });
    return () => this.stop();
  }

  stop() {
    this.clearTimer();
    for (const fn of this.cleanup.splice(0)) fn();
  }

  /** Sync now (e.g. the "Sync now" button), resetting any backoff. */
  syncNow() {
    this.failures = 0;
    this.schedule(0);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number) {
    if (!this.client || !this.userId || this.status.state === "conflict") return;
    this.clearTimer();
    this.timer = setTimeout(() => void this.run(), delayMs);
  }

  private async refreshLocalStatus() {
    const db = getDB();
    const [pending, last] = await Promise.all([countPending(db), db.meta.get(LAST_SYNCED_KEY)]);
    this.set({ pending, lastSyncedAt: typeof last?.value === "number" ? last.value : null });
  }

  private async run() {
    if (!this.client || !this.userId) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.set({ state: "offline" });
      return;
    }
    this.running = true;
    this.set({ state: "syncing" });
    try {
      await syncOnce(getDB(), supabaseRemote(this.client), this.userId);
      this.failures = 0;
      this.set({ state: "idle", error: null });
    } catch (error) {
      if (error instanceof OwnershipConflictError) {
        this.set({ state: "conflict", error: error.message });
      } else {
        this.failures++;
        this.set({ state: "error", error: error instanceof Error ? error.message : String(error) });
        this.schedule(backoffDelay(this.failures));
      }
    } finally {
      this.running = false;
      await this.refreshLocalStatus();
      if (this.rerun) {
        this.rerun = false;
        this.schedule(0);
      }
    }
  }
}

export const syncManager = new SyncManager();
