# Liftwise — Deterministic Algorithms Spec

Goal: **zero LLM calls in a normal training day.** Everything below runs locally in the browser as pure TypeScript. Each algorithm cites the EVIDENCE.md rule it implements. All constants marked (H) are heuristics: put them in `src/engine/config.ts`, make them editable in Settings → Advanced, and unit-test them.

---

## 0. Shared data structures

```ts
// 16 muscle groups — keep this list fixed; everything is a vector over it.
type Muscle =
  | 'chest' | 'front_delt' | 'side_delt' | 'rear_delt'
  | 'lats' | 'upper_back' | 'biceps' | 'triceps' | 'forearms'
  | 'quads' | 'hamstrings' | 'glutes' | 'adductors' | 'abductors'
  | 'calves' | 'abs';

type MuscleVector = Record<Muscle, number>;   // primary = 1.0, secondary = 0.5 (VOL-2)

interface Exercise {
  id: string; name: string;
  pattern: MovementPattern;                    // horizontal_push, vertical_pull, squat, hinge, ...
  vector: MuscleVector;
  kind: 'compound' | 'isolation';
  equipmentTypes: EquipmentType[];
  fatigueCost: number;                         // (H) systemic cost per set: compound lower-body 1.5, compound upper 1.2, isolation 0.8
  repRange: { strength: [number, number]; hypertrophy: [number, number] };
}

interface SetLog {
  exerciseId: string; equipmentId: string; ts: number;
  weightKg: number; reps: number; rpe: number | null;  // RIR = 10 - RPE (EFF-3)
  isWarmup: boolean;
}
```

Seed data (exercise DB, muscle vectors, patterns, keyword dictionary in §13) is **generated once at development time** by Claude Code and committed as static JSON. It is never generated at runtime.

---

## 1. e1RM estimation (PROG-3)

```
rtf = reps + RIR_adjusted                 // reps to failure
RIR_adjusted = (10 - rpe) + calibrationOffset(user)   // §10
if reps > 10 or rpe == null or rpe < 6: ignore set for e1RM
e1RM_set = weight * (1 + rtf / 30)        // Epley

e1RM(exercise, equipment) =
  max over last 3 sessions of [ max e1RM_set in that session ],
  smoothed: e1RM_new = 0.7 * e1RM_old + 0.3 * session_best   // (H) EWMA α = 0.3
  but if session_best > e1RM_old * 1.10: accept only +5% this update   // (H) outlier guard
```

## 2. Load prescription from targets

```
targetLoad(e1RM, targetReps, targetRIR) = e1RM / (1 + (targetReps + targetRIR) / 30)
roundToEquipment(load, eq) = round DOWN to nearest available step:
   eq.minKg + k * eq.incrementKg  (respect micro-plates if set), clamp to [minKg, maxKg]
```

If the rounded load is >7.5% (H) below the ideal, prescribe the step down and add +1 target rep instead of exceeding target RPE.

## 3. Goal targets (LOAD-1, EFF-1, REST-1)

| | Strength main lift | Strength accessory | Hypertrophy compound | Hypertrophy isolation |
|---|---|---|---|---|
| Reps | 3–6 | 6–10 | 6–12 | 10–15 |
| Target RIR | 2–3 | 1–3 | 1–3 | 0–2 |
| Rest | 180 s | 120 s | 120–150 s | 90 s |

Never rest < 90 s except "time-saver" mode, which states the trade-off (REST-1).

## 4. Readiness score (READY-1..3) — all weights (H)

```
score = 70
score += (sleepQuality - 3) * 6       // check-in 1–5
score += (energy - 3) * 6
if sleepHours known and sleepHours < 6: score -= 10          // READY-1
if hrv known with ≥7 days baseline:
   z = (hrv - mean14) / sd14 ; score += clamp(z, -2, 2) * 4  // READY-2 soft only
if restingHR known: z = (rhr - mean14)/sd14 ; score -= clamp(z, -2, 2) * 3
score = clamp(score, 0, 100)

modifiers:
  ≥ 70  → normal
  50–69 → session volume × 0.85, target RIR +0.5
  < 50  → volume × 0.70, target RIR +1, no load increases today
```

Soreness per muscle (0–3) feeds the fatigue model directly (§5), not this score.

## 5. Per-muscle fatigue / recovery (REC-1, EFF-2) — (H)

```
effortFactor(rpe) = rpe >= 10 ? 1.5 : rpe >= 9 ? 1.2 : rpe >= 8 ? 1.0 : 0.7
halfLifeH(m) = m in {quads, hamstrings, glutes, lats, chest, upper_back} ? 36 : 24

F_m(now) = Σ over non-warmup sets i:
             exercise_i.vector[m] * effortFactor(rpe_i) * 2^(-(now - ts_i)/halfLifeH(m))
F_m += soreness_m * 1.5                      // from today's check-in

recovery_m = 100 * (1 - min(F_m / F_cap, 1)),   F_cap = 8   // (H)
```

Recovery only **ranks** and **soft-limits** (cap a muscle at 50% of normal session sets if recovery_m < 40). It never fully blocks a muscle.

## 6. Weekly volume targets and distribution (VOL-1..5, PHIL-1)

```
weeklyTarget_m = base[experience] * goalFactor * userAdjust_m
   base: novice 9, intermediate 12, advanced 15  (fractional sets)   // VOL-5 (H)
   goalFactor: hypertrophy 1.0, strength 0.75, general 0.8
   userAdjust_m: 1.0 default; ±10% per mesocycle from §11 auto-tuning

done_m = Σ fractional sets for m over rolling 7 days
deficit_m = max(0, weeklyTarget_m - done_m)

sessionsLeft = max(1, plannedSessionsThisWeek - completedThisWeek)
sessionShare_m = deficit_m / sessionsLeft
sessionCap_m = 10 fractional sets                                   // VOL-4
sessionNeed_m = min(sessionShare_m * readinessVolumeMod, sessionCap_m)

minimum frequency: each major muscle ≥ 2 exposures/week (PHIL-1). If a muscle has had
0 exposures by mid-week, boost its sessionNeed weight × 1.5.
```

Split selection (H): ≤3 sessions/week → full body; 4 → upper/lower; 5–6 → upper/lower/full rotation. This choice only biases which muscles get priority each day; deficits drive the actual pick.

## 7. Session builder (greedy, deterministic)

```
setBudget = floor(sessionMinutes * 60 / avgSetCycleSeconds)   // avgSetCycle = 40 s work + planned rest
candidates = exercises where all equipmentTypes satisfied by ACTIVE, NOT-EXCLUDED,
             NOT-TEMP-EXCLUDED equipment at current gym
session = []

while setBudget > 0 and any sessionNeed_m > 0.5:
   for each candidate e not in session:
      sets_e = clamp(round(max_m(sessionNeed_m / e.vector[m]) ), 2, 4)   // over m with vector>0
      coverage = Σ_m min(e.vector[m] * sets_e, sessionNeed_m) * (recovery_m/100)
      overshoot = Σ_m max(0, e.vector[m]*sets_e - sessionNeed_m) + cap violations * 10
      score = coverage
            - 0.5 * overshoot
            - 0.3 * e.fatigueCost * sets_e
            + 1.0 * isFavourite(e)
            + 0.8 * isAnchorLift(e)          // §8 continuity
            - 1.5 * samePatternAlreadyInSession(e)
            - 0.5 * usedInLastSession(e) * (not anchor)
   pick argmax score; append with sets_e; subtract its vector*sets from sessionNeed; setBudget -= sets_e

order session: compounds before isolations; within each, larger fatigueCost first;
avoid consecutive exercises with cosine(vector) > 0.8 (reorder if possible).
for each exercise: targetReps/RIR from §3, load from §2 (+ readiness modifiers §4), warm-ups from §14.
```

Tie-break by exercise id for determinism. Same inputs → same session (seeded randomness only for variety mode).

## 8. Exercise continuity (anchor lifts) — (H)

Per muscle region, the top-scoring compound becomes an **anchor** for a 4–6 week mesocycle so progression is measurable (PROG-1). Anchors are only replaced if: excluded, equipment broken > 7 days, or plateau (§11). Accessories rotate freely.

## 9. Progression and in-session adjustment (PROG-1, PROG-2)

**Between sessions (double progression):**
```
if all working sets reached top of rep range AND mean RIR ≥ targetRIR - 0.5:
     nextLoad = currentLoad + one equipment step, capped at +5% (PROG-2 H); reset reps to bottom of range
elif reps below bottom of range on 2 consecutive exposures at ≥ target effort:
     nextLoad = roundToEquipment(currentLoad * 0.92)
else: same load, aim +1 rep
```

**Within a session, after each logged working set:**
```
observedRIR = 10 - rpe + calibrationOffset
delta = targetRIR - observedRIR            // positive = harder than planned
expectedE1 = e1RM; observedE1 = weight * (1 + (reps + observedRIR)/30)
if delta ≥ 1.5 or observedE1 < expectedE1 * 0.95:
     next sets load = targetLoad(observedE1, targetReps, targetRIR) rounded down
elif delta ≤ -1.5 and reps ≥ top of range:
     next sets load = +1 equipment step (max one bump per exercise per session)
if observedRIR ≤ 0 on a heavy compound and more sets planned: drop one set (EFF-2)
```

## 10. RIR calibration (EFF-3)

Every 3–4 weeks per user, on one isolation/machine exercise (never barbell squat/bench/deadlift), the last set is an AMRAP. Before starting it the user enters predicted RIR at the planned rep target.
```
error = actualRepsToFailure - (plannedReps + predictedRIR)
calibrationOffset = EWMA(error, α = 0.3), clamped to [-2, +2]
```
Apply only to sets with ≤12 reps (accuracy drops beyond, EFF-3).

## 11. Plateau, deload, auto-tuning (DELOAD-1, DELOAD-2)

```
plateau(exercise) = e1RM slope over last 4 exposures ≤ 0 (linear regression) AND ≥ 3 weeks
deloadTrigger = (≥ 2 anchors in plateau) OR (readiness < 50 on ≥ 4 of last 7 check-ins)
                OR (weeksSinceDeload ≥ 8)                       // (H)
deloadWeek: volume × 0.6, target RIR ≥ 3, loads unchanged, same exercises (DELOAD-2: no cessation)

after each 4–6 week mesocycle, per muscle (H):
  if e1RM of anchors for m improved AND avg readiness ≥ 60: userAdjust_m *= 1.10 (max 1.5)
  if no improvement AND avg readiness < 55:                  userAdjust_m *= 0.90 (min 0.7)
```

## 12. Swap engine (single + combo)

```
target = removed.vector * remainingSets
pool   = candidates (§7 filters) minus exercises already in session
        minus anything loading a pain-flagged region

cos(a, b) = a·b / (|a||b|)

single score(e) = cos(target, e.vector)
                  + 0.10 * (e.pattern == removed.pattern)
                  - 0.10 * fatiguedOverlap(e)        // overlap with muscles recovery < 40
                  + 0.05 * isFavourite(e)
best single: sets = clamp(round(|target|₁ / |e.vector|₁), 1, removed.sets + 1)

if best single cos ≥ 0.85: return top 3 singles
else combos:
  K = top 15 singles by cos
  for each pair (a, b) in K×K, a<b, and splits (sa, sb) with sa, sb ≥ 1, sa+sb ∈ {S, S+1}:
       v = sa*a.vector + sb*b.vector
       err = |target - v|² + 0.5 * Σ_m max(0, v_m - target_m)   // penalise off-target
       sim = cos(target, v)
  keep combos where sim > best single cos + 0.05; rank by sim, then lower err, then lower fatigue
return top 3 mixing singles and combos, each with:
  matchPct = round(sim * 100)
  diff = per-muscle (v - target), shown as "+ more glutes, – less quads"
  load = §2 from machine-specific e1RM, else §15 estimate
  rationale = §16 template
```

Precompute: `cosine` matrix for all exercise pairs available at a gym; recompute only when equipment changes (store in IndexedDB). Combo search is K² × splits ≈ 105 × ~6 → trivial.

**Skip without replacing:** add removed volume back to `deficit_m` for later sessions this week (§6).

**Busy-pattern detection:** if an equipment item has ≥3 "busy" swaps in the same weekday-time bucket (2-hour buckets) within 4 weeks → prompt to deprioritise it (score −1.0) in that bucket.

## 13. Machine registration without the LLM

1. Normalise the typed name (lowercase, strip brand words from a brand list: technogym, life fitness, hammer strength, matrix, cybex, precor, gym80, nautilus, eleiko, ...).
2. Fuzzy-match (token-set ratio, e.g. via `fuzzysort`) against a **keyword dictionary** committed in seed data: `"chest press" → [machine_chest_press]`, `"pec deck"|"fly" → [pec_deck_fly, reverse_pec_deck]`, `"lat pull" → [lat_pulldown_wide, lat_pulldown_neutral]`, `"leg ext" → [leg_extension]`, `"hack" → [hack_squat]`, `"cable"|"crossover"|"functional trainer" → [all cable exercises]`, ... (~120 entries).
3. If best match score ≥ 0.75 → propose linked exercises, user confirms.
4. Only if no match (or user taps "Ask AI" / uses a photo) → one LLM call. Cache the result into the user's local dictionary so the same name never calls again.

## 14. Warm-ups (H)

For compounds with working load ≥ 40 kg (or ≥ 50% e1RM): ramp 40% × 8, 60% × 5, 80% × 2 (skip steps below the equipment minimum; for the second compound on the same muscles, only the 80% × 2 step). Isolations: none. Warm-up sets are logged with `isWarmup = true` and excluded from volume, fatigue and e1RM.

## 15. Load estimate for a new exercise/machine

```
if same exercise on other equipment: e1RM × 0.85
elif exercise with cos(vector) ≥ 0.8 and same pattern: that e1RM × ratio(patternPair) × 0.8
     // ratio table seeded (H), e.g. leg_press:squat 1.8, machine_chest_press:bench 1.0, db_press (per hand):bench 0.38
else: start at equipment minimum + 2 steps, target RIR 4 for first set, then §9 adjusts
```

## 16. Explanations without the LLM

Each rule ID maps to a sentence template with variables, e.g.

```ts
const templates = {
  'REST-1':   'Rest {rest}s — longer than 60–90 s helps preserve your working sets.',
  'READY-1':  'Volume trimmed {pct}% because you slept under 6 hours.',
  'READY-2':  'HRV is below your usual range, so today is slightly lighter (soft signal only).',
  'PROG-1':   'You hit {reps} reps at RPE {rpe} last time, so load goes up to {load} kg.',
  'SWAP':     '{match}% muscle match for {original}. {diff}',
  'VOL-1':    '{muscle} is at {done}/{target} sets this week.',
  'DELOAD-2': 'Lighter week: same exercises, ~40% fewer sets, keep 3+ reps in reserve.',
};
```
Heuristic (H) rules use "rule of thumb" wording. The "why does today look like this?" screen concatenates the templates the builder recorded while deciding.

## 17. Free-text logging parser (no LLM)

Grammar handles (case-insensitive, `kg` optional, `x`/`×`/`*`/`for`/`of` interchangeable):

```
"80 x 8"            → 1 set 80 kg × 8
"3x8 @ 80"          → 3 sets × 8 @ 80 kg
"3 sets of 8 at 80" → same
"80kg 8 8 7"        → 3 sets: 8, 8, 7 reps
"80 x 8 rpe 9" / "80x8@9" → RPE 9
"bench 80x8"        → exercise via fuzzy match against today's session first, then gym exercises
"~80", "about 80"   → 80, flagged approximate
"last one was a grind" / "failed" / "easy" → RPE hints: grind = 9.5, failed = 10, easy = 7
```

Return a `confidence` (all fields parsed + exercise match ≥ 0.75 → high). High → log directly with an undo toast. Low → show the parsed fields for one-tap correction. **Only if the user taps "Ask AI"** does the text go to the LLM.

## 18. Where the LLM is still allowed (opt-in, cached)

| Use | Trigger | Budget |
|---|---|---|
| Machine photo / unknown name → exercises | User taps "Ask AI" or §13 no match | Result cached in local dictionary |
| Free-text log the parser can't handle | User taps "Ask AI" | Rare |
| Free-text constraint ("all cables are taken") | Only if keyword matcher (§13 dictionary on equipment names/types) finds nothing | Rare |
| Weekly narrative review | User opens it; cached per week | ≤ 1/week |
| "Ask Liftwise" chat | Explicit | Daily limit |

Everything else — session generation, swaps, load prescription, adjustments, readiness, deloads, explanations — is deterministic and must work fully offline with the API key unset.
