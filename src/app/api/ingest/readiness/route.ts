import { z } from "zod";
import { stableUuid } from "@/lib/stable-uuid";
import { authenticateUser, routeErrorResponse, RouteError } from "@/server/auth";

/**
 * POST /api/ingest/readiness — for a future Android companion that reads
 * Health Connect (Samsung Health has no web API). Authenticate with the
 * user's Supabase access token as a bearer header. Rows are written through
 * sync_push, so they reach every device on its next pull. One row per date:
 * posting the same date again replaces it. See docs/samsung-health.md.
 */
const day = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hrv_ms: z.number().positive().max(500).nullable().optional(),
    resting_hr: z.number().positive().max(250).nullable().optional(),
    sleep_hours: z.number().min(0).max(24).nullable().optional(),
  })
  .refine((d) => d.hrv_ms != null || d.resting_hr != null || d.sleep_hours != null, {
    message: "each day needs at least one of hrv_ms, resting_hr, sleep_hours",
  });
const body = z.object({ days: z.array(day).min(1).max(31) });

export async function POST(request: Request): Promise<Response> {
  try {
    const { client, userId } = await authenticateUser(request);
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new RouteError(400, "bad_request", z.prettifyError(parsed.error));
    const now = Date.now();
    const rows = parsed.data.days.map((d) => ({
      id: stableUuid(`ingest:${userId}:${d.date}`),
      created_at: now,
      updated_at: now,
      deleted_at: null,
      date: d.date,
      source: "ingest",
      hrv_ms: d.hrv_ms ?? null,
      resting_hr: d.resting_hr ?? null,
      sleep_hours: d.sleep_hours ?? null,
    }));
    const { data, error } = await client.rpc("sync_push", {
      p_table: "wearable_daily",
      p_rows: rows,
    });
    if (error) throw new RouteError(500, "store_failed", "Couldn't store the readings.");
    return Response.json({ ok: true, stored: data });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
