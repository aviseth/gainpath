# Samsung Health

Samsung Health has **no web API**, so Liftwise can't read it directly. On Android, Samsung
Health can share data with **Health Connect**, which only native Android apps can read.

What exists in Liftwise today:

- A stub `ReadinessProvider` (`src/readiness/providers.ts`, `samsungHealthStub`) that returns no
  data, so the provider list is complete.
- An authenticated ingest endpoint that a future Android companion app can call.

## `POST /api/ingest/readiness`

Authenticate as the user with their Supabase access token (the companion signs in with the same
Supabase project, e.g. the email code flow):

```http
POST /api/ingest/readiness
Authorization: Bearer <supabase access token>
Content-Type: application/json

{
  "days": [
    { "date": "2026-10-13", "hrv_ms": 48.2, "resting_hr": 54, "sleep_hours": 7.4 }
  ]
}
```

- `date` is the local calendar date (`YYYY-MM-DD`); sleep belongs to the date you woke up.
- Each day needs at least one of `hrv_ms` (RMSSD, ms), `resting_hr` (bpm), `sleep_hours`. Up to
  31 days per request.
- Rows are written through `sync_push` into `wearable_daily` (source `ingest`) with an id
  derived from the user and date, so re-posting a date replaces it. Devices pick them up on
  their next sync.
- Responses: `200 {"ok":true,"stored":n}`, `400` invalid body, `401` missing/expired token.

## Building the companion (outline)

1. Android app with the Health Connect SDK; request read permissions for
   `HeartRateVariabilityRmssdRecord`, `RestingHeartRateRecord` and `SleepSessionRecord`.
2. In Samsung Health → Settings → Health Connect, allow Samsung Health to write those types.
3. A daily `WorkManager` job aggregates the previous days and posts them to the endpoint above.
