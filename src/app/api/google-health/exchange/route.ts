import { z } from "zod";
import { authenticateUser, routeErrorResponse, RouteError } from "@/server/auth";
import {
  exchangeCode,
  GOOGLE_HEALTH_SCOPES,
  googleHealthConfig,
  verifyState,
} from "@/server/google-health";

const body = z.object({ code: z.string().min(1).max(2000), state: z.string().min(1).max(2000) });

/** Completes the OAuth round trip: verifies state, stores the refresh token. */
export async function POST(request: Request): Promise<Response> {
  try {
    const cfg = googleHealthConfig();
    if (!cfg)
      throw new RouteError(404, "disabled", "Google Health isn't enabled on this deployment.");
    const { client, userId } = await authenticateUser(request);
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new RouteError(400, "bad_request", "Missing code or state.");
    if (!verifyState(parsed.data.state, userId, cfg.clientSecret)) {
      throw new RouteError(
        400,
        "bad_state",
        "The connection link expired or belongs to another account. Try again.",
      );
    }
    const tokens = await exchangeCode(cfg, parsed.data.code, new URL(request.url).origin).catch(
      () => {
        throw new RouteError(
          502,
          "exchange_failed",
          "Google didn't accept the sign-in. Try connecting again.",
        );
      },
    );
    if (!tokens.refresh_token)
      throw new RouteError(
        502,
        "no_refresh_token",
        "Google didn't grant offline access. Try again.",
      );
    const granted = (tokens.scope ?? "").split(" ");
    if (!GOOGLE_HEALTH_SCOPES.every((s) => granted.includes(s))) {
      throw new RouteError(400, "scopes", "Allow access to sleep and health metrics to connect.");
    }
    const { error } = await client.from("health_connections").upsert({
      user_id: userId,
      provider: "google_health",
      refresh_token: tokens.refresh_token,
      scope: tokens.scope ?? "",
      connected_at: new Date().toISOString(),
    });
    if (error) throw new RouteError(500, "store_failed", "Couldn't save the connection.");
    return Response.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
