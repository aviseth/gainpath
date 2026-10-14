import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Shared plumbing for the opt-in AI routes (PROMPT "AI layer", ALGORITHMS §18).
 *
 * Every route: verify the Supabase access token, consume one call from the
 * server-enforced daily limit, then make exactly one Anthropic request. The
 * API key never leaves the server.
 */

export const MODELS = {
  /** Parsing, constraints, swaps, in-session changes and chat. */
  fast: "claude-haiku-5-5",
  /** Weekly review and vision. */
  deep: "claude-sonnet-5-5",
} as const;

/** Server-side ceiling. The user's own `aiDailyLimit` setting can only lower it. */
const SERVER_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 20);

export class AiRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let anthropic: Anthropic | null | undefined;

export function getAnthropic(): Anthropic | null {
  if (anthropic !== undefined) return anthropic;
  anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 2 }) : null;
  return anthropic;
}

export function aiConfigured(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** A Supabase client acting as the caller, so RLS and auth.uid() apply. */
export async function authenticate(request: Request): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new AiRouteError(503, "not_configured", "Cloud features aren't configured.");
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new AiRouteError(401, "signed_out", "Sign in to use AI features.");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new AiRouteError(401, "signed_out", "Your session expired. Sign in again.");
  return client;
}

export function dailyLimit(requested: unknown): number {
  const n =
    typeof requested === "number" && Number.isFinite(requested)
      ? Math.floor(requested)
      : SERVER_DAILY_LIMIT;
  return Math.max(0, Math.min(SERVER_DAILY_LIMIT, n));
}

/** Consumes one call. Throws 429 when today's limit is reached. */
export async function consume(client: SupabaseClient, limit: number): Promise<number> {
  const { data, error } = await client.rpc("ai_consume", { p_limit: limit });
  if (error) throw new AiRouteError(500, "usage_failed", "Couldn't check today's AI limit.");
  if (data === -1) throw new AiRouteError(429, "limit", `Today's AI limit (${limit}) is used up.`);
  return data as number;
}

export async function usedToday(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc("ai_used_today");
  if (error) return 0;
  return (data as number) ?? 0;
}

/** Wraps a route body: parses the JSON body with Zod and maps errors to JSON responses. */
export function aiRoute<S extends z.ZodType, R>(
  bodySchema: S,
  handler: (input: {
    body: z.infer<S>;
    client: SupabaseClient;
    anthropic: Anthropic;
    used: number;
  }) => Promise<R>,
  /** Return false for a follow-up call that's part of an already-counted request. */
  counts: (body: z.infer<S>) => boolean = () => true,
) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const anthropicClient = getAnthropic();
      if (!anthropicClient || !aiConfigured()) {
        throw new AiRouteError(503, "not_configured", "AI isn't configured for this deployment.");
      }
      const client = await authenticate(request);
      const json: unknown = await request.json().catch(() => null);
      const parsed = bodySchema.safeParse(json);
      if (!parsed.success)
        throw new AiRouteError(400, "bad_request", z.prettifyError(parsed.error));
      const limit = dailyLimit((json as { limit?: unknown } | null)?.limit);
      const used = counts(parsed.data) ? await consume(client, limit) : await usedToday(client);
      const result = await handler({ body: parsed.data, client, anthropic: anthropicClient, used });
      return Response.json({ ok: true, used, limit, result });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AiRouteError) {
    return Response.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.status },
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return Response.json(
      { ok: false, code: "busy", message: "The AI service is busy. Try again in a minute." },
      { status: 503 },
    );
  }
  if (error instanceof Anthropic.APIError) {
    console.error("anthropic error", error.status, error.message);
    return Response.json(
      { ok: false, code: "upstream", message: "The AI service returned an error." },
      { status: 502 },
    );
  }
  console.error(error);
  return Response.json(
    { ok: false, code: "internal", message: "Something went wrong." },
    { status: 500 },
  );
}

/** Rejects refusals and truncation before anything reads the content. */
export function checkStop(message: { stop_reason: string | null }): void {
  if (message.stop_reason === "refusal") {
    throw new AiRouteError(422, "refused", "The AI declined to answer that.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiRouteError(502, "truncated", "The AI's answer was cut off.");
  }
}

/**
 * The shared system preamble. Kept byte-identical across calls so the prompt
 * cache can reuse it.
 */
export const BASE_SYSTEM = `You are the optional AI helper inside Liftwise, an evidence-based strength training app.
Hard rules:
- Never invent numbers (loads, sets, reps, percentages, volumes). Numbers come only from the user's own words or from the app's engine via tools or the data you are given.
- Only cite studies listed in the app's EVIDENCE.md. Prefer citing the app's rule IDs (e.g. VOL-1, PROG-2, REC-1). Call rules graded H "rules of thumb", not findings.
- You can't diagnose pain or injury. For pain, suggest seeing a doctor or physiotherapist.
- Be brief and concrete. Use plain language.`;

type Effort = "low" | "medium" | "high";

/**
 * One structured-output call. `context` is the large, stable part (the user's
 * equipment or exercise list); it sits after the instructions with a cache
 * breakpoint so repeated calls in a day reuse it.
 */
export async function structuredCall<S extends z.ZodType>(
  anthropic: Anthropic,
  opts: {
    model: (typeof MODELS)[keyof typeof MODELS];
    instructions: string;
    context?: string;
    user: Anthropic.MessageParam["content"];
    schema: S;
    maxTokens?: number;
    effort?: Effort;
  },
): Promise<z.infer<S>> {
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: BASE_SYSTEM },
    { type: "text", text: opts.instructions },
  ];
  if (opts.context) system.push({ type: "text", text: opts.context });
  system[system.length - 1] = {
    ...system[system.length - 1],
    cache_control: { type: "ephemeral" },
  };

  const response = await anthropic.messages.parse({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4000,
    // Haiku can skip thinking for simple extraction; Sonnet 5.5 can't disable it.
    ...(opts.model === MODELS.fast && opts.effort === "low"
      ? { thinking: { type: "disabled" as const } }
      : {}),
    system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: zodOutputFormat(opts.schema), effort: opts.effort ?? "medium" },
  });
  checkStop(response);
  if (response.parsed_output == null) {
    throw new AiRouteError(
      502,
      "invalid_output",
      "The AI returned something the app couldn't read.",
    );
  }
  return response.parsed_output as z.infer<S>;
}
