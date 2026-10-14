# Google Health (Fitbit / Pixel Watch)

Optional. Adds nightly **HRV**, **resting heart rate** and **sleep** to readiness. Wearable data
only nudges the score (READY-2); the daily check-in stays the main input, and everything works
without this.

The Google Health API replaces the Fitbit Web API (the legacy API is turned off on
30 October 2026). Endpoints and scopes below were checked against the v4 discovery document
(`https://health.googleapis.com/$discovery/rest?version=v4`) on 14 October 2026.

| What                                             | Data type                      | Filter field                        | Scope                                                   |
| ------------------------------------------------ | ------------------------------ | ----------------------------------- | ------------------------------------------------------- |
| HRV (`averageHeartRateVariabilityMilliseconds`)  | `daily-heart-rate-variability` | `daily_heart_rate_variability.date` | `googlehealth.health_metrics_and_measurements.readonly` |
| Resting HR (`beatsPerMinute`)                    | `daily-resting-heart-rate`     | `daily_resting_heart_rate.date`     | `googlehealth.health_metrics_and_measurements.readonly` |
| Sleep (`summary.minutesAsleep`, by wake-up date) | `sleep`                        | `sleep.interval.civil_end_time`     | `googlehealth.sleep.readonly`                           |

Requests: `GET https://health.googleapis.com/v4/users/me/dataTypes/{dataType}/dataPoints?filter=…`.
Scope prefix: `https://www.googleapis.com/auth/`.

## Setup (testing mode, your account only)

These scopes are **Restricted**. Verification for a public app needs a security assessment,
which a personal app doesn't need: keep the OAuth app in **Testing** and add yourself as a test
user.

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project and
   enable the **Google Health API** (APIs & Services → Library).
2. **OAuth consent screen** (Google Auth Platform): User type _External_, publishing status
   **Testing**. Under **Audience → Test users**, add your Google account. Under **Data access**,
   add the two scopes above.
3. **Clients → Create client**: type _Web application_. Authorized redirect URIs:
   - `http://localhost:3000/settings/google-health`
   - `https://<your-app>.vercel.app/settings/google-health`
4. Set the server environment variables (Vercel → Project Settings → Environment Variables, or
   `.env.local`):
   ```
   GOOGLE_HEALTH_ENABLED=1
   GOOGLE_HEALTH_CLIENT_ID=…apps.googleusercontent.com
   GOOGLE_HEALTH_CLIENT_SECRET=…
   ```
5. Apply the migration `supabase/migrations/20261014020000_health_connections.sql`.
6. In the app: sign in, then Settings → Health data → **Connect Google Health**.

Notes:

- In Testing mode Google expires refresh tokens after **7 days**. When that happens the app
  says "access expired" and you reconnect in Settings (one tap). Publishing the app to
  production avoids this but requires verification for Restricted scopes.
- The refresh token lives in `health_connections` (RLS: only your account can read it) and is
  never synced to devices. Disconnect revokes it with Google and deletes the row.
- The app pulls the last 14 days on connect, then at most every 12 hours when it opens.
  Values land in `wearable_daily` (source `google_health`) and sync to your other devices.
