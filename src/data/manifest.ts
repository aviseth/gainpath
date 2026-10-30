import type { GymManifest } from "@/seed/gyms/manifest";
import type { GainpathDB } from "./db";
import { mergeRecords } from "./merge";
import { getOwnerId, notifyLocalWrite } from "./repo";
import { getProfile, saveProfile } from "./actions";
import type { RecordOf } from "./schema";
import { stableUuid } from "@/lib/stable-uuid";

export { stableUuid };

/**
 * Applies committed gym manifests (src/seed/gyms) to the local database.
 * Ids are derived from stable keys and every record carries the manifest's
 * version as its timestamp, so applying is idempotent and any edit the user
 * makes in the app (a newer timestamp) wins under last-write-wins.
 */

export const manifestGymId = (m: GymManifest) => stableUuid(`gym:${m.gym.key}`);
export const manifestEquipmentId = (m: GymManifest, key: string) =>
  stableUuid(`equipment:${m.gym.key}:${key}`);
const linkId = (equipmentId: string, exerciseId: string) =>
  stableUuid(`link:${equipmentId}:${exerciseId}`);

export function manifestRecords(manifest: GymManifest, ownerId: string) {
  const base = {
    user_id: ownerId,
    created_at: manifest.version,
    updated_at: manifest.version,
    deleted_at: null,
  };
  const gymId = manifestGymId(manifest);
  const gym: RecordOf<"gyms"> = { ...base, id: gymId, name: manifest.gym.name, is_default: false };
  const equipment: RecordOf<"equipment">[] = [];
  const links: RecordOf<"equipment_exercises">[] = [];
  for (const item of manifest.equipment) {
    const id = manifestEquipmentId(manifest, item.key);
    const needsCheck =
      item.unverified.length > 0 ? `Please confirm: ${item.unverified.join(", ")}.` : null;
    equipment.push({
      ...base,
      id,
      gym_id: gymId,
      name: item.name,
      type: item.type,
      brand: item.brand,
      model: item.model,
      min_kg: item.min_kg,
      max_kg: item.max_kg,
      increment_kg: item.increment_kg,
      micro_increment_kg: item.micro_increment_kg,
      weights_kg: item.weights_kg,
      photo_path: null,
      notes: [item.notes, needsCheck].filter(Boolean).join(" ") || null,
      status: "active",
      broken_since: null,
      status_reason: null,
    });
    for (const exerciseId of item.exercise_ids) {
      links.push({
        ...base,
        id: linkId(id, exerciseId),
        equipment_id: id,
        exercise_id: exerciseId,
      });
    }
  }
  return { gym, equipment, links };
}

const metaKey = (m: GymManifest) => `manifest:${m.gym.key}`;

export async function applyGymManifests(
  db: GainpathDB,
  manifests: readonly GymManifest[],
): Promise<number> {
  let applied = 0;
  for (const manifest of manifests) {
    const seen = (await db.meta.get(metaKey(manifest)))?.value;
    if (seen === manifest.version) continue;
    const { gym, equipment, links } = manifestRecords(manifest, await getOwnerId(db));

    // Links this manifest created earlier but no longer lists become tombstones.
    const equipmentIds = new Set(equipment.map((e) => e.id));
    const wanted = new Set(links.map((l) => l.id));
    const stale = (await db.equipment_exercises.toArray())
      .filter(
        (l) =>
          equipmentIds.has(l.equipment_id) &&
          !wanted.has(l.id) &&
          l.id === linkId(l.equipment_id, l.exercise_id) &&
          l.deleted_at === null,
      )
      .map(({ dirty: _dirty, ...l }) => ({
        ...l,
        deleted_at: manifest.version,
        updated_at: manifest.version,
      }));

    await db.transaction(
      "rw",
      [db.gyms, db.equipment, db.equipment_exercises, db.meta],
      async () => {
        await mergeRecords(db, "gyms", [gym], "import");
        await mergeRecords(db, "equipment", equipment, "import");
        await mergeRecords(db, "equipment_exercises", [...links, ...stale], "import");
        await db.meta.put({ key: metaKey(manifest), value: manifest.version });
      },
    );
    for (const table of ["gyms", "equipment", "equipment_exercises"] as const)
      notifyLocalWrite(table);

    // Don't create a profile here: onboarding runs when there is none, and offers this gym.
    const profile = await getProfile(db);
    if (profile && !profile.current_gym_id) await saveProfile({ current_gym_id: gym.id }, db);
    applied++;
  }
  return applied;
}
