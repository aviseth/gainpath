# Running a hosted copy for other people

Gainpath is free to self-host: your own Cloudflare, Supabase and Anthropic
accounts, as in the README's Deploy section. If you'd rather run one copy and
let friends pay you for an account on it, deploy it the same way and switch it
to invite-only.

Nobody can create their own account. When someone pays, you add their email;
they open Settings, enter that email and type in the code they receive. They
use your Anthropic key, capped per person per day.

## Set up

1. Deploy as in the README, with `ANTHROPIC_API_KEY` set.
2. Supabase → Authentication → Sign In / Providers → turn off **Allow new
   users to sign up**. This is the gate: it blocks new accounts from the email
   form and from Google sign-in alike. Do it before sharing the link.
3. Add these environment variables (the `NEXT_PUBLIC_*` ones as build variables
   too), then redeploy:

   | Variable                  | Value                                                                    |
   | ------------------------- | ------------------------------------------------------------------------ |
   | `NEXT_PUBLIC_INVITE_ONLY` | `true`: invite-only copy in Settings                                     |
   | `NEXT_PUBLIC_ACCESS_URL`  | Optional. Your payment link (Stripe, Gumroad, Ko-fi …)                   |
   | `AI_MODEL_DEEP`           | Optional. `claude-haiku-5-5` puts every AI feature on the cheapest model |
   | `AI_DAILY_LIMIT`          | Calls per person per day (default 20)                                    |

## Accounts

Run these on your own machine with `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SECRET_KEY` in `.env.local`. The secret key bypasses row-level
security, so never add it to the deployed app's variables.

```sh
pnpm users add friend@example.com
pnpm users list
pnpm users disable friend@example.com   # blocks sign-in, keeps their data
pnpm users enable friend@example.com
pnpm users remove friend@example.com    # deletes the account and its synced data
```

## Cost

All AI is opt-in and nothing calls a model on a normal training day. With
`AI_MODEL_DEEP=claude-haiku-5-5`, the most someone can cost you is
`AI_DAILY_LIMIT` Haiku calls a day; set the limit with your price in mind, and
set a monthly spend limit in the Anthropic console as a backstop.
