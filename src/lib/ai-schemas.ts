import { z } from "zod";
import { equipmentTypeSchema, movementPatternSchema, muscleSchema } from "@/data/schema";

/**
 * Zod schemas shared by the AI routes (structured output) and the client
 * (validation before anything is shown or saved). The engine still checks
 * every result against local data: unknown IDs are dropped.
 */

const id = z.string().min(1).max(64);
const name = z.string().min(1).max(120);

// ---- parse-log --------------------------------------------------------------

export const parseLogRequest = z.object({
  text: z.string().min(1).max(500),
  exercises: z.array(z.object({ id, name })).max(1000),
});

export const parsedSetSchema = z.object({
  weightKg: z.number().min(0).max(1000).nullable(),
  reps: z.number().int().min(1).max(300),
  rpe: z.number().min(1).max(10).nullable(),
});

// Output schemas stay free of numeric bounds (structured outputs don't support
// them); the client re-validates with the bounded schemas above.
export const parseLogResult = z.object({
  exercise_id: z.string().nullable().describe("ID from the list, or null if none fits"),
  sets: z.array(
    z.object({
      weightKg: z.number().nullable().describe("kg; convert lb with 0.4536; null for bodyweight"),
      reps: z.number().int().describe("reps, or seconds for timed holds"),
      rpe: z.number().nullable(),
    }),
  ),
});
export type ParseLogResult = z.infer<typeof parseLogResult>;

// ---- constraint -------------------------------------------------------------

export const constraintRequest = z.object({
  text: z.string().min(1).max(500),
  equipment: z
    .array(z.object({ id, name, type: z.string().max(40), status: z.string().max(20) }))
    .max(1000),
});

export const constraintResult = z.object({
  equipment_ids: z.array(z.string()).describe("IDs from the list that are unavailable today"),
});
export type ConstraintResult = z.infer<typeof constraintResult>;

// ---- machine registration (M6) ----------------------------------------------

export const machineRequest = z
  .object({
    name: z.string().max(200).optional(),
    /** Base64 JPEG/PNG/WebP, no data: prefix. Kept small by the client (≤ 1.5 MB). */
    photo: z.string().max(2_000_000).optional(),
    photo_type: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
    catalog: z.array(z.object({ id, name, pattern: z.string().max(40) })).max(1000),
  })
  .refine((b) => b.name?.trim() || b.photo, { message: "name or photo required" });

export const machineProposal = z.object({
  recognised: z.boolean().describe("false if this isn't gym equipment or can't be identified"),
  equipment_name: z.string().describe("Short descriptive name, e.g. 'Seated leg curl'"),
  equipment_type: equipmentTypeSchema,
  brand: z.string().nullable(),
  model: z.string().nullable().describe("Model number only if legible or stated; never guess"),
  exercises: z.array(
    z.object({
      catalog_id: z
        .string()
        .nullable()
        .describe("ID from the catalogue, or null for a new exercise"),
      name: z.string(),
      pattern: movementPatternSchema,
      primary_muscles: z.array(muscleSchema),
      secondary_muscles: z.array(muscleSchema),
    }),
  ),
  notes: z.string().nullable().describe("Setup tips visible on the placard, if any"),
});
export type MachineProposal = z.infer<typeof machineProposal>;

// ---- weekly review ------------------------------------------------------------

export const reviewRequest = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Engine-computed summary; the AI only narrates it. */
  summary: z.record(z.string(), z.unknown()),
});

export const reviewResult = z.object({
  headline: z.string(),
  paragraphs: z.array(z.string()),
  suggestions: z.array(z.string()),
  rule_ids: z.array(z.string()),
});
export type ReviewResult = z.infer<typeof reviewResult>;

// ---- chat -------------------------------------------------------------------

const textBlock = z.object({ type: z.literal("text"), text: z.string().max(8000) }).loose();
const toolUseBlock = z
  .object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown() })
  .loose();
const toolResultBlock = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.string().max(20000),
  is_error: z.boolean().optional(),
});
// Thinking blocks go back verbatim (signature included) so the history stays append-only.
const thinkingBlock = z
  .object({ type: z.literal("thinking"), thinking: z.string(), signature: z.string() })
  .loose();
const redactedThinkingBlock = z
  .object({ type: z.literal("redacted_thinking"), data: z.string() })
  .loose();

export const chatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([
    z.string().max(4000),
    z
      .array(
        z.union([textBlock, toolUseBlock, toolResultBlock, thinkingBlock, redactedThinkingBlock]),
      )
      .max(40),
  ]),
});
export type ChatMessage = z.infer<typeof chatMessage>;

export const chatRequest = z.object({
  messages: z.array(chatMessage).min(1).max(60),
});

/** Tool round trips allowed per question before another call is counted. */
export const FREE_TOOL_ROUNDS = 4;

/**
 * Whether a chat call counts toward the daily limit. A question counts once;
 * calls that only return tool results continue it, up to FREE_TOOL_ROUNDS.
 */
export function chatCallCounts(messages: readonly ChatMessage[]): boolean {
  const isToolResults = (m: ChatMessage) =>
    m.role === "user" &&
    Array.isArray(m.content) &&
    m.content.length > 0 &&
    m.content.every((b) => b.type === "tool_result");
  if (!isToolResults(messages[messages.length - 1])) return true;
  let rounds = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (!isToolResults(m)) break;
    rounds++;
  }
  return rounds > FREE_TOOL_ROUNDS;
}

export interface ChatResult {
  content: Array<Record<string, unknown> & { type: string }>;
  stop_reason: string | null;
}

/** Tool inputs, validated on the client before the engine runs them. */
export const chatToolInputs = {
  get_available_equipment: z.object({}),
  get_recovery_state: z.object({}),
  get_readiness: z.object({}),
  find_substitutes: z.object({ exercise_name: z.string().min(1).max(120) }),
  exclude_equipment_today: z.object({ equipment_ids: z.array(z.string()).min(1).max(50) }),
} as const;
export type ChatToolName = keyof typeof chatToolInputs;
