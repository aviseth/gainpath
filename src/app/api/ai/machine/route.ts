import type Anthropic from "@anthropic-ai/sdk";
import { MOVEMENT_PATTERNS, MUSCLES } from "@/data/schema";
import { machineProposal, machineRequest } from "@/lib/ai-schemas";
import { aiRoute, MODELS, structuredCall } from "@/server/ai";

/**
 * Machine photo or unknown name → proposed exercises (ALGORITHMS §18, PROMPT M6).
 * Nothing is saved here: the client shows the proposal and the user confirms.
 */
export const POST = aiRoute(machineRequest, async ({ body, anthropic }) => {
  const content: Anthropic.ContentBlockParam[] = [];
  if (body.photo) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: body.photo_type ?? "image/jpeg", data: body.photo },
    });
  }
  content.push({
    type: "text",
    text: body.name?.trim()
      ? `The machine is labelled or named: "${body.name.trim()}". Identify it.`
      : "Identify this piece of gym equipment.",
  });

  return structuredCall(anthropic, {
    // Vision uses the deeper model; a name alone is a cheap lookup.
    model: body.photo ? MODELS.deep : MODELS.fast,
    effort: body.photo ? "medium" : "low",
    maxTokens: 3000,
    instructions: `Identify a piece of gym equipment and the exercises it supports.
- Read brand and model only from what is visible or stated; otherwise null. Never guess a model number.
- Prefer exercises from the catalogue below (set catalog_id). Use catalog_id null only for a movement the catalogue lacks.
- For each exercise give the movement pattern and the primary and secondary muscles from these lists only.
Movement patterns: ${MOVEMENT_PATTERNS.join(", ")}.
Muscles: ${MUSCLES.join(", ")}.
- If the image isn't gym equipment or you can't tell, set recognised to false and leave exercises empty.`,
    context: `Catalogue (id, name, pattern):\n${body.catalog.map((e) => `${e.id}\t${e.name}\t${e.pattern}`).join("\n")}`,
    user: content,
    schema: machineProposal,
  });
});
