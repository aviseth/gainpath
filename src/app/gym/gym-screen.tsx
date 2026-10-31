"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, EmptyState, Field, Select, Sheet, TextInput } from "@/components/forms";
import { ChevronRightIcon, PlusIcon, StarIcon } from "@/components/icons";
import { MachineSchematic, SchematicTile, machinePattern } from "@/components/schematics";
import { Button, PageHeader, linkClass, primaryLinkClass } from "@/components/ui";
import { createGym, setDefaultGym, switchGym } from "@/data/actions";
import type { Equipment, MovementPattern } from "@/data/schema";
import { useGymContext } from "@/hooks/use-data";
import { EQUIPMENT_TYPE_LABELS, formatDate, formatKg } from "@/lib/labels";
import { AddEquipmentSheet } from "./add-equipment-sheet";
import { EquipmentSheet } from "./equipment-sheet";

export function GymScreen() {
  const ctx = useGymContext();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [newGym, setNewGym] = useState<string | null>(null);

  if (!ctx) return <p className="px-1 text-on-surface-variant">Loading…</p>;
  const { gym, gyms, equipment, links, catalog } = ctx;

  if (!gym) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="My gym" />
        <EmptyState>No gym yet.</EmptyState>
        <Link href="/onboarding" className={primaryLinkClass}>
          Set up your gym
        </Link>
      </div>
    );
  }

  const linkCount = (id: string) => links.filter((l) => l.equipment_id === id).length;
  const patternOf = (id: string) =>
    machinePattern(
      links.filter((l) => l.equipment_id === id).map((l) => l.exercise_id),
      catalog,
    );
  const visible = equipment.filter((e) => e.status !== "archived");
  const archived = equipment.filter((e) => e.status === "archived");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="My gym"
        action={
          <Link href="/gym/check" className={linkClass}>
            Check my gym
          </Link>
        }
      />

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
        <Button variant="tonal" className="min-h-14! w-auto! px-4" onClick={() => setNewGym("")}>
          <PlusIcon size={18} />
          Gym
        </Button>
      </div>
      {!gym.is_default && (
        <button
          type="button"
          className={`${linkClass} -mt-2 self-start`}
          onClick={() => void setDefaultGym(gym.id)}
        >
          Make {gym.name} my default gym
        </button>
      )}

      <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
        <PlusIcon size={20} />
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
          <section
            key={type}
            aria-label={label}
            className="rounded-card bg-surface-container-low py-2"
          >
            <h2 className="flex items-baseline justify-between px-4 pt-2.5 pb-1 text-title">
              {label}
              <span className="text-[13px] font-normal text-on-surface-variant">
                {items.length}
              </span>
            </h2>
            <ul className="flex flex-col">
              {items.map((e) => (
                <li key={e.id}>
                  <EquipmentRow
                    equipment={e}
                    links={linkCount(e.id)}
                    pattern={patternOf(e.id)}
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
        <details className="rounded-card bg-surface-container-low py-2 text-sm">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold text-on-surface-variant">
            Archived ({archived.length})
          </summary>
          <ul className="flex flex-col">
            {archived.map((e) => (
              <li key={e.id}>
                <EquipmentRow
                  equipment={e}
                  links={linkCount(e.id)}
                  pattern={patternOf(e.id)}
                  onClick={() => setEditing(e)}
                />
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
  pattern,
  favourite,
  excluded,
  onClick,
}: {
  equipment: Equipment;
  links: number;
  pattern: MovementPattern | null;
  favourite?: boolean;
  excluded?: boolean;
  onClick: () => void;
}) {
  const broken = e.status === "broken";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[4.25rem] w-full items-center gap-3.5 px-4 py-2 text-left hover:bg-on-surface/5"
    >
      <span className={broken || excluded || e.status === "archived" ? "opacity-50" : ""}>
        <SchematicTile size={44}>
          <MachineSchematic type={e.type} pattern={pattern} size={30} />
        </SchematicTile>
      </span>
      <span
        className={`flex min-w-0 flex-1 flex-col ${
          broken || excluded || e.status === "archived" ? "opacity-60" : ""
        }`}
      >
        <span className="flex items-center gap-1 truncate text-title">
          {favourite && (
            <span aria-label="favourite" role="img" className="shrink-0 text-tertiary">
              <StarIcon filled size={16} />
            </span>
          )}
          <span className="truncate">{e.name}</span>
        </span>
        <span className="truncate text-[13px] text-on-surface-variant">
          {e.weights_kg?.length
            ? `${formatKg(e.weights_kg[0])}–${formatKg(e.weights_kg.at(-1)!)} · ${e.weights_kg.length} weights`
            : e.max_kg > 0
              ? `${formatKg(e.min_kg)}–${formatKg(e.max_kg)} · +${formatKg(e.increment_kg)}`
              : "Bodyweight"}{" "}
          · {links} exercise{links === 1 ? "" : "s"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="flex flex-col items-end gap-1">
          {broken && (
            <Badge tone="bad">
              Broken{e.broken_since ? ` since ${formatDate(e.broken_since)}` : ""}
            </Badge>
          )}
          {excluded && <Badge tone="warn">Excluded</Badge>}
          {links === 0 && <Badge tone="warn">No exercises</Badge>}
        </span>
        <ChevronRightIcon size={18} className="text-on-surface-variant" />
      </span>
    </button>
  );
}
