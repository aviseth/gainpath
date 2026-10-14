import type { RecordOf, TableName } from "@/data/schema";

/**
 * Position in a table's change feed: keyset on (server_updated_at, id) so
 * rows sharing a server timestamp are never skipped between pages.
 * `ts` is the server's timestamp string, passed back verbatim.
 */
export interface PullCursor {
  ts: string;
  id: string;
}

export interface PullPage {
  /** Raw rows (without server_updated_at); the engine validates them. */
  rows: unknown[];
  /** Cursor of the last row in this page, or null if the page is empty. */
  cursor: PullCursor | null;
}

/** The cloud side of sync. Implemented by Supabase in production and by a fake in tests. */
export interface SyncRemote {
  /** Insert or overwrite rows; the server keeps whichever version has the newer `updated_at`. */
  push<T extends TableName>(table: T, records: RecordOf<T>[]): Promise<void>;
  /**
   * Rows with (server_updated_at, id) after `after`, ordered by that key.
   * `after.id === ""` means "from this timestamp inclusive".
   */
  pull(table: TableName, after: PullCursor | null, limit: number): Promise<PullPage>;
}
