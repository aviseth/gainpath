import { z } from "zod";
import type { LiftwiseDB } from "./db";
import { mergeRecords } from "./merge";
import { getOwnerId, notifyLocalWrite } from "./repo";
import { TABLE_NAMES, tableSchemas, type RecordOf, type TableName } from "./schema";

/** Manual backup (PROMPT.md: Export / Import JSON). */

export const BACKUP_FORMAT = "liftwise-backup";
export const BACKUP_SCHEMA_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  schema_version: number;
  exported_at: number;
  owner_id: string;
  tables: { [T in TableName]?: RecordOf<T>[] };
}

/** Everything the user owns, tombstones included so an import also replays deletions. */
export async function exportBackup(db: LiftwiseDB): Promise<Backup> {
  const tables: Backup["tables"] = {};
  await db.transaction("r", TABLE_NAMES, async () => {
    for (const table of TABLE_NAMES) {
      const rows = await db.table(table).toArray();
      tables[table] = rows.map(({ dirty: _dirty, ...record }) => record) as never;
    }
  });
  return {
    format: BACKUP_FORMAT,
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: Date.now(),
    owner_id: await getOwnerId(db),
    tables,
  };
}

export function backupFileName(backup: Backup): string {
  return `liftwise-backup-${new Date(backup.exported_at).toISOString().slice(0, 10)}.json`;
}

const envelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schema_version: z.number().int().positive().max(BACKUP_SCHEMA_VERSION, {
    message: "this backup comes from a newer version of Liftwise; update the app first",
  }),
  exported_at: z.number(),
  owner_id: z.string(),
  tables: z.record(z.string(), z.array(z.unknown())),
});

export class BackupError extends Error {}

export interface ImportSummary {
  applied: number;
  skipped: number;
}

/**
 * Validate the whole file first and write nothing if any row is invalid, then
 * merge with last-write-wins, so importing the same file twice is a no-op.
 * Imported rows are re-owned to this device's user and marked dirty for sync.
 */
export async function importBackup(db: LiftwiseDB, json: string): Promise<ImportSummary> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupError("That file isn't valid JSON.");
  }
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new BackupError(`Not a Liftwise backup: ${z.prettifyError(envelope.error)}`);
  }

  const owner = await getOwnerId(db);
  const parsed = new Map<TableName, RecordOf<TableName>[]>();
  const problems: string[] = [];
  for (const [table, rows] of Object.entries(envelope.data.tables)) {
    if (!(TABLE_NAMES as string[]).includes(table)) {
      problems.push(`unknown table "${table}"`);
      continue;
    }
    const schema = tableSchemas[table as TableName];
    const valid: RecordOf<TableName>[] = [];
    rows.forEach((row, i) => {
      const result = schema.safeParse(row);
      if (result.success) valid.push({ ...result.data, user_id: owner } as RecordOf<TableName>);
      else problems.push(`${table}[${i}]: ${z.prettifyError(result.error)}`);
    });
    parsed.set(table as TableName, valid);
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 5).join("\n");
    const more = problems.length > 5 ? `\n…and ${problems.length - 5} more` : "";
    throw new BackupError(`Nothing was imported. Invalid rows:\n${shown}${more}`);
  }

  const summary: ImportSummary = { applied: 0, skipped: 0 };
  await db.transaction("rw", [...parsed.keys()], async () => {
    for (const [table, rows] of parsed) {
      const result = await mergeRecords(db, table, rows, "import");
      summary.applied += result.applied;
      summary.skipped += result.skipped;
    }
  });
  for (const table of parsed.keys()) notifyLocalWrite(table);
  return summary;
}
