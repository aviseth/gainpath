"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, EmptyState, Field, Select, Sheet, TextInput } from "@/components/forms";
import { Button } from "@/components/ui";
import { createGym, setDefaultGym, switchGym } from "@/data/actions";
import type { Equipment } from "@/data/schema";
import { useGymContext } from "@/hooks/use-data";
import { EQUIPMENT_TYPE_LABELS, formatDate, formatKg } from "@/lib/labels";
import { AddEquipmentSheet } from "./add-equipment-sheet";
import { EquipmentSheet } from "./equipment-sheet";

export function GymScreen() {
  const ctx = useGymContext();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [newGym, setNewGym] = useState<string | null>(null);

  if (!ctx) return <p className="text-zinc-400">Loading…</p>;
  const { gym, gyms, equipment, links } = ctx;

  if (!gym) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">My gym</h1>
        <EmptyState>No gym yet.</EmptyState>
        <Link
          href="/onboarding"
          className="flex min-h-12 items-center justify-center rounded-sm bg-zinc-100 font-display text-lg font-bold uppercase tracking-wider text-zinc-950"
        >
          Set up your gym
        </Link>
      </div>
    );
  }

  const linkCount = (id: string) => links.filter((l) => l.equipment_id === id).length;
  const visible = equipment.filter((e) => e.status !== "archived");
  const archived = equipment.filter((e) => e.status === "archived");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">My gym</h1>
        <Link
          href="/gym/check"
          className="text-sm text-zinc-100 underline decoration-1 underline-offset-4"
        >
          Check my gym
        </Link>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            aria-label="Current gym"
            value={gym.id}
            onChange={(id) => void switchGym(id)}
            options={gyms.map((g) => ({
              value: g.id,
              label: g.is_default ? `${g.name} (default)` : g.name,
            }))}
          />
        </div>
        <Button className="w-auto! px-4" onClick={() => setNewGym("")}>
          + Gym
        </Button>
      </div>
      {!gym.is_default && (
        <button
          type="button"
          className="self-start text-sm text-zinc-400 underline"
          onClick={() => void setDefaultGym(gym.id)}
        >
          Make {gym.name} my default gym
        </button>
      )}

      <Button variant="primary" onClick={() => setAdding(true)}>
        Add equipment
      </Button>

      {visible.length === 0 && (
        <EmptyState>No equipment registered yet. Add what your gym has.</EmptyState>
      )}

      {Object.entries(EQUIPMENT_TYPE_LABELS).map(([type, label]) => {
        const items = visible
          .filter((e) => e.type === type)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (items.length === 0) return null;
        return (
          <section key={type} aria-label={label}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {label}
            </h2>
            <ul className="flex flex-col gap-2">
              {items.map((e) => (
                <li key={e.id}>
                  <EquipmentRow
                    equipment={e}
                    links={linkCount(e.id)}
                    favourite={ctx.favouriteEquipment.has(e.id)}
                    excluded={ctx.excludedEquipment.has(e.id)}
                    onClick={() => setEditing(e)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {archived.length > 0 && (
        <details className="text-sm text-zinc-400">
          <summary className="min-h-10 cursor-pointer">Archived ({archived.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {archived.map((e) => (
              <li key={e.id}>
                <EquipmentRow equipment={e} links={linkCount(e.id)} onClick={() => setEditing(e)} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {adding && <AddEquipmentSheet gymId={gym.id} ctx={ctx} onClose={() => setAdding(false)} />}
      {editing && (
        <EquipmentSheet
          equipment={equipment.find((e) => e.id === editing.id) ?? editing}
          ctx={ctx}
          onClose={() => setEditing(null)}
        />
      )}
      {newGym !== null && (
        <Sheet
          title="Add a gym"
          onClose={() => setNewGym(null)}
          footer={
            <Button
              variant="primary"
              disabled={!newGym.trim()}
              onClick={async () => {
                const g = await createGym(newGym);
                await switchGym(g.id);
                setNewGym(null);
              }}
            >
              Create gym
            </Button>
          }
        >
          <Field label="Name" hint="e.g. home, a hotel, a second gym">
            <TextInput value={newGym} onChange={(e) => setNewGym(e.target.value)} autoFocus />
          </Field>
        </Sheet>
      )}
    </div>
  );
}

function EquipmentRow({
  equipment: e,
  links,
  favourite,
  excluded,
  onClick,
}: {
  equipment: Equipment;
  links: number;
  favourite?: boolean;
  excluded?: boolean;
  onClick: () => void;
}) {
  const broken = e.status === "broken";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-14 w-full items-center justify-between gap-3 border-b border-zinc-700 px-3 py-2 text-left ${
        broken || excluded || e.status === "archived" ? "opacity-50" : ""
      }`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">
          {favourite && <span aria-label="favourite">★ </span>}
          {e.name}
        </span>
        <span className="text-xs text-zinc-500">
          {e.max_kg > 0
            ? `${formatKg(e.min_kg)}–${formatKg(e.max_kg)} · +${formatKg(e.increment_kg)}`
            : "Bodyweight"}{" "}
          · {links} exercise{links === 1 ? "" : "s"}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {broken && (
          <Badge tone="bad">
            Broken{e.broken_since ? ` since ${formatDate(e.broken_since)}` : ""}
          </Badge>
        )}
        {excluded && <Badge tone="warn">Excluded</Badge>}
        {links === 0 && <Badge tone="warn">No exercises</Badge>}
      </span>
    </button>
  );
}
