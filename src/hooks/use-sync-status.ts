"use client";

import { useSyncExternalStore } from "react";
import { syncManager, type SyncStatus } from "@/sync/manager";

const serverSnapshot: SyncStatus = {
  state: "disabled",
  email: null,
  lastSyncedAt: null,
  pending: 0,
  error: null,
};

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(syncManager.subscribe, syncManager.getSnapshot, () => serverSnapshot);
}
