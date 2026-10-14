"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { syncManager } from "@/sync/manager";
import { BottomNav } from "./bottom-nav";
import { SyncIndicator } from "./sync-indicator";

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => syncManager.start(), []);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-2">
          <span className="text-lg font-bold tracking-tight">Liftwise</span>
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
