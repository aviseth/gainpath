import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordOf, TableName } from "@/data/schema";
import type { PullCursor, PullPage, SyncRemote } from "./remote";

/** SyncRemote backed by the `sync_push` RPC and RLS-protected table reads (supabase/migrations). */
export function supabaseRemote(client: SupabaseClient): SyncRemote {
  return {
    async push<T extends TableName>(table: T, records: RecordOf<T>[]) {
      const { error } = await client.rpc("sync_push", { p_table: table, p_rows: records });
      if (error) throw new Error(`push ${table}: ${error.message}`);
    },

    async pull(table: TableName, after: PullCursor | null, limit: number): Promise<PullPage> {
      let query = client
        .from(table)
        .select("*")
        .order("server_updated_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit);
      if (after && after.id === "") {
        query = query.gte("server_updated_at", after.ts);
      } else if (after) {
        // Timestamps contain PostgREST-reserved characters (":" and "."), so quote them.
        query = query.or(
          `server_updated_at.gt."${after.ts}",and(server_updated_at.eq."${after.ts}",id.gt.${after.id})`,
        );
      }
      const { data, error } = await query;
      if (error) throw new Error(`pull ${table}: ${error.message}`);
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const last = rows.at(-1);
      return {
        rows: rows.map(({ server_updated_at: _ts, ...row }) => row),
        cursor: last ? { ts: String(last.server_updated_at), id: String(last.id) } : null,
      };
    },
  };
}
