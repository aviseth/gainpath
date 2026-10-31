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
      <header className="bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 pt-2">
          <span className="text-sm font-semibold tracking-wide text-primary">Gainpath</span>
          <SyncIndicator />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-2 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <Suspense>
        <BottomNav />
      </Suspense>
    </>
  );
}
