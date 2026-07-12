# Founder Env Checklist — BookDrop cloud launch

> **Owner:** Victor  
> **Code does not invent secrets.** Set these in Vercel Production (and `.env.local` for local cloud tests).  
> **Never commit real values.** Use `.env.example` placeholders only.

## Supabase (required for cloud mode)

| Variable | Where used | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser + build | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/_lib/supabase.ts` only | Server routes; never `VITE_` |

Documented live project (CURRENT_SPRINT): `mvvadmlivrpyawmlaqye` — re-confirm in dashboard before launch.

## Email — Resend (reminders + notify-upload)

| Variable | Where used | Without it |
|---|---|---|
| `RESEND_API_KEY` | `api/_lib/resend.ts` | `sendEmail` returns `{ success: false }` — no crash |
| `RESEND_FROM_EMAIL` | same | Defaults to `BookDrop <noreply@bookdrop.io>` |

Smoke: `npx tsx scripts/smoke-test-resend.ts you@example.com` (if script present)

## Stripe (billing)

| Variable | Where used | Without it |
|---|---|---|
| `STRIPE_SECRET_KEY` | `api/stripe/*` | Checkout returns 500 "Stripe not configured" |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Browser checkout UI | Upgrade button cannot open Stripe.js |
| `STRIPE_PRICE_STARTER` | create-checkout | 400 if plan starter missing price |
| `STRIPE_PRICE_PRO` | create-checkout | 400 if plan pro missing price |
| `STRIPE_WEBHOOK_SECRET` | `api/stripe/webhook.ts` | Webhooks rejected |

Products to create (Test mode first): Starter **$39/mo**, Pro **$79/mo**.

## App mode + public URL

| Variable | Value | Notes |
|---|---|---|
| `VITE_MODE` | `demo` \| `cloud` \| `local` | **Unset = demo.** Set `cloud` **last** after all other vars |
| `PUBLIC_APP_URL` | `https://bookkeeper-portal.vercel.app` | Emails / absolute links |
| `CRON_SECRET` | random string | Protects `api/cron/*` if required by route |

## Optional / later

| Variable | Purpose |
|---|---|
| R2 / backup credentials | `scripts/SETUP_BACKUPS.md` — off-platform pg_dump |
| Custom domain | After Vercel domain attach |

## Order of operations

1. Supabase keys on Vercel  
2. Resend + smoke email  
3. Stripe test products + keys + smoke checkout  
4. Stripe webhook → live URL after first deploy  
5. Set `VITE_MODE=cloud`  
6. Redeploy  
7. Run `scripts/CLOUD_SMOKE_TEST.md` end-to-end  

## API graceful failure (verified in code)

| Route area | Behavior without keys |
|---|---|
| Resend | Warn + `{ success: false }` |
| Stripe checkout | HTTP 500 clear error string |
| Cron reminders | Depends on auth/secret; will not send if Resend null |

## Blocked items only Victor can complete

- [ ] Create Resend account / domain / API key  
- [ ] Create Stripe products + copy price IDs  
- [ ] Paste all vars into Vercel Production  
- [ ] Flip `VITE_MODE=cloud`  
- [ ] Browser smoke on production URL  
