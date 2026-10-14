import type { GainpathDB } from "@/data/db";
import { mergeRecords } from "@/data/merge";
import { getOwnerId, LOCAL_OWNER, setOwnerId } from "@/data/repo";
import {
  TABLE_NAMES,
  tableSchemas,
  type RecordOf,
  type Stored,
  type TableName,
} from "@/data/schema";
import type { PullCursor, SyncRemote } from "./remote";

/** One sync pass: claim ownership if needed, push dirty rows, pull changes (PLAN.md §2.4). */

export const PUSH_BATCH = 200;
export const PULL_PAGE = 500;
/** Each pull starts this far before the saved cursor to catch transactions that committed late. */
export const PULL_OVERLAP_MS = 10_000;

const cursorKey = (table: TableName) => `cursor:${table}`;
export const LAST_SYNCED_KEY = "last_synced_at";

/** The device holds another account's data; syncing it would upload it to the wrong account. */
export class OwnershipConflictError extends Error {
  constructor(
    readonly deviceOwner: string,
    readonly signedInAs: string,
  ) {
    super("This device holds data for a different account.");
  }
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  invalid: number;
}

/**
 * Rows created while signed out belong to the `local` placeholder. On first
 * sign-in they are re-owned and marked dirty so they upload. Rows owned by a
 * different account are never claimed.
 */
export async function claimOwnership(db: GainpathDB, userId: string): Promise<void> {
  const owner = await getOwnerId(db);
  if (owner === userId) return;
  if (owner !== LOCAL_OWNER) throw new OwnershipConflictError(owner, userId);
  await db.transaction("rw", [...TABLE_NAMES, "meta"], async () => {
    for (const table of TABLE_NAMES) {
      await db
        .table(table)
        .where("user_id")
        .equals(LOCAL_OWNER)
        .modify({ user_id: userId, dirty: 1 });
    }
    await setOwnerId(userId, db);
  });
}

async function pushTable(db: GainpathDB, remote: SyncRemote, table: TableName): Promise<number> {
  const store = db.table<Stored<TableName>, string>(table);
  let pushed = 0;
  // Each pass re-reads the queue, so rows edited mid-push are picked up again.
  for (;;) {
    const batch = await store.where("dirty").equals(1).limit(PUSH_BATCH).toArray();
    if (batch.length === 0) return pushed;
    const records = batch.map(({ dirty: _dirty, ...record }) => record as RecordOf<TableName>);
    await remote.push(table, records);
    const cleared = await db.transaction("rw", store, async () => {
      const current = await store.bulkGet(records.map((r) => r.id));
      // Only clear rows still at the version we pushed; a newer local edit stays queued.
      const clean = current.filter(
        (row, i): row is Stored<TableName> => !!row && row.updated_at === records[i].updated_at,
      );
      await store.bulkPut(clean.map((row) => ({ ...row, dirty: 0 as const })));
      return clean.length;
    });
    pushed += records.length;
    // Everything in the batch was edited again mid-push; stop and let the next sync retry.
    if (cleared === 0) return pushed;
  }
}

function rewind(cursor: PullCursor): PullCursor {
  const ms = Date.parse(cursor.ts);
  if (Number.isNaN(ms)) return { ts: cursor.ts, id: "" };
  return { ts: new Date(ms - PULL_OVERLAP_MS).toISOString(), id: "" };
}

async function pullTable(
  db: GainpathDB,
  remote: SyncRemote,
  table: TableName,
): Promise<{ pulled: number; invalid: number }> {
  const saved = (await db.meta.get(cursorKey(table)))?.value as PullCursor | undefined;
  let after: PullCursor | null = saved ? rewind(saved) : null;
  let latest = saved ?? null;
  let pulled = 0;
  let invalid = 0;
  for (;;) {
    const page = await remote.pull(table, after, PULL_PAGE);
    const records: RecordOf<TableName>[] = [];
    for (const row of page.rows) {
      const parsed = tableSchemas[table].safeParse(row);
      if (parsed.success) records.push(parsed.data as RecordOf<TableName>);
      else invalid++; // Skip it rather than stall sync forever on one bad row.
    }
    if (records.length > 0) await mergeRecords(db, table, records, "remote");
    pulled += records.length;
    if (page.cursor) {
      after = page.cursor;
      if (!latest || compareCursor(page.cursor, latest) > 0) latest = page.cursor;
    }
    if (page.rows.length < PULL_PAGE || !page.cursor) break;
  }
  if (latest) await db.meta.put({ key: cursorKey(table), value: latest });
  return { pulled, invalid };
}

function compareCursor(a: PullCursor, b: PullCursor): number {
  const ta = Date.parse(a.ts);
  const tb = Date.parse(b.ts);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function syncOnce(
  db: GainpathDB,
  remote: SyncRemote,
  userId: string,
): Promise<SyncResult> {
  await claimOwnership(db, userId);
  const result: SyncResult = { pushed: 0, pulled: 0, invalid: 0 };
  for (const table of TABLE_NAMES) result.pushed += await pushTable(db, remote, table);
  for (const table of TABLE_NAMES) {
    const { pulled, invalid } = await pullTable(db, remote, table);
    result.pulled += pulled;
    result.invalid += invalid;
  }
  await db.meta.put({ key: LAST_SYNCED_KEY, value: Date.now() });
  return result;
}

export async function countPending(db: GainpathDB): Promise<number> {
  let total = 0;
  for (const table of TABLE_NAMES) total += await db.table(table).where("dirty").equals(1).count();
  return total;
}
