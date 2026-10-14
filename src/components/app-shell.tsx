"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { getDB } from "@/data/db";
import { applyGymManifests } from "@/data/manifest";
import { GYM_MANIFESTS } from "@/seed/gyms";
import { maybeAutoSyncGoogleHealth } from "@/lib/google-health-client";
import { isSupabaseConfigured } from "@/lib/supabase";
import { syncManager } from "@/sync/manager";
import { BottomNav } from "./bottom-nav";
import { SyncIndicator } from "./sync-indicator";

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => syncManager.start(), []);
  useEffect(() => {
    // Daily wearable pull (feature-flagged on the server); needs an account.
    if (isSupabaseConfigured()) void maybeAutoSyncGoogleHealth();
  }, []);
  useEffect(() => {
    // Committed gym manifests (equipment identified from the owner's photos).
    applyGymManifests(getDB(), GYM_MANIFESTS).catch((e) => console.error("gym manifest", e));
  }, []);

  return (
    <>
      <header className="sticky top-0 z-10 border-b-2 border-zinc-100 bg-zinc-950 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-2">
          <span className="font-display text-xl font-bold uppercase tracking-wide">Gainpath</span>
          <SyncIndicator />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28">{children}</main>
      <Suspense>
        <BottomNav />
      </Suspense>
    </>
  );
}
