import { authenticateUser, routeErrorResponse, RouteError } from "@/server/auth";
import { googleHealthConfig } from "@/server/google-health";

/** Feature flag + connection state for Settings. */
export async function GET(request: Request): Promise<Response> {
  if (!googleHealthConfig()) return Response.json({ ok: true, available: false, connected: false });
  try {
    const { client } = await authenticateUser(request);
    const { data } = await client
      .from("health_connections")
      .select("connected_at, last_sync_at")
      .eq("provider", "google_health")
      .maybeSingle();
    return Response.json({
      ok: true,
      available: true,
      connected: !!data,
      lastSyncAt: data?.last_sync_at ?? null,
    });
  } catch (error) {
    if (error instanceof RouteError && error.code === "signed_out") {
      return Response.json({ ok: true, available: true, connected: false, signedOut: true });
    }
    return routeErrorResponse(error);
  }
}
