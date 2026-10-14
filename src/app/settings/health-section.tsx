"use client";

import { useEffect, useState } from "react";
import { Button, Notice, Section } from "@/components/ui";
import {
  connectGoogleHealth,
  disconnectGoogleHealth,
  googleHealthStatus,
  syncGoogleHealth,
  type GoogleHealthStatus,
} from "@/lib/google-health-client";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Readiness sources. The daily check-in always works; Google Health adds
 * HRV, resting HR and sleep (READY-2) when the deployment enables it.
 */
export function HealthSection() {
  const [status, setStatus] = useState<GoogleHealthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    void googleHealthStatus().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<string | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage(text);
      setStatus(await googleHealthStatus());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Health data"
      description="The daily check-in is always the main input. Wearable data only nudges readiness (READY-2)."
    >
      {status?.available ? (
        status.signedOut ? (
          <Notice>Sign in to connect Google Health.</Notice>
        ) : status.connected ? (
          <>
            <p className="text-sm text-zinc-300">
              Google Health connected
              {status.lastSyncAt
                ? ` · last sync ${new Date(status.lastSyncAt).toLocaleString()}`
                : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={busy}
                onClick={() => void run(async () => `Updated ${await syncGoogleHealth()} day(s).`)}
              >
                Sync now
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void run(() => disconnectGoogleHealth())}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <Button disabled={busy} onClick={() => void run(() => connectGoogleHealth())}>
            Connect Google Health (Fitbit / Pixel Watch)
          </Button>
        )
      ) : (
        <p className="text-sm text-zinc-500">
          Google Health isn&apos;t enabled on this deployment.
        </p>
      )}
      <p className="text-xs text-zinc-500">
        Samsung Health has no web API. A companion app could send data to this app; see the docs.
      </p>
      {message && <Notice>{message}</Notice>}
    </Section>
  );
}
