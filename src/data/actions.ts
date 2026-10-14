import type { BodyRegion, EquipmentTemplate } from "@/seed/schema";
import { getDB, type LiftwiseDB } from "./db";
import { repo, type NewRecord, type RecordPatch } from "./repo";
import type { Equipment, Gym, Profile, RecordOf } from "./schema";

/** App-level writes. Everything goes through repositories so it syncs (PLAN.md §2.4). */

export const DEFAULT_PROFILE: NewRecord<"profiles"> = {
  goal: "hypertrophy",
  experience: "intermediate",
  sessions_per_week: 3,
  session_minutes: 60,
  time_saver_mode: false,
  calibration_offset: 0,
  config_overrides: {},
  current_gym_id: null,
};

export async function getProfile(db: LiftwiseDB = getDB()): Promise<Profile | undefined> {
  const profiles = await repo("profiles", db).list();
  return profiles.sort((a, b) => a.created_at - b.created_at)[0];
}

export async function saveProfile(
  patch: RecordPatch<"profiles">,
  db: LiftwiseDB = getDB(),
): Promise<Profile> {
  const existing = await getProfile(db);
  return existing
    ? repo("profiles", db).update(existing.id, patch)
    : repo("profiles", db).create({ ...DEFAULT_PROFILE, ...patch });
}

export async function createGym(name: string, db: LiftwiseDB = getDB()): Promise<Gym> {
  const gyms = await repo("gyms", db).list();
  const gym = await repo("gyms", db).create({ name: name.trim(), is_default: gyms.length === 0 });
  const profile = await getProfile(db);
  if (!profile?.current_gym_id) await saveProfile({ current_gym_id: gym.id }, db);
  return gym;
}

export async function setDefaultGym(gymId: string, db: LiftwiseDB = getDB()): Promise<void> {
  for (const gym of await repo("gyms", db).list()) {
    const isDefault = gym.id === gymId;
    if (gym.is_default !== isDefault)
      await repo("gyms", db).update(gym.id, { is_default: isDefault });
  }
}

export async function switchGym(gymId: string, db: LiftwiseDB = getDB()): Promise<void> {
  await saveProfile({ current_gym_id: gymId }, db);
}

export type EquipmentFields = Omit<
  NewRecord<"equipment">,
  "gym_id" | "status" | "broken_since" | "status_reason" | "photo_path"
> &
  Partial<Pick<Equipment, "photo_path">>;

export async function addEquipment(
  gymId: string,
  fields: EquipmentFields,
  exerciseIds: readonly string[],
  db: LiftwiseDB = getDB(),
): Promise<Equipment> {
  const equipment = await repo("equipment", db).create({
    ...fields,
    photo_path: fields.photo_path ?? null,
    gym_id: gymId,
    status: "active",
    broken_since: null,
    status_reason: null,
  });
  await setLinkedExercises(equipment.id, exerciseIds, db);
  return equipment;
}

export function templateFields(t: EquipmentTemplate): EquipmentFields {
  return {
    name: t.name,
    type: t.type,
    brand: null,
    model: null,
    min_kg: t.min_kg,
    max_kg: t.max_kg,
    increment_kg: t.increment_kg,
    micro_increment_kg: t.micro_increment_kg,
    notes: null,
  };
}

export async function addFromTemplate(
  gymId: string,
  template: EquipmentTemplate,
  db: LiftwiseDB = getDB(),
): Promise<Equipment> {
  return addEquipment(gymId, templateFields(template), template.exercise_ids, db);
}

export async function updateEquipment(
  id: string,
  patch: RecordPatch<"equipment">,
  db: LiftwiseDB = getDB(),
): Promise<Equipment> {
  return repo("equipment", db).update(id, patch);
}

/** Broken equipment is excluded until fixed and shows "broken since" (PROMPT: preferences). */
export async function setEquipmentStatus(
  id: string,
  status: Equipment["status"],
  reason: string | null = null,
  db: LiftwiseDB = getDB(),
): Promise<Equipment> {
  return repo("equipment", db).update(id, {
    status,
    status_reason: status === "active" ? null : reason,
    broken_since: status === "broken" ? Date.now() : null,
  });
}

export async function removeEquipment(id: string, db: LiftwiseDB = getDB()): Promise<void> {
  await setLinkedExercises(id, [], db);
  await repo("equipment", db).remove(id);
}

/** Replace a machine's supported exercises, soft-deleting removed links so the change syncs. */
export async function setLinkedExercises(
  equipmentId: string,
  exerciseIds: readonly string[],
  db: LiftwiseDB = getDB(),
): Promise<void> {
  const links = repo("equipment_exercises", db);
  const current = (
    await db.equipment_exercises.where("equipment_id").equals(equipmentId).toArray()
  ).filter((l) => l.deleted_at === null);
  const wanted = new Set(exerciseIds);
  await links.removeMany(current.filter((l) => !wanted.has(l.exercise_id)).map((l) => l.id));
  const have = new Set(current.map((l) => l.exercise_id));
  await links.createMany(
    [...wanted]
      .filter((id) => !have.has(id))
      .map((id) => ({ equipment_id: equipmentId, exercise_id: id })),
  );
}

type Target = { exerciseId: string } | { equipmentId: string };

async function findPref(target: Target, kind: "exclude" | "favourite", db: LiftwiseDB) {
  const prefs = await repo("exercise_prefs", db).list();
  return prefs.find(
    (p) =>
      p.kind === kind &&
      ("exerciseId" in target
        ? p.exercise_id === target.exerciseId
        : p.equipment_id === target.equipmentId),
  );
}

export async function setPreference(
  target: Target,
  kind: "exclude" | "favourite",
  on: boolean,
  reason: string | null = null,
  db: LiftwiseDB = getDB(),
): Promise<void> {
  const existing = await findPref(target, kind, db);
  if (on && !existing) {
    await repo("exercise_prefs", db).create({
      exercise_id: "exerciseId" in target ? target.exerciseId : null,
      equipment_id: "equipmentId" in target ? target.equipmentId : null,
      kind,
      reason,
    });
  } else if (!on && existing) {
    await repo("exercise_prefs", db).remove(existing.id);
  } else if (on && existing && reason !== existing.reason) {
    await repo("exercise_prefs", db).update(existing.id, { reason });
  }
}

export async function createCustomExercise(
  data: NewRecord<"exercises">,
  db: LiftwiseDB = getDB(),
): Promise<RecordOf<"exercises">> {
  return repo("exercises", db).create(data);
}

/** Today-only exclusions from swaps (busy, didn't feel like it, pain). */
export async function addTempExclusion(
  data: Omit<NewRecord<"temp_exclusions">, "date"> & { date?: string },
  db: LiftwiseDB = getDB(),
): Promise<void> {
  await repo("temp_exclusions", db).create({ ...data, date: data.date ?? localDate() });
}

export function localDate(ts: number = Date.now()): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type { BodyRegion };
