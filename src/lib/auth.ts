import { getSupabase } from "./supabase";

/** Sign-in helpers (Supabase Auth: Google OAuth + email magic link / one-time code). */

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error("Cloud sync isn't configured for this deployment.");
  return client;
}

const callbackUrl = () => `${window.location.origin}/auth/callback`;

export async function signInWithGoogle(): Promise<void> {
  const { error } = await requireClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl() },
  });
  if (error) throw error;
}

/**
 * Emails a magic link (and a 6-digit code if the email template includes
 * {{ .Token }}). The code matters for an installed PWA: the link may open in
 * the system browser instead of the app, where the sign-in can't complete.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl() },
  });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const { error } = await requireClient().auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}
