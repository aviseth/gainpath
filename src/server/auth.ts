import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Error with an HTTP status and a code the client can switch on. */
export class RouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Verifies the Supabase access token sent as a bearer header and returns a
 * client acting as that user, so RLS and auth.uid() apply.
 */
export async function authenticateUser(
  request: Request,
): Promise<{ client: SupabaseClient; userId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new RouteError(503, "not_configured", "Cloud features aren't configured.");
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new RouteError(401, "signed_out", "Sign in first.");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new RouteError(401, "signed_out", "Your session expired. Sign in again.");
  return { client, userId: data.user.id };
}

export function routeErrorResponse(error: unknown): Response {
  if (error instanceof RouteError) {
    return Response.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.status },
    );
  }
  console.error(error);
  return Response.json(
    { ok: false, code: "internal", message: "Something went wrong." },
    { status: 500 },
  );
}
