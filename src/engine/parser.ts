import type { Config } from "./config";

/**
 * Free-text set logging without the LLM (ALGORITHMS §17). Case-insensitive,
 * "kg" optional, and x / × / * / for / of interchangeable.
 */

export interface ParsedSet {
  weightKg: number | null;
  reps: number;
  rpe: number | null;
}

export interface ParsedLog {
  exerciseId: string | null;
  exerciseScore: number;
  sets: ParsedSet[];
  approximate: boolean;
  confidence: "high" | "low";
  issues: string[];
}

export interface ExerciseRef {
  id: string;
  name: string;
  aliases?: readonly string[];
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const num = (s: string) => Number(s.replace(",", "."));

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

/** Fraction of the query's words found in the exercise name or an alias (best of them). */
export function exerciseScore(query: string, ref: ExerciseRef): number {
  const q = words(query);
  if (q.length === 0) return 0;
  let best = 0;
  for (const label of [ref.name, ...(ref.aliases ?? [])]) {
    const l = words(label);
    const hit = q.filter((t) => l.some((w) => tokenMatches(t, w))).length;
    best = Math.max(best, hit / q.length);
  }
  return best;
}

/** Today's session first, then everything at the gym (§17). */
export function matchExercise(
  query: string,
  session: readonly ExerciseRef[],
  gym: readonly ExerciseRef[],
): { id: string; score: number } | null {
  for (const list of [session, gym]) {
    let best: { id: string; score: number; len: number } | null = null;
    for (const ref of list) {
      const score = exerciseScore(query, ref);
      if (
        score > 0 &&
        (!best || score > best.score || (score === best.score && ref.name.length < best.len))
      ) {
        best = { id: ref.id, score, len: ref.name.length };
      }
    }
    if (best && best.score >= 0.75) return { id: best.id, score: best.score };
    if (list === gym && best) return { id: best.id, score: best.score };
  }
  return null;
}

/** An `@ n` / `rpe n` value is an RPE when it fits the 6–10 scale, otherwise a weight. */
const looksLikeRpe = (n: number) => n >= 1 && n <= 10;

export function parseLog(
  input: string,
  context: {
    sessionExercises?: readonly ExerciseRef[];
    gymExercises?: readonly ExerciseRef[];
    /** Exercise the user is currently logging, used when the text names none. */
    currentExerciseId?: string | null;
  },
  cfg: Config,
): ParsedLog {
  const issues: string[] = [];
  let text = ` ${input.toLowerCase().replace(/[×*]/g, " x ")} `;

  // Effort hints apply to the last set.
  let hintRpe: number | null = null;
  if (/\b(fail(ed)?|failure|missed)\b/.test(text)) hintRpe = 10;
  else if (/\bgrind(y|ed)?\b/.test(text)) hintRpe = cfg.rpeGrind;
  else if (/\beasy\b/.test(text)) hintRpe = cfg.rpeEasy;
  text = text.replace(
    /\b(the\s+)?last\s+(one|set)\s+(was\s+)?(a\s+)?(grind(y|ed)?|easy|fail(ed)?)\b/g,
    " ",
  );
  text = text.replace(/\b(fail(ed)?|failure|missed|grind(y|ed)?|easy)\b/g, " ");

  // Approximate weights: "~80", "about 80".
  const approximate = /~|\b(about|approx(imately)?|around|roughly)\b/.test(text);
  text = text.replace(/~|\b(about|approx(imately)?|around|roughly)\b/g, " ");
  text = text
    .replace(/\bkgs?\b|(?<=\d)kgs?\b/g, " kg ")
    .replace(/\s+/g, " ")
    .trim();

  // Leading words before the first number name the exercise ("bench 80x8").
  const firstDigit = text.search(/\d/);
  const name = (firstDigit === -1 ? text : text.slice(0, firstDigit))
    .replace(/\b(rpe|at|of|for|x)\b/g, " ")
    .trim();
  let body = firstDigit === -1 ? "" : text.slice(firstDigit).trim();
  body = body
    .replace(/\bkg\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let sets: ParsedSet[] = [];
  let trailingRpe: number | null = null;
  const rpeTail = body.match(new RegExp(String.raw`\s*(?:@\s*rpe|rpe|@)\s*${NUM}$`));

  // "3x8 @ 80", "3 sets of 8 at 80", "80x8@9": a x b followed by @/at/rpe c.
  const triple = body.match(
    new RegExp(
      String.raw`^${NUM}\s*(?:sets?\s*(?:of|x)?|x|for)\s*${NUM}\s*(?:reps?)?\s*(@|at|rpe)\s*${NUM}(?:\s*(?:@|rpe)\s*${NUM})?$`,
    ),
  );
  const pair = body.match(new RegExp(String.raw`^${NUM}\s*(?:x|for|of)\s*${NUM}\s*(?:reps?)?$`));
  const list = body.match(new RegExp(String.raw`^${NUM}\s*(?:x|for)?\s*((?:\d+\s*[, ]\s*)+\d+)$`));

  if (triple) {
    const [a, b, sep, c, d] = [
      num(triple[1]),
      num(triple[2]),
      triple[3],
      num(triple[4]),
      triple[5],
    ];
    const isSetsForm =
      sep !== "rpe" &&
      (/\bsets?\b/.test(body) || sep === "at" || !looksLikeRpe(c) || d !== undefined);
    if (isSetsForm) {
      // sets × reps @ weight [@ rpe]
      const rpe = d !== undefined ? num(d) : null;
      sets = Array.from({ length: Math.min(a, 20) }, () => ({ weightKg: c, reps: b, rpe }));
    } else {
      // weight × reps @ rpe
      sets = [{ weightKg: a, reps: b, rpe: c }];
    }
  } else if (pair) {
    const [a, b] = [num(pair[1]), num(pair[2])];
    // "3x8" / "5x5" read as sets × reps (weight unknown → low confidence); "80x8" as weight × reps.
    if (/\bsets?\b/.test(body) || (a <= 6 && !/\bfor\b/.test(body))) {
      sets = Array.from({ length: Math.min(a, 20) }, () => ({
        weightKg: null,
        reps: b,
        rpe: null,
      }));
      issues.push("weight missing");
    } else {
      sets = [{ weightKg: a, reps: b, rpe: null }];
    }
  } else if (
    rpeTail &&
    body.slice(0, rpeTail.index).match(new RegExp(String.raw`^${NUM}\s*(?:x|for)\s*${NUM}$`))
  ) {
    const m = body
      .slice(0, rpeTail.index)
      .match(new RegExp(String.raw`^${NUM}\s*(?:x|for)\s*${NUM}$`))!;
    trailingRpe = num(rpeTail[1]);
    sets = [{ weightKg: num(m[1]), reps: num(m[2]), rpe: trailingRpe }];
  } else if (list) {
    // "80kg 8 8 7", "80 x 8, 8, 7"
    const reps = list[2]
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    sets = reps.map((r) => ({ weightKg: num(list[1]), reps: r, rpe: null }));
  } else if (body) {
    issues.push("couldn't read the numbers");
  } else {
    issues.push("no sets found");
  }

  for (const s of sets) {
    if (s.rpe !== null && (s.rpe < 6 || s.rpe > 10)) {
      issues.push(`RPE ${s.rpe} is outside 6–10`);
      s.rpe = Math.min(10, Math.max(6, s.rpe));
    }
    if (s.reps <= 0 || !Number.isInteger(s.reps)) issues.push("reps must be a whole number");
  }
  if (hintRpe !== null && sets.length > 0) sets[sets.length - 1].rpe = hintRpe;

  let exerciseId: string | null = null;
  let score = 0;
  if (name) {
    const match = matchExercise(name, context.sessionExercises ?? [], context.gymExercises ?? []);
    if (match) {
      exerciseId = match.id;
      score = match.score;
    } else {
      issues.push(`no exercise matches "${name}"`);
    }
  } else if (context.currentExerciseId) {
    exerciseId = context.currentExerciseId;
    score = 1;
  } else {
    issues.push("which exercise?");
  }

  const complete = sets.length > 0 && sets.every((s) => s.weightKg !== null && s.reps > 0);
  const confidence =
    complete && exerciseId !== null && score >= 0.75 && issues.length === 0 ? "high" : "low";
  return { exerciseId, exerciseScore: score, sets, approximate, confidence, issues };
}
