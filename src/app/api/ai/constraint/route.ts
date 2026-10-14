import { constraintRequest, constraintResult } from "@/lib/ai-schemas";
import { aiRoute, MODELS, structuredCall } from "@/server/ai";

/**
 * Free-text constraint ("all the cable stations are taken") the keyword matcher
 * couldn't map. Returns equipment to exclude today; the swap engine does the rest.
 */
export const POST = aiRoute(constraintRequest, async ({ body, anthropic }) => {
  const result = await structuredCall(anthropic, {
    model: MODELS.fast,
    effort: "low",
    maxTokens: 1500,
    instructions: `The user says some equipment in their gym is unavailable right now. Return the IDs of the equipment from the list below that their message refers to. Only IDs from the list. If nothing matches, return an empty list.`,
    context: `Equipment (id, name, type, status):\n${body.equipment.map((e) => `${e.id}\t${e.name}\t${e.type}\t${e.status}`).join("\n")}`,
    user: body.text,
    schema: constraintResult,
  });
  const known = new Set(body.equipment.map((e) => e.id));
  return { equipment_ids: result.equipment_ids.filter((id) => known.has(id)) };
});
