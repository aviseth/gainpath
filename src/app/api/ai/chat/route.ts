import type Anthropic from "@anthropic-ai/sdk";
import { chatCallCounts, chatRequest, type ChatResult } from "@/lib/ai-schemas";
import { aiRoute, BASE_SYSTEM, checkStop, MODELS } from "@/server/ai";

/**
 * "Ask Liftwise" chat. The engine and the user's data live on the device, so
 * the tools run there: this route makes one model call and returns the
 * content; the client executes any tool_use blocks locally and calls again
 * with the results. System prompt and tools never change between calls, and
 * the client sends history back verbatim, so caching and thinking carry over.
 */
const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_available_equipment",
    description:
      "List the equipment at the user's current gym that is usable today (active and not excluded).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "get_recovery_state",
    description:
      "Per-muscle recovery (0-1) and this week's volume against target, from the app's engine.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "get_readiness",
    description:
      "Today's readiness score and its inputs (check-in, wearable data) from the app's engine.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "find_substitutes",
    description:
      "Run the app's swap engine for an exercise: returns ranked substitutes available at this gym with match percentages and loads.",
    input_schema: {
      type: "object",
      properties: {
        exercise_name: { type: "string", description: "Exercise name as the user said it" },
      },
      required: ["exercise_name"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "exclude_equipment_today",
    description:
      "Mark equipment unavailable for today only, so today's plan and swaps avoid it. Use IDs from get_available_equipment. Only when the user asks for it.",
    input_schema: {
      type: "object",
      properties: { equipment_ids: { type: "array", items: { type: "string" } } },
      required: ["equipment_ids"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const SYSTEM: Anthropic.TextBlockParam[] = [
  { type: "text", text: BASE_SYSTEM },
  {
    type: "text",
    text: `You are answering questions in the app's "Ask Liftwise" chat.
Use the tools to get any numbers about the user's training; quote them as returned. If a tool can't answer, say what you don't know.
The app plans sessions itself; you explain it and can exclude equipment for today when asked. You can't edit plans, loads or history.`,
    cache_control: { type: "ephemeral" },
  },
];

export const POST = aiRoute(
  chatRequest,
  async ({ body, anthropic }): Promise<ChatResult> => {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 4000,
      system: SYSTEM,
      tools: TOOLS,
      // Caches the conversation so far; each turn reads the previous turn's prefix.
      cache_control: { type: "ephemeral" },
      messages: body.messages as Anthropic.MessageParam[],
    });
    checkStop(response);
    return {
      content: response.content as unknown as ChatResult["content"],
      stop_reason: response.stop_reason,
    };
  },
  (body) => chatCallCounts(body.messages),
);
