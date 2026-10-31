"use client";

import Link from "next/link";
import { useSyncStatus } from "@/hooks/use-sync-status";
import type { SyncState } from "@/sync/manager";

const labels: Record<SyncState, { text: string; dot: string }> = {
  disabled: { text: "Local only", dot: "bg-outline" },
  signed_out: { text: "Not signed in", dot: "bg-outline" },
  idle: { text: "Synced", dot: "bg-primary" },
  syncing: { text: "Syncing…", dot: "bg-primary animate-pulse" },
  offline: { text: "Offline", dot: "bg-tertiary" },
  error: { text: "Sync error", dot: "bg-error" },
  conflict: { text: "Sync paused", dot: "bg-error" },
};

/**
 * Small tonal header chip; tapping it opens Settings → Sync. The pending count
 * only shows when there's somewhere to sync to.
 */
export function SyncIndicator() {
  const status = useSyncStatus();
  const { text, dot } = labels[status.state];
  const pending =
    status.pending > 0 && status.state !== "syncing" && status.state !== "disabled"
      ? ` · ${status.pending} pending`
      : "";
  return (
    <Link
      href="/settings#sync"
      className="group flex min-h-10 items-center"
      aria-label={`Sync status: ${text}${pending}`}
      data-testid="sync-indicator"
    >
      <span className="flex h-7 items-center gap-1.5 rounded-chip bg-surface-container-high px-2.5 text-[11px] font-medium text-on-surface-variant group-hover:bg-surface-container-highest">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        {text}
        {pending}
      </span>
    </Link>
  );
}
