"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { getProfile } from "@/data/actions";
import { repo } from "@/data/repo";
import type { RecordOf, TableName } from "@/data/schema";
import { buildCatalog } from "@/seed/catalog";

/** Live views over IndexedDB; components re-render when the data changes. undefined = loading. */

export function useRecords<T extends TableName>(table: T): RecordOf<T>[] | undefined {
  return useLiveQuery(() => repo(table).list(), [table]);
}

export function useProfile() {
  // null = loaded, no profile yet (onboarding); undefined = still loading.
  return useLiveQuery(async () => (await getProfile()) ?? null, []);
}

export function useCatalog() {
  const customs = useRecords("exercises");
  return useMemo(() => buildCatalog(customs ?? []), [customs]);
}

/** Everything screens need about the gym the user is training in. */
export function useGymContext() {
  const profile = useProfile();
  const gyms = useRecords("gyms");
  const allEquipment = useRecords("equipment");
  const links = useRecords("equipment_exercises");
  const prefs = useRecords("exercise_prefs");
  const catalog = useCatalog();

  return useMemo(() => {
    if (profile === undefined || !gyms || !allEquipment || !links || !prefs) return undefined;
    const gym =
      gyms.find((g) => g.id === profile?.current_gym_id) ??
      gyms.find((g) => g.is_default) ??
      gyms[0] ??
      null;
    const equipment = gym ? allEquipment.filter((e) => e.gym_id === gym.id) : [];
    const equipmentIds = new Set(equipment.map((e) => e.id));
    return {
      profile,
      gyms,
      gym,
      equipment,
      links: links.filter((l) => equipmentIds.has(l.equipment_id)),
      allLinks: links,
      prefs,
      catalog,
      favouriteExercises: new Set(
        prefs.filter((p) => p.kind === "favourite" && p.exercise_id).map((p) => p.exercise_id!),
      ),
      excludedExercises: new Set(
        prefs.filter((p) => p.kind === "exclude" && p.exercise_id).map((p) => p.exercise_id!),
      ),
      favouriteEquipment: new Set(
        prefs.filter((p) => p.kind === "favourite" && p.equipment_id).map((p) => p.equipment_id!),
      ),
      excludedEquipment: new Set(
        prefs.filter((p) => p.kind === "exclude" && p.equipment_id).map((p) => p.equipment_id!),
      ),
    };
  }, [profile, gyms, allEquipment, links, prefs, catalog]);
}

export type GymContext = NonNullable<ReturnType<typeof useGymContext>>;
