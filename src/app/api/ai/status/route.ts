import { connection } from "next/server";
import { aiConfigured, authenticate, dailyLimit, errorResponse, usedToday } from "@/server/ai";

/** Whether AI is available to this user, and today's usage (settings counter). */
export async function GET(request: Request): Promise<Response> {
  // Per request: reads env and the caller's token (never prerender).
  await connection();
  if (!aiConfigured())
    return Response.json({ ok: true, enabled: false, reason: "not_configured", used: 0, limit: 0 });
  try {
    const client = await authenticate(request);
    const limit = dailyLimit(Number(new URL(request.url).searchParams.get("limit") ?? NaN));
    return Response.json({ ok: true, enabled: true, used: await usedToday(client), limit });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "signed_out") {
      return Response.json({ ok: true, enabled: false, reason: "signed_out", used: 0, limit: 0 });
    }
    return errorResponse(error);
  }
}
