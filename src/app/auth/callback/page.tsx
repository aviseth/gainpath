"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Notice } from "@/components/ui";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

const TIMEOUT_MESSAGE =
  "Sign-in didn't complete. If you opened the link in a different browser or app, request a new one, or enter the 6-digit code instead.";

// The query string is browser-only; read it as an external store so the static
// prerender (empty string) and the client render stay consistent.
const subscribeNoop = () => () => {};
const useSearch = () =>
  useSyncExternalStore(
    subscribeNoop,
    () => window.location.search,
    () => "",
  );

/**
 * OAuth / magic-link landing page. The Supabase client exchanges the `code`
 * in the URL automatically (PKCE, detectSessionInUrl); we just wait for the
 * session and go to Settings.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const search = useSearch();
  const [timedOut, setTimedOut] = useState(false);

  const params = new URLSearchParams(search);
  const urlError = params.get("error_description") ?? params.get("error");
  const error =
    urlError ??
    (!isSupabaseConfigured() ? "Cloud sync isn't configured for this deployment." : null) ??
    (timedOut ? TIMEOUT_MESSAGE : null);

  useEffect(() => {
    const client = getSupabase();
    if (!client || urlError) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/settings");
    });
    const timeout = setTimeout(() => setTimedOut(true), 15_000);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, urlError]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Signing in…</h1>
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Link href="/settings" className="text-lime-400">
            Back to settings
          </Link>
        </>
      ) : (
        <p className="text-zinc-400">One moment.</p>
      )}
    </div>
  );
}
