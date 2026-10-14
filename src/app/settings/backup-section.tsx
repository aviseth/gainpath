"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button, Notice, Section } from "@/components/ui";
import { backupFileName, exportBackup, importBackup } from "@/data/backup";
import { getDB } from "@/data/db";

export function BackupSection() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function onExport() {
    setBusy(true);
    setResult(null);
    try {
      const backup = await exportBackup(getDB());
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backupFileName(backup);
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setResult({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const { applied, skipped } = await importBackup(getDB(), await file.text());
      setResult({
        tone: "success",
        text: `Imported ${applied} record${applied === 1 ? "" : "s"}${skipped ? ` (${skipped} already up to date)` : ""}.`,
      });
    } catch (e) {
      setResult({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Backup"
      description="Download everything as a JSON file, or restore one. Importing merges with what's here; newer edits win."
    >
      <Button disabled={busy} onClick={onExport}>
        Export JSON
      </Button>
      <Button disabled={busy} onClick={() => fileInput.current?.click()}>
        Import JSON
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImport}
        data-testid="import-input"
      />
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </Section>
  );
}
