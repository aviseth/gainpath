import type { EquipmentType } from "@/data/schema";

/**
 * Machine registration without the LLM (ALGORITHMS §13): normalise the typed
 * name, then fuzzy-match against the keyword dictionary. Only a miss (or the
 * user tapping "Ask AI") reaches the LLM, and its answer is cached into the
 * user's local dictionary so the same name never calls again.
 */

export interface DictionaryEntry {
  keywords: string[];
  exercise_ids: string[];
  equipment_type: EquipmentType;
}

export interface MachineMatch {
  entry: DictionaryEntry;
  keyword: string;
  score: number;
}

export function normaliseMachineName(name: string, brands: readonly string[]): string {
  let text = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  // Longest brands first so "life fitness" goes before "life".
  for (const brand of [...brands].sort((a, b) => b.length - a.length)) {
    const b = brand
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (b) text = text.replaceAll(` ${b} `, " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

const tokens = (s: string) => s.split(" ").filter(Boolean);

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenMatches(nameToken: string, keywordToken: string): boolean {
  if (nameToken === keywordToken) return true;
  // Abbreviations: "ext" ~ "extension", "lat" ~ "lats".
  const [short, long] =
    nameToken.length < keywordToken.length ? [nameToken, keywordToken] : [keywordToken, nameToken];
  if (short.length >= 3 && long.startsWith(short)) return true;
  // Typos in longer words: "extention" ~ "extension".
  return short.length >= 5 && editDistanceAtMostOne(nameToken, keywordToken);
}

/** Token-set similarity: fraction of the keyword's tokens present in the name (0–1). */
export function keywordScore(normalisedName: string, keyword: string): number {
  const kw = keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!kw) return 0;
  if (` ${normalisedName} `.includes(` ${kw} `)) return 1;
  const nameTokens = tokens(normalisedName);
  const kwTokens = tokens(kw);
  const matched = kwTokens.filter((k) => nameTokens.some((n) => tokenMatches(n, k))).length;
  return matched / kwTokens.length;
}

/**
 * Best-matching dictionary entries, highest score first (ties: longer keyword).
 * Entries from the user's local dictionary should be passed first so they win ties.
 */
export function matchMachine(
  name: string,
  dictionary: readonly DictionaryEntry[],
  brands: readonly string[],
  threshold: number,
): MachineMatch[] {
  const normalised = normaliseMachineName(name, brands);
  if (!normalised) return [];
  const matches: MachineMatch[] = [];
  for (const entry of dictionary) {
    let best: { keyword: string; score: number } | null = null;
    for (const keyword of entry.keywords) {
      const score = keywordScore(normalised, keyword);
      if (
        !best ||
        score > best.score ||
        (score === best.score && keyword.length > best.keyword.length)
      ) {
        best = { keyword, score };
      }
    }
    if (best && best.score >= threshold) matches.push({ entry, ...best });
  }
  return matches.sort((a, b) => b.score - a.score || b.keyword.length - a.keyword.length);
}

/** Exercise ids proposed for a machine name: the best match's, plus any tied runners-up. */
export function proposeExercises(matches: readonly MachineMatch[]): string[] {
  if (matches.length === 0) return [];
  const top = matches[0];
  const tied = matches.filter(
    (m) => m.score === top.score && m.keyword.length === top.keyword.length,
  );
  return [...new Set(tied.flatMap((m) => m.entry.exercise_ids))];
}
