# Liftwise

An installable, offline-first strength-training app that builds and adapts workouts from your
readiness, your in-session performance and the exact machines registered at your gym. Every
training rule comes from [EVIDENCE.md](EVIDENCE.md); the algorithms are specified in
[ALGORITHMS.md](ALGORITHMS.md); architecture and milestones are in [PLAN.md](PLAN.md).

**Status:** all 9 milestones built: gyms and machines, the deterministic training engine, live
sessions and swaps, readiness check-ins, progress charts, opt-in AI, Google Health and an
installable offline PWA.

## What it does

- **Today:** a 10-second check-in sets readiness (READY-1..3); the engine builds today's session
  from weekly volume targets, recovery and the machines that are actually free. "Why does today
  look like this?" explains every choice with rule IDs. No AI involved.
- **Session:** big steppers, RPE taps, warm-ups, rest timer, calibration AMRAPs, in-session load
  adjustment (PROG-2), one-line text logging ("3x8 @ 60"), and swaps by reason (busy, broken,
  pain…) with match percentages.
- **Gym:** register machines from templates, by name (keyword dictionary), or from a photo with
  AI; "Check my gym" lists gaps. Committed gym manifests in `src/seed/gyms/` load automatically.
- **Progress:** e1RM per exercise × machine, weekly volume vs target, recovery map, and an
  optional AI weekly review.

## Stack

- Next.js (App Router, TypeScript) + Tailwind, deployed on Cloudflare Workers (free)
- IndexedDB via Dexie as the primary store, so the app works offline in the gym
- Supabase (free tier) for sign-in (Google, email magic link / code) and cloud backup
- Anthropic API (optional, server-side, opt-in) and Google Health API (optional, feature flag)
- Serwist service worker: installable, works offline after the first visit
- Vitest (unit) and Playwright (end-to-end)

Everything runs without Supabase configured: the app stays local-only and you back up with
**Settings → Export JSON**.

## Local development

Requires Node 20.9+ and pnpm 10.

```bash
pnpm install
cp .env.example .env.local   # optional: fill in Supabase values to enable sync
pnpm dev                     # http://localhost:3000
```

| Command                             | What it does                        |
| ----------------------------------- | ----------------------------------- |
| `pnpm test`                         | Unit tests (Vitest, fake IndexedDB) |
| `pnpm test:e2e`                     | Builds the app and runs Playwright  |
| `pnpm lint` / `pnpm typecheck`      | ESLint / route types + `tsc`        |
| `pnpm format` / `pnpm format:check` | Prettier                            |

If Playwright's bundled Chromium isn't installed, point it at another one:
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome pnpm test:e2e`.

## Supabase setup (free tier)

1. **Create a project** at [supabase.com](https://supabase.com/dashboard). Copy the project URL and
   the publishable key (Project Settings → API Keys) into `.env.local` as
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A legacy `anon` key also
   works. Both values are safe in the browser; Row Level Security protects the data.
2. **Apply the schema.** Either paste each file in
   [`supabase/migrations/`](supabase/migrations) into the dashboard's SQL Editor, oldest first, and
   run it, or with the Supabase CLI:
   ```bash
   pnpm dlx supabase init        # once; keeps the existing migrations folder
   pnpm dlx supabase link --project-ref <your-project-ref>
   pnpm dlx supabase db push
   ```
3. **URL configuration** (Authentication → URL Configuration): set **Site URL** to your deployed
   URL and add these **Redirect URLs**:
   - `http://localhost:3000/auth/callback`
   - `https://liftwise.<your-subdomain>.workers.dev/auth/callback`
4. **Email sign-in** (Authentication → Sign In / Providers → Email): enabled by default. To let
   the installed app sign in with a code (a magic link can open in the system browser instead of
   the app), edit Authentication → Emails → **Magic Link** and add the code to the template, e.g.
   `<p>Or enter this code: <strong>{{ .Token }}</strong></p>`. The free tier's built-in mailer is
   rate-limited (a few emails per hour), which is fine for one user.
5. **Google sign-in** (Authentication → Sign In / Providers → Google):
   1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, configure
      the OAuth consent screen (External; add your Google account as a test user), then create
      an **OAuth client ID** of type _Web application_.
   2. Add the callback URL shown on Supabase's Google provider page
      (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI.
   3. Paste the client ID and secret into Supabase and enable the provider.

Free-tier notes: Supabase pauses projects after about a week with no activity (open the app or
the dashboard to resume; the app keeps working locally meanwhile). The database limit (500 MB)
is far more than one person's training log needs.

### How sync works

IndexedDB is the source of truth on each device. Every edit stamps `updated_at` and queues the
row; sync pushes queued rows through the `sync_push` RPC (last write wins), then pulls changes
by a server-side cursor. Deletes are soft (tombstones), so they sync too. Data created before
signing in is attached to your account on first sign-in; data belonging to a _different_
account is never uploaded. Sync pauses and Settings explains how to export and reset. Details
are in [PLAN.md §2](PLAN.md).

## AI assist (optional)

Training never needs AI: session generation, swaps, loads, readiness, deloads and the "why"
explanations are deterministic and work offline. AI is opt-in per device (Settings → AI assist),
needs sign-in, and is only called when you tap "Ask AI" / "Ask Liftwise", or when a free-text
"X is taken" can't be matched to your equipment by keywords.

1. Create an API key at [console.anthropic.com](https://console.anthropic.com/) and set
   `ANTHROPIC_API_KEY` (server-only; never prefix it with `NEXT_PUBLIC_`).
2. Optional: `AI_DAILY_LIMIT` (default 20) caps calls per account per UTC day. It's enforced in
   Postgres by `ai_consume()` (migration `20261014010000_ai_usage.sql`); the in-app setting can
   only lower it. A chat question counts once, including up to 4 tool round trips.

Models: Claude Haiku for parsing, constraints and chat; Claude Sonnet for the weekly review and
machine photos. Prompts are cached, and the model only narrates numbers the engine computed.

## Health data (optional)

- **Google Health** (Fitbit / Pixel Watch): HRV, resting heart rate and sleep, behind
  `GOOGLE_HEALTH_ENABLED=1`. Setup, including the Restricted-scope testing mode: [docs/google-health.md](docs/google-health.md).
- **Samsung Health** has no web API. An authenticated `POST /api/ingest/readiness` endpoint is
  ready for a future Health Connect companion: [docs/samsung-health.md](docs/samsung-health.md).

## Deploying (Cloudflare Workers, free)

The app runs on Cloudflare Workers through the OpenNext adapter. The free plan allows about
100,000 requests a day, and static files (the app shell, icons, the service worker) don't count.

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com/).
2. **Workers & Pages → Create → Import a repository**, pick `liftwise`, and set:
   - Build command: `pnpm exec opennextjs-cloudflare build`
   - Deploy command: `pnpm exec opennextjs-cloudflare deploy`
3. Under the Worker's **Settings → Variables and Secrets**, add the variables from the table
   below (as build variables too for the two `NEXT_PUBLIC_*` ones, since they're inlined at
   build time).
4. Deploy, then add `https://liftwise.<your-subdomain>.workers.dev/auth/callback` to Supabase's
   redirect URLs (step 3 above).

From your own machine instead: `pnpm dlx wrangler login` once, then `pnpm deploy:cf`. Test the
Worker build locally with `pnpm preview:cf`.

## Install on your phone

Open the deployed URL once while online, then:

- **Android (Chrome):** menu → **Install app** (or "Add to Home screen").
- **iPhone (Safari):** Share → **Add to Home Screen**.

After that first visit the whole app, your gym and your history work offline in the gym; writes
sync when you're back online. `pnpm build` runs `next build` and then `serwist build`, which
writes `public/sw.js` (git-ignored). The service worker is off in `pnpm dev`.

## Environment variables

| Variable                                                                            | Where           | Needed for                       |
| ----------------------------------------------------------------------------------- | --------------- | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                  | client + server | Sign-in, sync, AI, Google Health |
| `ANTHROPIC_API_KEY`                                                                 | server only     | AI assist                        |
| `AI_DAILY_LIMIT` (default 20)                                                       | server only     | AI cap per account per day       |
| `GOOGLE_HEALTH_ENABLED=1`, `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET` | server only     | Google Health                    |

All are optional: with none set the app runs fully local.
