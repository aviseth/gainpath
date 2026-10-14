"use client";

import { useState } from "react";
import { Button, Notice, Section } from "@/components/ui";
import { getDB } from "@/data/db";

export function DeviceSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onReset() {
    const ok = window.confirm(
      "Delete all Liftwise data on this device? Anything not synced or exported will be lost.",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await getDB().delete();
      window.location.reload();
    } catch (e) {
      // Usually another tab holding the database open.
      setBusy(false);
      setError(
        `Couldn't reset: ${e instanceof Error ? e.message : String(e)}. Close other tabs and try again.`,
      );
    }
  }

  return (
    <Section
      title="This device"
      description="Removes all local data. If you're signed in, your synced data downloads again."
    >
      <Button variant="danger" disabled={busy} onClick={onReset}>
        Reset this device
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </Section>
  );
}
