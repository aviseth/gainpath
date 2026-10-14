import type { EquipmentType } from "@/data/schema";
import type { Equipment } from "./types";

/**
 * Free-text constraints ("all the cable stations are taken") → equipment to
 * exclude today, without the LLM (ALGORITHMS §18: the LLM is only used if
 * this keyword matcher finds nothing).
 */

const TYPE_WORDS: ReadonlyArray<[RegExp, EquipmentType[]]> = [
  [/\b(cables?|pulleys?|crossovers?|functional trainers?|cable stations?)\b/, ["cable_station"]],
  [/\bplate[- ]?loaded\b/, ["plate_loaded"]],
  [/\b(selectori[sz]ed|stack machines?|pin machines?)\b/, ["selectorized"]],
  [/\b(all|every|the) machines\b/, ["selectorized", "plate_loaded"]],
  [/\b(dumbbells?|dbs|free weights?|barbells?|plates?)\b/, ["free_weights"]],
  [/\b(benches|bench|racks?|squat racks?|power racks?)\b/, ["bench_rack"]],
  [/\b(dip station|pull[- ]?up bar|dip bars?)\b/, ["bodyweight_station"]],
];

const STOP = new Set([
  "machine",
  "machines",
  "station",
  "selection",
  "plate",
  "loaded",
  "with",
  "from",
  "the",
  "and",
  "seated",
  "standing",
]);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w));

/** Words that negate availability; without them the text isn't a constraint we understand. */
const UNAVAILABLE =
  /\b(taken|busy|occupied|in use|broken|out of order|closed|unavailable|full|queue|waiting|no free|not free|being used|someone)\b/;

export interface ConstraintMatch {
  equipmentIds: string[];
  /** Which words matched, for the confirmation message. */
  matched: string[];
}

export function matchConstraint(text: string, equipment: readonly Equipment[]): ConstraintMatch {
  const t = ` ${text.toLowerCase()} `;
  if (!UNAVAILABLE.test(t)) return { equipmentIds: [], matched: [] };
  const ids = new Set<string>();
  const matched: string[] = [];

  for (const [pattern, types] of TYPE_WORDS) {
    const m = t.match(pattern);
    if (!m) continue;
    const hits = equipment.filter((e) => types.includes(e.type));
    if (hits.length > 0) matched.push(m[0].trim());
    for (const e of hits) ids.add(e.id);
  }
  // Specific machines named in the text ("the leg press is taken").
  const textWords = new Set(words(text));
  for (const e of equipment) {
    const nameWords = words(e.name);
    const hits = nameWords.filter(
      (w) => textWords.has(w) || textWords.has(w.replace(/s$/, "")) || textWords.has(`${w}s`),
    );
    // Require most of the distinctive name words, so "press" alone doesn't match every press.
    if (hits.length > 0 && hits.length >= Math.min(2, nameWords.length)) {
      ids.add(e.id);
      matched.push(e.name);
    }
  }
  return { equipmentIds: [...ids], matched: [...new Set(matched)] };
}
