"use client";

import { useEffect } from "react";

/** Keep the screen on during a session (Screen Wake Lock API); silently no-ops where unsupported. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Denied (e.g. low battery); the session still works.
      }
    };
    // The lock is released when the page is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
