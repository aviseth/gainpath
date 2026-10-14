"use client";

import { useState } from "react";
import { Button, Section } from "@/components/ui";
import { getDB } from "@/data/db";

export function DeviceSection() {
  const [busy, setBusy] = useState(false);

  async function onReset() {
    const ok = window.confirm(
      "Delete all Liftwise data on this device? Anything not synced or exported will be lost.",
    );
    if (!ok) return;
    setBusy(true);
    await getDB().delete();
    window.location.reload();
  }

  return (
    <Section
      title="This device"
      description="Removes all local data. If you're signed in, your synced data downloads again."
    >
      <Button variant="danger" disabled={busy} onClick={onReset}>
        Reset this device
      </Button>
    </Section>
  );
}
