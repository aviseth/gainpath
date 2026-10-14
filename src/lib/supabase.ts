import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client, or null when Supabase isn't configured. The app is
 * local-first, so everything except sign-in and sync works without it.
 *
 * The session is kept in localStorage and refreshed automatically, so the
 * phone stays signed in. Server routes authenticate with the access token as
 * a bearer header instead of cookies.
 */

// Referenced literally so Next.js can inline them into the client bundle.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key);
}

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (typeof window === "undefined" || !url || !key) return null;
  client = createClient(url, key, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
