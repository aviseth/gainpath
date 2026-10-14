import type { GainpathDB } from "./db";
import type { RecordOf, Stored, TableName } from "./schema";

export interface MergeResult {
  applied: number;
  skipped: number;
}

/**
 * Apply records from elsewhere (cloud pull or a JSON import) with
 * last-write-wins on `updated_at` (PLAN.md §2.4). Tombstones merge like any
 * other version, so deletions propagate.
 *
 * - `source: "remote"`: the cloud already has these versions, so applied rows
 *   are clean, and a pulled copy of exactly our pending version clears `dirty`.
 * - `source: "import"`: applied rows are marked dirty so they get pushed.
 */
export async function mergeRecords<T extends TableName>(
  db: GainpathDB,
  table: T,
  records: RecordOf<T>[],
  source: "remote" | "import",
): Promise<MergeResult> {
  const store = db.table<Stored<T>, string>(table);
  const dirty = source === "import" ? 1 : 0;
  return db.transaction("rw", store, async () => {
    const existing = await store.bulkGet(records.map((r) => r.id));
    const writes: Stored<T>[] = [];
    let skipped = 0;
    records.forEach((incoming, i) => {
      const local = existing[i];
      if (!local || incoming.updated_at > local.updated_at) {
        writes.push({ ...incoming, dirty } as Stored<T>);
      } else if (source === "remote" && incoming.updated_at === local.updated_at && local.dirty) {
        writes.push({ ...local, dirty: 0 });
      } else {
        skipped++;
      }
    });
    await store.bulkPut(writes);
    return { applied: writes.length, skipped };
  });
}
