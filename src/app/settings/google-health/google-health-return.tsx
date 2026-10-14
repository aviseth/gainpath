"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/ui";
import { completeGoogleHealth } from "@/lib/google-health-client";

/** OAuth redirect target: finishes connecting Google Health, then links back. */
export function GoogleHealthReturn() {
  const [state, setState] = useState<{ done: boolean; message: string }>({
    done: false,
    message: "Connecting…",
  });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthState = params.get("state");
    // Drop the code from the address bar and history.
    window.history.replaceState(null, "", window.location.pathname);
    const finish = (message: string) => setState({ done: true, message });
    if (params.get("error") || !code || !oauthState) {
      finish("Google Health wasn't connected.");
      return;
    }
    completeGoogleHealth(code, oauthState)
      .then(() =>
        finish("Google Health connected. Recent sleep, HRV and resting heart rate were imported."),
      )
      .catch((e: unknown) =>
        finish(e instanceof Error ? e.message : "Couldn't connect Google Health."),
      );
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Google Health</h1>
      <Notice>{state.message}</Notice>
      {state.done && (
        <Link href="/settings" className="text-lime-400 underline">
          Back to Settings
        </Link>
      )}
    </div>
  );
}
