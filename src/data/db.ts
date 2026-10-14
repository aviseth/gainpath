import Dexie, { type EntityTable } from "dexie";
import type { Stored, TableName } from "./schema";

/**
 * Local-first store (PLAN.md §2.2). IndexedDB is the source of truth on the
 * device; Supabase is a backup that sync reconciles with last-write-wins.
 *
 * Every synced table is indexed on `dirty` (the push queue) and `updated_at`.
 * `dirty` is 0/1 rather than a boolean because IndexedDB can't index booleans.
 */

export interface MetaRow {
  key: string;
  value: unknown;
}

type SyncedTables = { [T in TableName]: EntityTable<Stored<T>, "id"> };

export type GainpathDB = Dexie & SyncedTables & { meta: EntityTable<MetaRow, "key"> };

const BASE = "id, user_id, updated_at, dirty";

/** Index definitions. Changing one requires a new `db.version(n)`. */
export const STORES: Record<TableName | "meta", string> = {
  profiles: BASE,
  gyms: BASE,
  equipment: `${BASE}, gym_id`,
  exercises: BASE,
  equipment_exercises: `${BASE}, equipment_id, exercise_id`,
  exercise_prefs: `${BASE}, exercise_id, equipment_id`,
  temp_exclusions: `${BASE}, date`,
  sessions: `${BASE}, date, status`,
  set_logs: `${BASE}, session_id, [exercise_id+equipment_id+ts]`,
  e1rm_estimates: `${BASE}, [exercise_id+equipment_id]`,
  swaps: `${BASE}, session_id, removed_equipment_id`,
  checkins: `${BASE}, date`,
  wearable_daily: `${BASE}, date`,
  anchors: `${BASE}, muscle_region`,
  mesocycles: `${BASE}, start`,
  ai_cache: `${BASE}, [kind+key]`,
  meta: "key",
};

export function createDB(name = "gainpath"): GainpathDB {
  const db = new Dexie(name) as GainpathDB;
  db.version(1).stores(STORES);
  return db;
}

let instance: GainpathDB | null = null;

/** The app-wide database. Created lazily so server rendering never touches IndexedDB. */
export function getDB(): GainpathDB {
  instance ??= createDB();
  return instance;
}

/** Test hook: swap the singleton (e.g. for a fresh fake-indexeddb database). */
export function setDB(db: GainpathDB | null): void {
  instance = db;
}
