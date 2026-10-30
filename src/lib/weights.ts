/** Parsing and display for an equipment's exact weight list (e.g. a dumbbell rack). */

export type WeightsParse = { ok: true; weights: number[] | null } | { ok: false; error: string };

/**
 * "2, 4, 6, 8" → [2, 4, 6, 8]. Commas, semicolons and spaces separate values
 * (so decimals use a point: 2.5), an optional "kg" is ignored, and the result
 * is sorted without repeats. Empty input means "no list".
 */
export function parseWeights(text: string): WeightsParse {
  const normalized = text.toLowerCase().replace(/kg/g, " ");
  if (!normalized.trim()) return { ok: true, weights: null };
  const parts = normalized.split(/[,;\s]+/).filter(Boolean);
  const weights: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n) || n <= 0) {
      return {
        ok: false,
        error: `"${part}" isn't a weight. Use numbers like 2, 4, 6, 8 (decimals with a point: 2.5).`,
      };
    }
    weights.push(Math.round(n * 100) / 100);
  }
  return { ok: true, weights: [...new Set(weights)].sort((a, b) => a - b) };
}

export function formatWeights(weights: readonly number[] | null | undefined): string {
  return weights && weights.length > 0 ? weights.join(", ") : "";
}
