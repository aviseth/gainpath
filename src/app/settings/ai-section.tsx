"use client";

import { Section, Notice } from "@/components/ui";
import { setAiOptIn, useAiStatus } from "@/lib/ai-client";

const REASONS: Record<string, string> = {
  signed_out: "Sign in to use AI. The daily limit is kept per account.",
  not_configured: "AI isn't configured on this deployment (no API key).",
  not_included: "Your plan doesn't include AI. Everything else works the same.",
  offline: "Can't reach the server right now.",
};

export function AiSection() {
  const status = useAiStatus();
  const optedIn = status?.optedIn ?? false;

  return (
    <Section
      title="AI assist"
      description="Off by default. Training works fully without it. When on, AI is only used when you tap “Ask AI”, or when the app can't match a free-text constraint itself."
    >
      <label className="flex min-h-12 items-center justify-between gap-3 text-sm">
        <span className="font-medium">Use AI on this device</span>
        <input
          type="checkbox"
          className="h-6 w-6 accent-primary"
          checked={optedIn}
          onChange={(e) => setAiOptIn(e.target.checked)}
        />
      </label>
      {optedIn && status?.enabled && (
        <p className="text-sm text-on-surface" data-testid="ai-used">
          AI used today: <span className="font-semibold tabular-nums">{status.used}</span> /{" "}
          {status.limit}
        </p>
      )}
      {optedIn && status && !status.enabled && status.reason && REASONS[status.reason] && (
        <Notice>{REASONS[status.reason]}</Notice>
      )}
    </Section>
  );
}
