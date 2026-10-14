import { reviewRequest, reviewResult } from "@/lib/ai-schemas";
import { aiRoute, MODELS, structuredCall } from "@/server/ai";

/**
 * Weekly narrative review. The engine computes every number; the model only
 * explains them. The client caches the result per week (≤ 1 call a week).
 */
export const POST = aiRoute(reviewRequest, async ({ body, anthropic }) => {
  return structuredCall(anthropic, {
    model: MODELS.deep,
    effort: "medium",
    maxTokens: 6000,
    instructions: `Write a short weekly training review from the engine summary the user sends (JSON).
- Use only numbers that appear in the summary. Don't compute new ones.
- headline: one sentence. paragraphs: 2-4 short paragraphs on volume vs targets, strength trends, recovery/readiness, and adherence. suggestions: up to 3 concrete next-week actions the app supports (e.g. swap, adjust sessions per week, deload) and say which rule each follows.
- rule_ids: the app rule IDs you relied on (e.g. VOL-1, PROG-1, DELOAD-1, REC-1, READY-1).`,
    user: `Week starting ${body.week_start}. Engine summary:\n${JSON.stringify(body.summary)}`,
    schema: reviewResult,
  });
});
