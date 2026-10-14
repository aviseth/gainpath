# Liftwise — Implementation Plan

Status: **draft, awaiting approval** (PROMPT.md, Process step 1). No application code is written until this is approved.

Sources: `PROMPT.md` (product brief), `EVIDENCE.md` (scientific source of truth, wins on conflicts), `ALGORITHMS.md` (deterministic engine spec).

---

## 1. Architecture

```
┌──────────────────────────── Browser (PWA, works offline) ────────────────────────────┐
│  Next.js App Router UI (React, Tailwind, dark, mobile-first)                         │
│        │                                                                             │
│        ▼                                                                             │
│  src/engine/  ← pure TypeScript, no I/O, no React, no network (Vitest)               │
│     e1rm · load · targets · readiness · fatigue · volume · builder · progression     │
│     calibration · deload · swap · registry(keyword match) · warmup · estimate        │
│     explain(templates) · parser(free-text log) · config.ts (all HEURISTIC constants) │
│        ▲                                                                             │
│        │ plain data in / plain data out                                              │
│  src/data/  repositories over Dexie (IndexedDB) — PRIMARY store                      │
│        │                                                                             │
│  src/sync/  outbox + pull loop ──(LWW by updated_at, soft deletes)──┐                │
└─────────────────────────────────────────────────────────────────────┼────────────────┘
                                                                      ▼
                         Supabase (free): Auth (Google + magic link), Postgres + RLS
                                                                      ▲
Vercel (Hobby) server routes, Node runtime:                           │
  /api/ai/*            Anthropic calls (key server-side only), Zod-validated, daily cap
  /api/health/google/* OAuth + daily sync (feature-flagged)  ─────────┘ writes readiness rows
  /api/ingest/readiness  authenticated POST for a future Health Connect companion app
```

Key principles
- **Engine is pure.** Every function takes snapshots (exercises, logs, equipment, config) and returns values + a list of `RationaleEntry { ruleId, template, vars }`. This makes it unit-testable, deterministic, and usable unchanged by the AI tool layer.
- **Offline-first.** The UI reads/writes only Dexie. Sync is a background concern; the app is fully usable with no network and no API key.
- **Multi-user ready.** Every row carries `user_id`; all queries are scoped by it locally and enforced by RLS remotely. Single-user today = one `user_id`.
- **AI is a client of the engine**, never a source of numbers. It may only call the five tools in PROMPT.md, and its outputs are re-validated by the engine (equipment active at current gym, within VOL-4 caps, etc.).

### Folder layout
```
src/
  app/                    routes: (onboarding) today session gym exercises progress settings
  app/api/ai/...          server-only Anthropic routes
  app/api/health/...      Google Health OAuth + sync
  app/api/ingest/readiness/route.ts
  engine/                 pure TS + __tests__/ per ALGORITHMS.md section
  engine/config.ts        every (H) constant, typed, with defaults + bounds
  data/db.ts              Dexie schema
  data/repos/*.ts         typed repositories
  sync/                   outbox, pull, conflict resolution, status store
  readiness/              ReadinessProvider interface + manual / google / samsung-stub
  ai/                     tool definitions, Zod schemas, prompts, call counter
  seed/                   exercises.json, keywords.json, brands.json, load-ratios.json, equipment-templates.json
supabase/migrations/      SQL incl. RLS policies
e2e/                      Playwright
docs/samsung-health.md, docs/google-health.md
```

---

## 2. Data model

All synced records share: `id` (uuid v7, generated client-side), `user_id`, `created_at`, `updated_at` (ms epoch, client clock, used for LWW), `deleted_at` (soft delete), `dirty` (local only).

### 2.1 Tables (same shape in Dexie and Postgres)

| Table | Key fields |
|---|---|
| `profiles` | goal (strength/hypertrophy/general), experience (novice/intermediate/advanced), sessions_per_week, session_minutes, time_saver_mode, calibration_offset, config_overrides (jsonb — user edits of config.ts constants), current_gym_id |
| `gyms` | name, is_default |
| `equipment` | gym_id, name, type (selectorized \| plate_loaded \| cable_station \| free_weights \| bench_rack \| bodyweight_station), brand, model, min_kg, max_kg, increment_kg, micro_increment_kg?, photo_path?, notes, status (active \| broken \| archived), broken_since?, status_reason? |
| `exercises` | **seed rows are not stored per user** (static JSON). User table holds only custom exercises: name, pattern, vector (jsonb Muscle→0.5/1.0), kind, equipment_types[], fatigue_cost, rep_range |
| `equipment_exercises` | equipment_id, exercise_id |
| `exercise_prefs` | exercise_id?, equipment_id?, kind (exclude \| favourite), reason? |
| `temp_exclusions` | equipment_id \| exercise_id \| body_region, date, reason (busy/feel/pain/free_text) — today-only |
| `sessions` | gym_id, date, status (planned/active/done/skipped), readiness_score, is_deload, is_calibration, plan (jsonb: planned exercises/sets/targets), rationale (jsonb RationaleEntry[]) |
| `set_logs` | session_id, exercise_id, equipment_id, ts, weight_kg, reps, rpe (6–10, nullable), rir (derived, stored for display), is_warmup, is_amrap, predicted_rir?, approximate |
| `e1rm_estimates` | exercise_id, equipment_id, value_kg, uncertainty_pct, updated_from_set_id, history (jsonb last N session bests) |
| `swaps` | session_id, removed_exercise_id, removed_equipment_id, reason, accepted_option (jsonb), weekday, time_bucket |
| `checkins` | date, sleep_quality 1–5, energy 1–5, sleep_hours?, soreness (jsonb Muscle→0–3) |
| `wearable_daily` | date, source (google_health/ingest), hrv_ms?, resting_hr?, sleep_hours? |
| `anchors` | muscle_region, exercise_id, equipment_id, mesocycle_start |
| `mesocycles` | start, end, user_adjust (jsonb Muscle→factor) |
| `ai_cache` | kind (machine_name/photo_hash/weekly_review/constraint), key, value (jsonb) |
| `ai_usage` | date, count (server-authoritative copy in Supabase) |
| `integrations` | provider, status, scopes — **tokens are stored server-side only**, in a Supabase table without client read access |

### 2.2 Dexie (local)
- One Dexie DB `liftwise` with the tables above, indexed on `[user_id+updated_at]`, `dirty`, and per-table lookup keys (e.g. `set_logs: [exercise_id+equipment_id+ts]`, `equipment: gym_id`).
- Extra local-only stores: `outbox` (pending mutations), `sync_meta` (last pulled `updated_at` per table), `similarity_cache` (per gym: equipment-hash → cosine matrix, ALGORITHMS §12).
- Seed JSON is bundled; custom exercises are merged over it in a single `getExerciseCatalog(userId)` selector.

### 2.3 Supabase (remote)
- Same tables in `public`, `user_id uuid references auth.users not null default auth.uid()`.
- **RLS on every table:** `using (user_id = auth.uid()) with check (user_id = auth.uid())` for select/insert/update; no hard delete policy (soft deletes only).
- `updated_at` trigger is **not** used for LWW (client clock decides); a separate `server_updated_at default now()` column + index drives pull cursors so clock skew can't skip rows.
- Storage bucket `equipment-photos`, path `{user_id}/{equipment_id}.jpg`, RLS on `storage.objects` by path prefix. Photos are compressed client-side (~200 KB) to stay within the 1 GB free tier.

### 2.4 Sync strategy
1. Every local write goes through a repo method: sets `updated_at = now()`, `dirty = 1`, appends to `outbox`.
2. Push loop (on startup, on `online`, every 30 s when visible, and after writes with 2 s debounce): upsert dirty rows in batches via `supabase.from(t).upsert(rows)` guarded by an RPC `upsert_lww(table, rows)` that only overwrites when `incoming.updated_at > existing.updated_at`. Clear `dirty` on success.
3. Pull loop: `select * where server_updated_at > cursor order by server_updated_at limit 500`; apply locally only if remote `updated_at` > local `updated_at` (LWW); tombstones (`deleted_at`) propagate.
4. Failures: exponential backoff (2 s → 5 min cap), app unaffected. Header indicator: ✓ synced / ↻ syncing / ⚠ offline-or-error with last-sync time.
5. First sign-in on a fresh device: full pull before showing Today. Signed-out use is allowed; on first sign-in local rows are re-owned to the auth user id and pushed.
6. Export/Import JSON: dumps all user tables + schema version; import merges with the same LWW rule (so it is idempotent).

---

## 3. Engine (maps 1:1 to ALGORITHMS.md; each module cites rule IDs)

| Module | ALGORITHMS § | EVIDENCE rules |
|---|---|---|
| `e1rm.ts` | §1 | PROG-3, EFF-3 |
| `load.ts` (targetLoad, roundToEquipment) | §2 | PROG-3, PROG-2 |
| `targets.ts` | §3 | LOAD-1, EFF-1, REST-1 |
| `readiness.ts` | §4 | READY-1..3 |
| `fatigue.ts` | §5 | REC-1, EFF-2 |
| `volume.ts` | §6 | VOL-1..5, PHIL-1 |
| `builder.ts` | §7, §8 | VOL-3/4, PHIL-1/2 |
| `progression.ts` | §9 | PROG-1, PROG-2, EFF-2 |
| `calibration.ts` | §10 | EFF-3 |
| `deload.ts` | §11 | DELOAD-1, DELOAD-2 |
| `swap.ts` | §12 | VOL-2, VOL-4, §10 rule 6 (pain) |
| `registry.ts` | §13 | — |
| `warmup.ts` | §14 | — (H) |
| `estimate.ts` | §15 | PROG-3 |
| `explain.ts` | §16 | EVIDENCE §10 (H → "rule of thumb") |
| `parser.ts` | §17 | EFF-3 |

`config.ts`: one exported `DEFAULT_CONFIG` object; each (H) entry has `{ value, min, max, ruleId, heuristic: true }` so Settings → Advanced can render and bound-check it generically. Code sites carry `// HEURISTIC (RULE-ID)`.

Determinism: all tie-breaks by exercise id; the only randomness is a seeded PRNG for "variety mode".

---

## 4. Swap algorithm (pseudocode)

```ts
function findSubstitutes(ctx, removed: PlannedExercise, reason): SwapResult {
  // 1. Reason side effects (applied by caller, recorded in `swaps`)
  //    busy|feel → temp_exclusions(equipment, today)
  //    broken    → equipment.status = broken, broken_since = today
  //    dislike   → ask once → exercise_prefs(exclude) if confirmed
  //    pain      → temp_exclusions(region, today); drop all session exercises whose
  //                vector loads that region; add "see a professional if it persists" (EVIDENCE §10.6)

  const S = removed.remainingSets
  const target = scale(removed.exercise.vector, S)                    // VOL-2 fractional

  // 2. Candidate pool — only registered, usable equipment at the current gym
  const pool = catalog.filter(e =>
       supportedByActiveEquipment(e, ctx.gym)       // status=active, not excluded, not temp-excluded
    && !ctx.session.has(e.id)
    && !loadsPainRegion(e, ctx.painRegions))
  if (pool.length === 0) return { options: [], skipOnly: true, rationale: ['no equipment available'] }

  // 3. Singles
  const singles = pool.map(e => {
    const sim = cos(target, e.vector)
    const score = sim + 0.10*(e.pattern === removed.pattern)
                      - 0.10*fatiguedOverlap(e, ctx.recovery)        // recovery < 40
                      + 0.05*isFavourite(e)
    const sets = clamp(round(L1(target) / L1(e.vector)), 1, S + 1)
    return { kind:'single', items:[{e, sets}], sim, score, v: scale(e.vector, sets) }
  }).filter(o => withinSessionCaps(ctx.session.minus(removed), o.v))  // VOL-4
    .sort(byScoreThenId)

  let options = singles
  // 4. Combos only if no single is good enough (threshold from config, default 0.85)
  if (!singles.length || singles[0].sim < cfg.swapSingleThreshold) {
    const K = topBy(pool, e => cos(target, e.vector), 15)
    const combos = []
    for (a, b of pairs(K)) for (sa, sb of splits(S))                  // sa,sb ≥1, sa+sb ∈ {S, S+1}
      const v = add(scale(a.vector, sa), scale(b.vector, sb))
      if (!withinSessionCaps(ctx.session.minus(removed), v)) continue
      const sim = cos(target, v)
      const err = sqDist(target, v) + 0.5 * Σ_m max(0, v[m] - target[m])
      if (sim > (singles[0]?.sim ?? 0) + 0.05) combos.push({kind:'combo', items:[{a,sa},{b,sb}], sim, err,
                                                            fatigue: a.fatigueCost*sa + b.fatigueCost*sb})
    combos.sort(bySimDesc, thenErrAsc, thenFatigueAsc, thenIds)
    options = mergeRanked(singles, combos)
  }

  // 5. Decorate top 3
  return { options: options.slice(0, 3).map(o => ({
    ...o,
    matchPct: round(o.sim * 100),
    diff: describeDiff(o.v - target),                                 // "+ more glutes, – less quads"
    loads: o.items.map(i => machineE1rm(i) ? loadFrom(i) : estimateNewMachineLoad(i)),  // §2 / §15
    rationale: explain('SWAP', {...}),                                // cites VOL-2, VOL-4
  })), skipOnly: false }
}

// Skip without replacing → add removed.vector × S back into the week's deficit (ALGORITHMS §6)
// After accept/skip → rebalance remaining planned exercises if any muscle falls below
//   its sessionNeed by > 1 fractional set (re-run builder on the remaining budget).
// Busy-pattern: ≥3 'busy' swaps for same equipment in same weekday+2h bucket within 28 days
//   → prompt "Deprioritise it on <weekday> evenings?" → score −1.0 in that bucket.
```

Required tests (PROMPT Process 4): single swap, combo swap, no-equipment-available, broken equipment excluded, permanent exclusion respected, per-session VOL-4 caps respected — plus pain-region removal and determinism.

---

## 5. AI layer (opt-in; ALGORITHMS §18)

- Server routes only; `ANTHROPIC_API_KEY` in Vercel env. If unset, AI buttons are hidden and everything else works.
- Models: Haiku for parsing, constraint mapping, swaps-edge-cases, chat; Sonnet for weekly review and photo/vision. Exact model IDs live in one config constant.
- Tool-use with the five engine tools; the client sends the needed engine snapshot with the request (engine runs in the browser, so the server executes tools against that snapshot — no server copy of the user's data is required).
- Prompt caching on the system prompt + EVIDENCE.md excerpt; Zod schemas for every structured output; engine re-validation before display.
- Hard daily cap (default 20, configurable) enforced server-side per `user_id` in Supabase; counter shown in Settings.
- System prompt enforces EVIDENCE §10: cite only rule IDs/studies from EVIDENCE.md, "rule of thumb" for H rules, no diagnosis.

## 6. Readiness providers

```ts
interface ReadinessProvider { id; isEnabled(); getDaily(date): Promise<Partial<DailyReadinessInput>> }
```
- `ManualCheckinProvider` — default, fully built.
- `GoogleHealthProvider` — feature flag `NEXT_PUBLIC_FF_GOOGLE_HEALTH`. **Before milestone 8 I will verify current endpoints and scope names at developers.google.com/health** and document "testing" mode with your account as a test user in `docs/google-health.md`.
- `SamsungHealthStubProvider` — returns nothing; `POST /api/ingest/readiness` (Supabase JWT or per-user ingest token, Zod-validated) writes `wearable_daily`. Documented in `docs/samsung-health.md`.
- Engine merges providers; missing fields simply drop their terms (ALGORITHMS §4).

---

## 7. Milestones

Each ends with `pnpm lint && pnpm typecheck && pnpm test` (+ Playwright where UI exists), a commit, and a summary.

1. **Foundation:** Next.js + Tailwind scaffold, Dexie schema + repos, Supabase migrations + RLS, auth (Google + magic link, persistent session), sync engine + status indicator, export/import.
2. **Gyms & catalog:** seed JSON (~150 exercises, keyword dictionary ~120 entries, brands, load ratios, equipment templates), gym/equipment CRUD, custom machine flow (< 1 min), custom exercises with required muscle mapping, prefs (exclude/broken/favourite).
3. **Engine + tests:** all modules in §3 with unit tests per ALGORITHMS section, including the full swap test list.
4. **Logging + active session:** set logging with per-machine steppers, RPE/RIR, rest timer + vibration, in-session adjustments, swap sheet, skip, free-text parser, Wake Lock.
5. **Check-in + Today:** manual check-in, readiness, session generation (deterministic) with "why does today look like this?", deload prompts, calibration sets; AI chat/weekly review behind opt-in.
6. **Check my gym + AI registration assist:** coverage audit (muscles/patterns/gaps/unlinked machines), keyword matcher, "Ask AI" name/photo → Zod-validated proposal → confirm.
7. **Progress:** e1RM per exercise×equipment, weekly volume vs target, recovery map.
8. **Google Health integration** (after endpoint verification) + Samsung stub/ingest endpoint + docs.
9. **PWA polish & deploy:** Serwist offline caching, install prompt, Vercel deploy, README (Supabase / Vercel / Google Cloud setup), `.env.example`, E2E pass.

---

## 8. Dependencies needing your OK (PROMPT Process 6)

Standard for this stack (assumed OK): `next`, `react`, `typescript`, `tailwindcss`, `vitest`, `@playwright/test`, `eslint`, `prettier`, `zod`, `dexie`, `@supabase/supabase-js`, `@supabase/ssr`, `@serwist/next`, `@anthropic-ai/sdk`.

Please confirm:
- `dexie-react-hooks` — live queries in React.
- `fuzzysort` — named in ALGORITHMS §13 for fuzzy machine/exercise matching (~5 KB).
- `uuidv7` (or hand-rolled) — sortable client-side ids.
- A charting lib for milestone 7: **`recharts`** (simple, popular) vs hand-rolled SVG (zero deps). I lean to hand-rolled SVG to keep the bundle small.
- `fake-indexeddb` (dev only) — Dexie tests in Vitest.

## 9. Free-tier notes / risks

- **Anthropic API** is the only paid service (as intended); daily cap bounds cost.
- **Vercel Hobby** is for non-commercial use — fine for a personal app.
- **Supabase free** pauses projects after ~1 week with no activity; regular use keeps it alive, and the app keeps working locally while paused. Free tier is 500 MB DB / 1 GB storage — ample for one user.
- **Google Health API** scopes are Restricted; running in OAuth "testing" mode means tokens may expire every 7 days and need re-consent. Will confirm when verifying the docs.
- **Screen Wake Lock** isn't available in every browser (older iOS Safari); we degrade silently.
- Client clocks drive LWW; acceptable for single-user multi-device. Revisit with hybrid logical clocks if multi-user collaboration ever appears.

## 10. Open questions for you

1. Package manager: pnpm OK?
2. Allow signed-out local use, or require sign-in at first launch?
3. Daily AI call cap default — 20 OK?
4. Charts: hand-rolled SVG or `recharts`?
