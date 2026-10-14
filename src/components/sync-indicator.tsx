"use client";

import Link from "next/link";
import { useSyncStatus } from "@/hooks/use-sync-status";
import type { SyncState } from "@/sync/manager";

const labels: Record<SyncState, { text: string; dot: string }> = {
  disabled: { text: "Local only", dot: "bg-zinc-500" },
  signed_out: { text: "Not signed in", dot: "bg-zinc-500" },
  idle: { text: "Synced", dot: "bg-lime-400" },
  syncing: { text: "Syncing…", dot: "bg-sky-400 animate-pulse" },
  offline: { text: "Offline", dot: "bg-amber-400" },
  error: { text: "Sync error", dot: "bg-red-400" },
  conflict: { text: "Sync paused", dot: "bg-red-400" },
};

/** Small header badge; tapping it opens Settings → Sync. */
export function SyncIndicator() {
  const status = useSyncStatus();
  const { text, dot } = labels[status.state];
  const pending =
    status.pending > 0 && status.state !== "syncing" ? ` · ${status.pending} pending` : "";
  return (
    <Link
      href="/settings#sync"
      className="flex min-h-10 items-center gap-2 rounded-full border border-zinc-800 px-3 text-xs text-zinc-300"
      aria-label={`Sync status: ${text}${pending}`}
      data-testid="sync-indicator"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {text}
      {pending}
    </Link>
  );
}
