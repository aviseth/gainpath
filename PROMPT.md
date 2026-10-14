Build a web app (installable PWA) called "Liftwise": an AI-driven strength training app similar to Fitbod. It generates and adapts workouts from daily readiness, in-session performance, and the exact machines available in my gym. Use free tiers for everything except the LLM API.

It is a single-user app for now (me), but build it so adding users later is not a rewrite.

## Stack (free tiers)
- Next.js (App Router, TypeScript) + Tailwind, deployed to Vercel Hobby.
- **Local-first data:** IndexedDB via Dexie is the primary store on my phone, so the app is fast and works offline in the gym.
- **Supabase free tier** for sign-in and cloud backup/sync, so data survives a phone change or cleared browser storage:
  - Auth: Google sign-in + email magic link. Session should persist so I stay signed in on my phone.
  - Sync: background, last-write-wins per record with `updated_at`, soft deletes. Row Level Security on every table.
  - If sync fails, the app keeps working locally and retries; show a small sync-status indicator.
- Also include **Export / Import JSON** in settings as a manual backup.
- PWA via Serwist: installable, offline, Screen Wake Lock during sessions.
- Anthropic API, server-side only: claude-haiku for parsing, swaps and in-session changes; claude-sonnet for weekly planning and vision tasks. Key in env vars.
- Vitest for the engine, Playwright for end-to-end tests.
- No paid services. If something has no free tier, tell me and propose a free alternative.

## Units and conventions
- Metric only: kg, cm.
- Each machine has its own load increments.
- Capture RPE (6–10) and RIR per set.

## Evidence base
EVIDENCE.md in the repo root is the scientific source of truth. Read it before writing the engine.
- Implement every rule in it and reference rule IDs (e.g. VOL-2, EFF-3) in code comments and tests.
- Rules graded H are heuristics. Mark them `// HEURISTIC`, make their constants configurable, and have the AI call them "rules of thumb".
- Every AI-generated session and every swap suggestion returns a `rationale` field citing rule IDs.
- The AI may not cite any study not listed in EVIDENCE.md.
- Where EVIDENCE.md conflicts with anything else in this prompt, EVIDENCE.md wins.

## Gyms and machines (core feature)
I train in a gym with many machines. **Exercises must only ever come from equipment I have actually registered for the gym I'm training in.**

### Data model
- `gyms`: name, is_default. I can have more than one, e.g. my gym, home, a hotel.
- `equipment`: belongs to a gym. Fields:
  - name ("Technogym Selection Chest Press")
  - type: selectorized machine | plate-loaded machine | cable station | free weights | bench/rack | bodyweight station
  - brand/model (optional)
  - load range: min kg, max kg
  - increment kg (e.g. 5 kg stack plates; 2 kg dumbbell jumps); optional micro-plate increment
  - optional photo and notes ("seat height 4")
  - status: active | broken | archived
- Seed equipment templates for common gear: barbell + rack, dumbbells with their range, adjustable cable, standard machines. Adding my gym should be quick. Templates are only a starting point; my gym is whatever I register.
- `exercises`: name, movement pattern (horizontal push, vertical pull, squat, hinge, lunge, knee extension, knee flexion, hip abduction, etc.), primary muscles (weight 1.0) and secondary muscles (weight 0.5) per EVIDENCE.md VOL-2, compound/isolation, and which equipment *types* it needs. Seed ~150 exercises with accurate muscle mappings.
- `equipment_exercises`: which exercises a specific machine supports. A cable station supports many; a pec deck supports one or two.

### Adding a custom machine
Make this fast. It should take under a minute per machine in the gym:
1. Name it, pick a type, and set the load range and increment.
2. Link it to existing exercises, or create a custom exercise.
3. **AI assist:** I can type the machine name or take a photo. Claude (vision) proposes the exercise(s) it supports, the movement pattern and the muscle mapping. **Nothing is saved until I confirm or edit it.** Validate the AI output with Zod.
4. Custom exercises need a muscle mapping (required) because swaps and volume counting depend on it.

### "Check my gym"
A screen that audits my registered equipment against my goals. It shows which muscle groups and movement patterns I *can* train with what's registered, flags gaps (e.g. "no direct hamstring isolation available"), and lists machines I've registered but have no exercises linked to. This only reports what's missing; it never suggests exercises for equipment I don't have.

### Preferences per exercise or machine
- **Exclude permanently** (I don't like it): it is never programmed. Reversible in settings.
- **Mark broken**: excluded until I mark it fixed. Show it greyed out with a "broken since" date.
- **Favourite**: ranked higher when the engine picks exercises.
- Optional reason text on any exclusion.

### Machine-specific history
Load progressions and e1RM are tracked **per exercise per equipment**, because a chest press on one brand ≠ another. When an exercise moves to a new machine, start conservatively: estimate from the closest history with an explicit uncertainty margin, then calibrate after the first working set.

## Swaps and substitutions (core feature)
At any point, in a planned or active session, I can tap **"Swap"** on an exercise. Then:

1. **Pick a reason** (one tap): machine busy | machine broken | don't feel like it today | don't like this exercise | pain/discomfort.
   - Busy / don't feel like it → today only.
   - Broken → marks the equipment broken.
   - Don't like → asks once whether to exclude it permanently.
   - Pain → removes all exercises loading that area for today and suggests seeing a professional if it persists. No diagnosis.
2. **Generate alternatives with the deterministic engine first.** The LLM only ranks, explains and handles edge cases.
   - Represent each exercise as a **muscle-stimulus vector** using the fractional weights.
   - Target = removed exercise's vector × its remaining planned sets.
   - Candidates = exercises supported by *active, non-excluded* equipment at the current gym, not already in today's session, within readiness/recovery limits.
   - **Single swap:** rank by cosine similarity to the target vector, plus a bonus for the same movement pattern and a penalty for loading already-fatigued muscles.
   - **Combo swap (1 → 2):** if no single candidate scores above a similarity threshold (configurable, default 0.85), search pairs. Allocate sets between the two so the summed fractional volume per muscle best matches the target (small least-squares or brute force over set splits). Example output: "Instead of leg press (3 sets), do Smith machine squat × 2 + leg extension × 2."
   - Total session volume per muscle must stay within the per-session caps in EVIDENCE.md (VOL-4).
3. **Show the top 3 options** (single or combo), each with:
   - similarity score as a simple badge (e.g. "92% match")
   - which muscles it hits more or less than the original
   - suggested load (from machine-specific history or a conservative estimate)
   - a one-line rationale
4. **One tap to accept.** The session recalculates. If I also skip the next exercise, keep the session's overall muscle balance in view and rebalance remaining exercises if a muscle is now under-dosed.
5. **"Skip without replacing"** is always available. The engine then adds the missing volume to a later session in the week if possible.
6. Log every swap with its reason. Repeated swaps of the same machine for "busy" at the same time of day should eventually prompt: "This machine is often busy at this time. Deprioritise it on weekday evenings?"

Also support **free-text swap requests** ("all the cable stations are taken"). The LLM maps the request to equipment exclusions for today, then calls the same engine.

## Core engine (deterministic, pure TypeScript, fully unit-tested — implements EVIDENCE.md)
1. e1RM per exercise per equipment, updated only from sets ≤10 reps, RIR-adjusted (PROG-3).
2. Per-muscle fractional volume tracking, weekly and per session (VOL-1, VOL-2, VOL-4).
3. Per-muscle fatigue model (REC-1, heuristic). Used for ranking and soft limits only.
4. Readiness score from check-in + optional wearable data vs my own 14-day baseline (READY-1 to READY-3). Degrades gracefully when data is missing.
5. RPE-autoregulated double progression and in-session load adjustment (PROG-1, PROG-2).
6. Goal-specific effort and rest targets (EFF-1, LOAD-1, REST-1).
7. Reactive deload suggestions (DELOAD-1, DELOAD-2).
8. Session builder: picks exercises only from available equipment, balances movement patterns and muscle volume, respects favourites/exclusions, session length and readiness.
9. Swap engine as specified above.
10. RIR calibration sets and per-user calibration offset (EFF-3).

## Algorithms (deterministic first — minimal LLM use)
ALGORITHMS.md in the repo root specifies every engine algorithm with pseudocode and constants:
- e1RM and load prescription
- readiness, fatigue and recovery
- weekly volume distribution
- greedy session builder
- progression and in-session adjustment
- RIR calibration
- plateau and deload detection, plus mesocycle auto-tuning
- single and combo swap engine
- machine registration via keyword matching
- warm-ups
- new-machine load estimates
- templated explanations
- a free-text logging parser

Implementation rules:
- Implement it exactly. Put every (H) constant in `src/engine/config.ts`, and unit-test each section.
- **Target: zero LLM calls in a normal training day.** Session generation, swaps, load prescription, adjustments, readiness, deloads and the "why does today look like this?" explanations are all deterministic, and must work offline with the API key unset.
- Generate the seed data once during development (exercise DB with muscle vectors, movement patterns, keyword dictionary for machine names, load-ratio table) and commit it as static JSON. Never generate it at runtime.
- Precompute the exercise-similarity matrix per gym and cache it in IndexedDB; recompute only when equipment changes.

## AI layer (opt-in only)
The LLM is used only where ALGORITHMS.md §18 allows, and only on explicit user action ("Ask AI") or when the deterministic step finds no match:
- machine photo or unknown machine name → proposed exercises. Cache the result in the local keyword dictionary so the same input never calls again.
- free-text logs the parser can't handle
- free-text constraints the keyword matcher can't map
- a weekly narrative review, cached per week
- an optional "Ask Liftwise" chat

Rules for every call:
- The LLM never invents numbers. It calls engine functions as tools:
  - `get_available_equipment`
  - `get_recovery_state`
  - `get_readiness`
  - `find_substitutes`
  - `exclude_equipment_today`
- Use structured output validated with Zod. The engine validates every result before it's shown, and rejects any exercise whose equipment isn't active at the current gym.
- Use prompt caching, claude-haiku by default, and a hard daily call limit. Show a small "AI used" counter in settings.

## Health data integrations
Build a `ReadinessProvider` interface:
1. **Manual daily check-in** (sleep quality, energy, soreness per muscle group). Build fully; it is the default and must work alone.
2. **Google Health API** (successor to the Fitbit Web API, Google OAuth 2.0, REST): OAuth flow plus daily sync of sleep, HRV and resting HR. Scopes are Restricted, so document running it in Google Cloud OAuth "testing" mode with my account as a test user. Verify current endpoints and scope names against developers.google.com/health before writing code. Feature-flagged.
3. **Samsung Health:** no web API exists. Do not build it. Create a stub provider plus an authenticated `POST /api/ingest/readiness` endpoint that a future Android companion app reading Health Connect could post to. Document this in docs/samsung-health.md.

## UI (mobile-first, one thumb, dark mode, large tap targets)
- **Onboarding:** goal, experience, sessions/week, session length, then "set up your gym" (templates + quick custom add).
- **Today:** readiness, generated session, start button.
- **Active session:**
  - set logging (weight steppers using that machine's increments, reps, RPE)
  - rest timer with vibration
  - live adjustments
  - **Swap** button on every exercise, and a skip option
- **My gym:** equipment list grouped by type, add/edit, status toggles, photos, "Check my gym" audit.
- **Exercises:** search, favourites, exclusions, custom exercises.
- **Progress:** e1RM per exercise/machine, weekly volume per muscle vs target, recovery map.
- **Settings:** account, sync status, export/import, integrations, heuristic constants (advanced).

## Process
1. Read EVIDENCE.md and ALGORITHMS.md first. Before coding, write PLAN.md with architecture, the data model (local Dexie schema + Supabase tables + sync strategy), the swap algorithm in pseudocode, and milestones. Then stop and wait for my approval.
2. Build in milestones:
   1. auth + local DB + sync + export/import
   2. gyms, equipment, exercises, custom machine flow
   3. engine with tests (including swap engine)
   4. logging + active session + swaps
   5. check-in + AI session generation
   6. "Check my gym" audit and AI machine-registration assist
   7. progress charts
   8. Google Health integration
   9. PWA polish and deploy
3. After each milestone: run tests and lint, commit with a clear message, and summarize what's done and what's next.
4. Swap engine tests must cover:
   - single swap
   - combo swap
   - no-equipment-available case
   - broken equipment excluded
   - permanent exclusion respected
   - per-session volume caps respected
5. Include .env.example, a README with setup for Supabase, Vercel and Google Cloud, and Supabase migrations in the repo.
6. Ask me before adding any dependency that isn't clearly standard.
