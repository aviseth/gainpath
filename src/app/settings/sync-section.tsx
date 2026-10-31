"use client";

import { Button, Notice, Section } from "@/components/ui";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { formatRelative } from "@/lib/format";
import { syncManager } from "@/sync/manager";

export function SyncSection() {
  const status = useSyncStatus();
  const last = status.lastSyncedAt ? formatRelative(status.lastSyncedAt) : "never";
  const pending =
    status.pending === 0
      ? "No changes waiting."
      : `${status.pending} change${status.pending === 1 ? "" : "s"} waiting to upload.`;

  return (
    <div id="sync">
      <Section title="Sync" description={`Last synced: ${last}. ${pending}`}>
        {status.state === "error" && (
          <Notice tone="error">
            {`Sync failed: ${status.error}\nYour data is safe on this device. Gainpath will keep retrying.`}
          </Notice>
        )}
        {status.state === "offline" && (
          <Notice>
            You&apos;re offline. Changes are saved here and will upload when you reconnect.
          </Notice>
        )}
        {status.state === "conflict" && (
          <Notice tone="error">
            This device holds data from a different account, so sync is paused to keep that data out
            of {status.email ?? "this account"}. Export it below if you want to keep it, then reset
            this device to sync with this account.
          </Notice>
        )}
        {(status.state === "idle" || status.state === "error" || status.state === "offline") && (
          <Button onClick={() => syncManager.syncNow()}>Sync now</Button>
        )}
        {(status.state === "signed_out" || status.state === "disabled") && (
          <p className="text-sm text-on-surface-variant">Sign in to turn on cloud backup.</p>
        )}
      </Section>
    </div>
  );
}
