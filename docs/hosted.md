# Running a hosted copy for other people

Gainpath is free to self-host: your own Cloudflare, Supabase and Anthropic
accounts, as in the README's Deploy section. If you'd rather run one copy and
let friends pay you for an account on it, deploy it the same way and switch it
to invite-only.

Nobody can create their own account. When someone pays, you add their email;
they open Settings, enter that email and type in the code they receive. Or give
them a password instead (`--password` below) and skip email entirely.

There are two plans. **AI** accounts use your Anthropic key, capped per person
per day. **Basic** accounts get everything else (planning, progression, swaps,
sync) and can't use AI even if they switch it on: the server refuses their AI
calls. You decide the price of each.

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
   | `AI_REQUIRES_PLAN`        | `true`: only accounts on the AI plan can use AI                          |
   | `AI_MODEL_DEEP`           | Optional. `claude-haiku-5-5` puts every AI feature on the cheapest model |
   | `AI_DAILY_LIMIT`          | Calls per person per day (default 20)                                    |

## Accounts

Run these on your own machine with `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SECRET_KEY` in `.env.local`. The secret key bypasses row-level
security, so never add it to the deployed app's variables.

```sh
pnpm users add you@example.com --ai     # your own account, AI included
pnpm users add friend@example.com       # basic plan, no AI
pnpm users add other@example.com --password   # prints a password to pass on
pnpm users password friend@example.com  # set or reset a password, printed once
pnpm users plan friend@example.com ai   # upgrade (or `basic` to downgrade)
pnpm users list
pnpm users disable friend@example.com   # blocks sign-in, keeps their data
pnpm users enable friend@example.com
pnpm users remove friend@example.com    # deletes the account and its synced data
```

Supabase's built-in email only reaches members of your Supabase organization
and sends a couple of emails an hour, so friends won't get sign-in codes until
you add your own SMTP under Authentication → Emails. Passwords work without it:
they sign in from Settings → "Sign in with a password instead".

## Cost

All AI is opt-in and nothing calls a model on a normal training day. With
`AI_MODEL_DEEP=claude-haiku-5-5`, the most someone can cost you is
`AI_DAILY_LIMIT` Haiku calls a day; set the limit with your price in mind, and
set a monthly spend limit in the Anthropic console as a backstop.
