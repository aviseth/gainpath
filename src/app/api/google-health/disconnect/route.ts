import { authenticateUser, routeErrorResponse } from "@/server/auth";
import { revokeToken } from "@/server/google-health";

/** Revokes the Google token and forgets it. Synced wearable rows stay. */
export async function POST(request: Request): Promise<Response> {
  try {
    const { client } = await authenticateUser(request);
    const { data } = await client
      .from("health_connections")
      .select("refresh_token")
      .eq("provider", "google_health")
      .maybeSingle();
    if (data?.refresh_token) await revokeToken(data.refresh_token);
    await client.from("health_connections").delete().eq("provider", "google_health");
    return Response.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
