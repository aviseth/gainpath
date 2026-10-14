import { uuidv7 } from "uuidv7";
import { getDB, type LiftwiseDB } from "./db";
import {
  tableSchemas,
  type BaseRecord,
  type RecordOf,
  type Stored,
  type TableName,
} from "./schema";

/** Owner of rows created before sign-in. Re-owned to the auth user id on first sign-in. */
export const LOCAL_OWNER = "local";

const OWNER_KEY = "owner_id";

export async function getOwnerId(db: LiftwiseDB = getDB()): Promise<string> {
  const row = await db.meta.get(OWNER_KEY);
  return typeof row?.value === "string" ? row.value : LOCAL_OWNER;
}

export async function setOwnerId(ownerId: string, db: LiftwiseDB = getDB()): Promise<void> {
  await db.meta.put({ key: OWNER_KEY, value: ownerId });
}

/**
 * Last-write-wins needs every local edit to beat the version it replaces, even
 * if the device clock went backwards, so timestamps never decrease per row.
 */
export function nextTimestamp(previous?: number): number {
  return Math.max(Date.now(), (previous ?? 0) + 1);
}

type Listener = (table: TableName) => void;
const listeners = new Set<Listener>();

/** Subscribe to local writes (used by the sync scheduler to push soon after an edit). */
export function onLocalWrite(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyLocalWrite(table: TableName): void {
  for (const listener of listeners) listener(table);
}
const notify = notifyLocalWrite;

export type NewRecord<T extends TableName> = Omit<RecordOf<T>, keyof BaseRecord> & { id?: string };
export type RecordPatch<T extends TableName> = Partial<Omit<RecordOf<T>, keyof BaseRecord>>;

function strip<T extends TableName>(row: Stored<T>): RecordOf<T> {
  const { dirty: _dirty, ...record } = row;
  return record as unknown as RecordOf<T>;
}

/** Typed CRUD over one synced table. Reads hide soft-deleted rows. */
export function repo<T extends TableName>(table: T, db: LiftwiseDB = getDB()) {
  const store = () => db.table<Stored<T>, string>(table);
  const validate = (record: unknown) => tableSchemas[table].parse(record) as RecordOf<T>;

  return {
    async get(id: string): Promise<RecordOf<T> | undefined> {
      const row = await store().get(id);
      return row && row.deleted_at === null ? strip(row) : undefined;
    },

    async list(): Promise<RecordOf<T>[]> {
      const rows = await store().toArray();
      return rows.filter((r) => r.deleted_at === null).map(strip);
    },

    async create(data: NewRecord<T>): Promise<RecordOf<T>> {
      const now = nextTimestamp();
      const record = validate({
        ...data,
        id: data.id ?? uuidv7(),
        user_id: await getOwnerId(db),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      await store().add({ ...record, dirty: 1 } as Stored<T>);
      notify(table);
      return record;
    },

    async update(id: string, patch: RecordPatch<T>): Promise<RecordOf<T>> {
      const record = await db.transaction("rw", store(), async () => {
        const existing = await store().get(id);
        if (!existing || existing.deleted_at !== null) throw new Error(`${table}/${id} not found`);
        const next = validate({
          ...strip(existing),
          ...patch,
          updated_at: nextTimestamp(existing.updated_at),
        });
        await store().put({ ...next, dirty: 1 } as Stored<T>);
        return next;
      });
      notify(table);
      return record;
    },

    /** Soft delete: keeps a tombstone so the deletion syncs (PLAN.md §2). */
    async remove(id: string): Promise<void> {
      const removed = await db.transaction("rw", store(), async () => {
        const existing = await store().get(id);
        if (!existing || existing.deleted_at !== null) return false;
        const now = nextTimestamp(existing.updated_at);
        await store().put({ ...existing, deleted_at: now, updated_at: now, dirty: 1 } as Stored<T>);
        return true;
      });
      if (removed) notify(table);
    },
  };
}
