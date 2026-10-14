# Liftwise

An installable, offline-first strength-training app that builds and adapts workouts from your
readiness, your in-session performance and the exact machines registered at your gym. Every
training rule comes from [EVIDENCE.md](EVIDENCE.md); the algorithms are specified in
[ALGORITHMS.md](ALGORITHMS.md); architecture and milestones are in [PLAN.md](PLAN.md).

**Status:** milestone 1 of 9: local database, sign-in, cloud sync, JSON export/import.

## Stack

- Next.js (App Router, TypeScript) + Tailwind, deployed on Vercel Hobby
- IndexedDB via Dexie as the primary store, so the app works offline in the gym
- Supabase (free tier) for sign-in (Google, email magic link / code) and cloud backup
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
3. **URL configuration** (Authentication → URL Configuration): set **Site URL** to your Vercel
   URL and add these **Redirect URLs**:
   - `http://localhost:3000/auth/callback`
   - `https://<your-app>.vercel.app/auth/callback`
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

## Deploying to Vercel (Hobby)

1. Import the GitHub repo in Vercel (framework: Next.js, package manager: pnpm, auto-detected).
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and, for AI,
   `ANTHROPIC_API_KEY`) under Project Settings → Environment Variables.
3. Deploy, then add the production URL to Supabase's redirect URLs (step 3 above).

Vercel Hobby is for non-commercial use, which fits a personal app.

## Coming in later milestones

Gym and equipment registration (including identifying machines from photos), the training
engine, active sessions and swaps, readiness check-ins, AI assists (Anthropic, opt-in), Google
Health integration and PWA install/offline caching. Each milestone documents any new setup here.
