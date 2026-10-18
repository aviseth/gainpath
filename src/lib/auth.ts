import { getSupabase } from "./supabase";

/**
 * Sign-in helpers (Supabase Auth: Google OAuth, email magic link / one-time code,
 * and on invite-only deployments a password the admin sets with `pnpm users`).
 */

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error("Cloud sync isn't configured for this deployment.");
  return client;
}

/**
 * Invite-only deployments (a hosted instance someone pays for) turn off
 * "Allow new users to sign up" in Supabase, which is what actually blocks new
 * accounts; this flag only changes the copy and stops the email form from
 * asking Supabase to create one. Accounts are added with `pnpm users add`.
 */
export const INVITE_ONLY = process.env.NEXT_PUBLIC_INVITE_ONLY === "true";
export const ACCESS_URL = process.env.NEXT_PUBLIC_ACCESS_URL || null;

/** Supabase's sign-in errors, reworded for someone without an account or a password. */
export function friendlyAuthError(message: string): string {
  if (/signups? not allowed|user not found/i.test(message))
    return "There's no account for that email on this server. Accounts here are invite-only.";
  if (/invalid login credentials/i.test(message))
    return "That email and password don't match. Ask whoever runs this server for a new password.";
  return message;
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
    options: { emailRedirectTo: callbackUrl(), shouldCreateUser: !INVITE_ONLY },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const { error } = await requireClient().auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

/** Password sign-in; passwords exist only for accounts given one with `pnpm users`. */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function signOut(): Promise<void> {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}
