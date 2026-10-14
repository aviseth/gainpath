import { parseLogRequest, parseLogResult } from "@/lib/ai-schemas";
import { aiRoute, MODELS, structuredCall } from "@/server/ai";

/** Free-text set log the deterministic parser (ALGORITHMS §17) couldn't read. */
export const POST = aiRoute(parseLogRequest, async ({ body, anthropic }) => {
  return structuredCall(anthropic, {
    model: MODELS.fast,
    effort: "low",
    maxTokens: 1500,
    instructions: `Turn the user's gym log note into sets. Pick exercise_id only from the list below; use null if none clearly fits.
Copy numbers exactly from the note. Weights in kg (convert lb × 0.4536). "3x8 @ 60" is three sets of 8 reps at 60 kg. RPE only if stated (RIR r → RPE 10 − r). Never fill in missing numbers: if the note has no reps, return no sets.`,
    context: `Exercises:\n${body.exercises.map((e) => `${e.id}\t${e.name}`).join("\n")}`,
    user: body.text,
    schema: parseLogResult,
  });
});
