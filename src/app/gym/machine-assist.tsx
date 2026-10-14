"use client";

import { useMemo } from "react";
import type { Exercise } from "@/engine/types";
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

/** "Ask AI" for unknown machine names or photos. Wired up in milestone 6. */
export function MachineAssist(_props: {
  draft: EquipmentDraft;
  onApply: (draft: EquipmentDraft) => void;
  catalog: ReadonlyMap<string, Exercise>;
}) {
  return null;
}
