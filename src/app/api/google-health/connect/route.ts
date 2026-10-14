import { authenticateUser, routeErrorResponse, RouteError } from "@/server/auth";
import { authUrl, googleHealthConfig, signState } from "@/server/google-health";

/** Returns the Google consent URL; the client navigates to it. */
export async function POST(request: Request): Promise<Response> {
  try {
    const cfg = googleHealthConfig();
    if (!cfg)
      throw new RouteError(404, "disabled", "Google Health isn't enabled on this deployment.");
    const { userId } = await authenticateUser(request);
    const origin = new URL(request.url).origin;
    return Response.json({
      ok: true,
      url: authUrl(cfg.clientId, origin, signState(userId, cfg.clientSecret)),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
