"use client";

import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/forms";
import { Button, Notice } from "@/components/ui";
import { createCustomExercise } from "@/data/actions";
import { getDB } from "@/data/db";
import { repo } from "@/data/repo";
import type { Muscle } from "@/data/schema";
import {
  customFatigueCost,
  machineNameKey,
  validateMachineProposal,
  type ValidatedProposal,
} from "@/engine/machine-proposal";
import type { Exercise } from "@/engine/types";
import { muscleLabel } from "@/engine/vector";
import { AiError, callAi, useAiStatus } from "@/lib/ai-client";
import { machineProposal, type MachineProposal } from "@/lib/ai-schemas";
import type { DictionaryEntry } from "@/engine/registry";
import { useRecords } from "@/hooks/use-data";
import type { EquipmentDraft } from "./equipment-form";

/**
 * The user's local machine dictionary: answers the AI gave earlier, cached so
 * the same machine name never calls the AI again (ALGORITHMS §13).
 */
export function useCachedDictionary(): DictionaryEntry[] {
  const cache = useRecords("ai_cache");
  return useMemo(
    () =>
      (cache ?? [])
        .filter((c) => c.kind === "machine_name")
        .flatMap((c) => {
          const v = c.value as {
            exercise_ids?: string[];
            equipment_type?: DictionaryEntry["equipment_type"];
          };
          return v?.exercise_ids && v.equipment_type
            ? [
                {
                  keywords: [c.key],
                  exercise_ids: v.exercise_ids,
                  equipment_type: v.equipment_type,
                },
              ]
            : [];
        }),
    [cache],
  );
}

/** Downscales a photo to ≤ 1024 px JPEG (≈ 100–300 KB) for the vision call. */
async function preparePhoto(file: File): Promise<{ base64: string; hash: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(binary), hash };
}

async function cached(
  kind: "machine_name" | "photo_hash",
  key: string,
): Promise<MachineProposal | null> {
  const rows = await getDB().ai_cache.where("[kind+key]").equals([kind, key]).toArray();
  const row = rows.find((r) => r.deleted_at === null);
  const parsed = machineProposal.safeParse(
    (row?.value as { proposal?: unknown } | undefined)?.proposal,
  );
  return parsed.success ? parsed.data : null;
}

/**
 * "Ask AI" for unknown machine names or photos (PROMPT M6, ALGORITHMS §18).
 * Shows a proposal; nothing changes until the user taps "Use this".
 */
export function MachineAssist({
  draft,
  onApply,
  catalog,
}: {
  draft: EquipmentDraft;
  onApply: (draft: EquipmentDraft) => void;
  catalog: ReadonlyMap<string, Exercise>;
}) {
  const ai = useAiStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ValidatedProposal | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  if (!ai?.enabled) return null;

  function show(raw: MachineProposal) {
    const v = validateMachineProposal(raw, catalog);
    setProposal(v);
    setKeep(new Set([...v.exerciseIds, ...v.newExercises.map((e) => `new:${e.name}`)]));
    if (!v.recognised) setError("The AI couldn't identify this machine. Fill it in by hand.");
  }

  async function ask(input: { name?: string; photo?: File }) {
    setBusy(true);
    setError(null);
    setProposal(null);
    try {
      let kind: "machine_name" | "photo_hash";
      let key: string;
      let photo: string | undefined;
      if (input.photo) {
        const prepared = await preparePhoto(input.photo);
        kind = "photo_hash";
        key = prepared.hash;
        photo = prepared.base64;
      } else {
        kind = "machine_name";
        key = machineNameKey(input.name ?? "");
      }
      // Same input never calls the AI twice.
      const hit = await cached(kind, key);
      if (hit) return show(hit);
      const result = await callAi<MachineProposal>("machine", {
        name: input.name?.trim() || undefined,
        photo,
        photo_type: photo ? "image/jpeg" : undefined,
        catalog: [...catalog.values()].map((e) => ({ id: e.id, name: e.name, pattern: e.pattern })),
      });
      const parsed = machineProposal.parse(result);
      const v = validateMachineProposal(parsed, catalog);
      await repo("ai_cache", getDB()).create({
        kind,
        key,
        // exercise_ids/equipment_type feed the local keyword dictionary (§13).
        value: { proposal: parsed, exercise_ids: v.exerciseIds, equipment_type: v.type },
      });
      show(parsed);
    } catch (e) {
      setError(
        e instanceof AiError ? e.message : "Couldn't read that. Try again or fill it in by hand.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!proposal) return;
    setBusy(true);
    const ids = new Set(draft.exerciseIds);
    for (const id of proposal.exerciseIds) if (keep.has(id)) ids.add(id);
    for (const ex of proposal.newExercises) {
      if (!keep.has(`new:${ex.name}`)) continue;
      const created = await createCustomExercise({
        name: ex.name,
        pattern: ex.pattern,
        vector: ex.vector as Record<Muscle, 1 | 0.5>,
        kind: ex.kind,
        equipment_types: [proposal.type],
        fatigue_cost: customFatigueCost(ex.kind, ex.vector),
        rep_range: { strength: [4, 8], hypertrophy: [8, 15] },
      });
      ids.add(created.id);
    }
    onApply({
      ...draft,
      name: draft.name.trim() || proposal.name,
      type: proposal.type,
      brand: proposal.brand ?? draft.brand,
      model: proposal.model ?? draft.model,
      notes: proposal.notes ?? draft.notes,
      exerciseIds: ids,
    });
    setProposal(null);
    setBusy(false);
  }

  const toggle = (k: string) =>
    setKeep((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 p-3">
      <p className="text-xs text-zinc-400">
        Not sure what it is? AI can propose the exercises it supports.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          disabled={busy || draft.name.trim().length < 3}
          onClick={() => void ask({ name: draft.name })}
        >
          Ask AI
        </Button>
        <Button disabled={busy} onClick={() => fileRef.current?.click()}>
          From photo
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Machine photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void ask({ name: draft.name, photo: file });
        }}
      />
      {busy && <p className="text-sm text-zinc-400">Asking…</p>}
      {error && <Notice>{error}</Notice>}
      {proposal?.recognised && (
        <div className="flex flex-col gap-2 rounded-lg bg-zinc-950 p-3 text-sm">
          <p className="font-medium">
            {proposal.name}
            {proposal.brand ? ` · ${proposal.brand}` : ""}
            {proposal.model ? ` ${proposal.model}` : ""}
          </p>
          <p className="text-xs text-zinc-500">AI proposal: check it before saving.</p>
          <ul className="flex flex-col gap-1">
            {proposal.exerciseIds.map((id) => (
              <li key={id}>
                <label className="flex min-h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-lime-400"
                    checked={keep.has(id)}
                    onChange={() => toggle(id)}
                  />
                  {catalog.get(id)?.name}
                </label>
              </li>
            ))}
            {proposal.newExercises.map((ex) => (
              <li key={ex.name}>
                <label className="flex min-h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-lime-400"
                    checked={keep.has(`new:${ex.name}`)}
                    onChange={() => toggle(`new:${ex.name}`)}
                  />
                  <span>
                    {ex.name} <Badge tone="warn">new exercise</Badge>
                    <span className="block text-xs text-zinc-500">
                      {Object.keys(ex.vector)
                        .map((m) => muscleLabel(m as Muscle))
                        .join(", ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="primary"
              disabled={busy || keep.size === 0}
              onClick={() => void apply()}
            >
              Use this
            </Button>
            <Button onClick={() => setProposal(null)}>Discard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
