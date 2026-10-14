"use client";

import { useState, type FormEvent } from "react";
import { Button, inputClass, Notice, Section } from "@/components/ui";
import { useSyncStatus } from "@/hooks/use-sync-status";
import {
  ACCESS_URL,
  INVITE_ONLY,
  sendMagicLink,
  signInWithGoogle,
  signOut,
  verifyEmailCode,
} from "@/lib/auth";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function AccountSection() {
  const status = useSyncStatus();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attempt(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  if (status.state === "disabled") {
    return (
      <Section title="Account">
        <Notice>
          Cloud sync isn&apos;t set up for this deployment, so your data stays on this device. Use
          Export below to keep a backup.
        </Notice>
      </Section>
    );
  }

  if (status.email) {
    return (
      <Section title="Account" description={`Signed in as ${status.email}`}>
        <Button disabled={busy} onClick={() => attempt(signOut)}>
          Sign out
        </Button>
        <p className="text-xs text-zinc-500">Signing out keeps your data on this device.</p>
        {error && <Notice tone="error">{error}</Notice>}
      </Section>
    );
  }

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    void attempt(async () => {
      await sendMagicLink(email.trim());
      setSentTo(email.trim());
    });
  };

  const onVerify = (e: FormEvent) => {
    e.preventDefault();
    if (sentTo) void attempt(() => verifyEmailCode(sentTo, code.trim()));
  };

  return (
    <Section
      title="Account"
      description={
        INVITE_ONLY
          ? "Accounts on this server are invite-only and include AI features. Everything else works without one."
          : "Sign in to back up and sync your training across devices. Everything works without an account too."
      }
    >
      {INVITE_ONLY && (
        <p className="text-sm text-zinc-400">
          {ACCESS_URL && (
            <>
              <a className="underline underline-offset-2" href={ACCESS_URL}>
                Get an account
              </a>
              , or{" "}
            </>
          )}
          <a className="underline underline-offset-2" href="https://github.com/aviseth/gainpath">
            {ACCESS_URL ? "host" : "Host"} your own copy for free
          </a>
          .
        </p>
      )}
      <Button variant="primary" disabled={busy} onClick={() => attempt(signInWithGoogle)}>
        Continue with Google
      </Button>
      {sentTo ? (
        <form onSubmit={onVerify} className="flex flex-col gap-3">
          <Notice tone="success">
            Check {sentTo}. Tap the link, or enter the 6-digit code from the email here (best if you
            installed the app to your home screen).
          </Notice>
          <input
            className={inputClass}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Sign-in code"
          />
          <Button type="submit" disabled={busy || code.trim().length < 6}>
            Verify code
          </Button>
          <button
            type="button"
            className="min-h-10 text-sm text-zinc-400"
            onClick={() => setSentTo(null)}
          >
            Use a different email
          </button>
        </form>
      ) : (
        <form onSubmit={onSend} className="flex flex-col gap-3">
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
            required
          />
          <Button type="submit" disabled={busy || !email.includes("@")}>
            Email me a sign-in link
          </Button>
        </form>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </Section>
  );
}
