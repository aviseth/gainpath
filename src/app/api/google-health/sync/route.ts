import { z } from "zod";
import { authenticateUser, routeErrorResponse, RouteError } from "@/server/auth";
import { fetchDaily, googleHealthConfig, refreshAccessToken } from "@/server/google-health";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const body = z.object({ from: isoDate, to: isoDate });

/**
 * Daily sync: returns one row per date (HRV, resting HR, sleep). The client
 * stores them in wearable_daily, which syncs like any other table.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const cfg = googleHealthConfig();
    if (!cfg)
      throw new RouteError(404, "disabled", "Google Health isn't enabled on this deployment.");
    const { client } = await authenticateUser(request);
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.from >= parsed.data.to)
      throw new RouteError(400, "bad_request", "Bad date range.");
    const { data: connection } = await client
      .from("health_connections")
      .select("refresh_token")
      .eq("provider", "google_health")
      .maybeSingle();
    if (!connection) throw new RouteError(404, "not_connected", "Google Health isn't connected.");

    const tokens = await refreshAccessToken(cfg, connection.refresh_token).catch(() => {
      throw new RouteError(
        401,
        "reconnect",
        "Google Health access expired. Connect again in Settings.",
      );
    });
    const days = await fetchDaily(tokens.access_token!, parsed.data.from, parsed.data.to).catch(
      (e: unknown) => {
        console.error(e);
        throw new RouteError(502, "upstream", "Couldn't read data from Google Health.");
      },
    );
    await client
      .from("health_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("provider", "google_health");
    return Response.json({ ok: true, days });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
