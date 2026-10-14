import { uuidv7 } from "uuidv7";
import { createDB, type GainpathDB } from "@/data/db";
import type { RecordOf, TableName } from "@/data/schema";
import type { PullCursor, PullPage, SyncRemote } from "@/sync/remote";

/** A fresh, isolated IndexedDB (fake-indexeddb) per test. */
export function freshDB(): GainpathDB {
  return createDB(`test-${uuidv7()}`);
}

export const gymInput = (name = "Home gym") => ({ name, is_default: true });

/**
 * In-memory stand-in for Supabase: last-write-wins on `updated_at`, a
 * monotonically increasing `server_updated_at` on every accepted write, and
 * keyset pagination on (server_updated_at, id), mirroring the migration.
 */
export class FakeRemote implements SyncRemote {
  rows = new Map<string, { table: TableName; record: Record<string, unknown>; ts: string }>();
  pushCalls = 0;
  failNextPush = false;
  /** Called after the server accepts a push, before the client clears dirty flags. */
  afterPush?: () => Promise<void>;
  private clock = Date.parse("2026-01-01T00:00:00.000Z");

  constructor(private readonly userId: string) {}

  private tick(): string {
    this.clock += 1;
    return new Date(this.clock).toISOString();
  }

  async push<T extends TableName>(table: T, records: RecordOf<T>[]): Promise<void> {
    this.pushCalls++;
    if (this.failNextPush) {
      this.failNextPush = false;
      throw new Error("network down");
    }
    for (const record of records) {
      const key = `${table}/${record.id}`;
      const existing = this.rows.get(key);
      if (!existing || record.updated_at > (existing.record.updated_at as number)) {
        // Like the RPC, the server forces user_id to the signed-in user.
        this.rows.set(key, { table, record: { ...record, user_id: this.userId }, ts: this.tick() });
      }
    }
    await this.afterPush?.();
  }

  /** Simulates another device writing directly to the cloud. */
  writeFromOtherDevice<T extends TableName>(table: T, record: RecordOf<T>): void {
    this.rows.set(`${table}/${record.id}`, {
      table,
      record: { ...record, user_id: this.userId },
      ts: this.tick(),
    });
  }

  async pull(table: TableName, after: PullCursor | null, limit: number): Promise<PullPage> {
    const sorted = [...this.rows.values()]
      .filter((r) => r.table === table)
      .sort((a, b) => (a.ts === b.ts ? cmp(a.record.id, b.record.id) : cmp(a.ts, b.ts)))
      .filter((r) => {
        if (!after) return true;
        if (after.id === "") return r.ts >= after.ts;
        return r.ts > after.ts || (r.ts === after.ts && String(r.record.id) > after.id);
      })
      .slice(0, limit);
    const last = sorted.at(-1);
    return {
      rows: sorted.map((r) => structuredClone(r.record)),
      cursor: last ? { ts: last.ts, id: String(last.record.id) } : null,
    };
  }

  get(table: TableName, id: string) {
    return this.rows.get(`${table}/${id}`)?.record;
  }
}

function cmp(a: unknown, b: unknown): number {
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
