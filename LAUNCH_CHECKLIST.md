# BookDrop Launch Checklist

The single end-to-end runbook to flip BookDrop from build-stage to production (~30-60 min; Resend DKIM can add up to 24h). **Prereq:** migrations 001-008 live, R2 backups running, e-sig hardening (E1+E2+E3) shipped.

## Pre-launch verify

```powershell
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal
git pull origin master; npm install; npm run build; npx vitest run
```
- [ ] Build 0 errors · all tests pass · no conflicting local changes
- [ ] `scripts/verify-schema.sql` §8 shows all migrations applied

If any fail, **stop and investigate** before touching service config.

## Step 1 — Resend (~10 min, +24h if DKIM)

- **Account:** sign up at https://resend.com (free tier = 3,000/mo, 100/day). Settings → Team → Add domain. Use your own domain (recommended) or `onboarding@resend.dev` (OK for first 2 weeks).
- **Domain verify** (skip if using resend.dev): add SPF + DKIM at your DNS host → "Verify DNS" (5 min–24h). Then `RESEND_FROM_EMAIL=BookDrop <noreply@yourdomain>`.
- **API key:** Settings → API Keys → Create, name `bookdrop-production`, permission **Sending Access**. Copy the `re_...` (shown once).
- **Smoke test:** set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` in `.env.local`, then `npx tsx scripts/smoke-test-resend.ts your-test@example.com` → test email lands in <30s (else check Resend → Logs).
- [ ] Account created · domain verified (or resend.dev) · API key + smoke test passed

## Step 2 — Stripe (~15 min)

- **Account:** https://dashboard.stripe.com, **Test mode** for now (switch to Live only after Step 5 passes).
- **Products:** Add product `BookDrop Starter` / `$39 USD recurring monthly` → copy `price_...`. Add `BookDrop Pro` / `$79 USD recurring monthly` → copy `price_...`.
- **API keys:** Developers → API keys → copy `pk_test_...` + `sk_test_...`.
- **Webhook:** deferred to Step 4 (needs the live URL).
- **Smoke test:** set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` in `.env.local`, then `npx tsx scripts/smoke-test-stripe.ts` → opens a test Checkout URL → confirm Stripe's page loads (don't pay).
- [ ] Both products created · keys copied · smoke test creates a Checkout URL

## Step 3 — Vercel env vars (~5 min)

Dashboard → project → Settings → Environment Variables. Set ALL for **Production**:

| Variable | Value | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://PROJECT.supabase.co` | Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | API → anon (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | API → service_role (secret) |
| `RESEND_API_KEY` | `re_...` | Step 1 |
| `RESEND_FROM_EMAIL` | `BookDrop <noreply@yourdomain>` or `onboarding@resend.dev` | Step 1 |
| `STRIPE_SECRET_KEY` | `sk_test_...` (later `sk_live_...`) | Step 2 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Step 4 |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` (later `pk_live_...`) | Step 2 |
| `STRIPE_PRICE_STARTER` | `price_...` | Step 2 |
| `STRIPE_PRICE_PRO` | `price_...` | Step 2 |
| `CRON_SECRET` | (Vercel auto-generates) | Auto |
| `PUBLIC_APP_URL` | `https://bookkeeper-portal.vercel.app` (or custom domain) | n/a |
| `VITE_MODE` | `cloud` | **THE TRIGGER — set LAST**, after every other var |

After saving, Vercel auto-redeploys (or Deployments → ⋯ → Redeploy).
- [ ] All vars set · `VITE_MODE=cloud` set last · redeploy status Ready

## Step 4 — Stripe webhook (after deploy)

Stripe → Developers → Webhooks → Add endpoint:
- URL: `https://bookkeeper-portal.vercel.app/api/stripe/webhook` (or custom domain)
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Add endpoint → copy signing secret `whsec_...` → set `STRIPE_WEBHOOK_SECRET` in Vercel (auto-redeploys)
- [ ] Endpoint added · secret set · test event (`checkout.session.completed`) returns 200 OK in the log

## Step 5 — Production smoke test (~10 min)

Open https://bookkeeper-portal.vercel.app in **incognito**:
- [ ] **Demo banner GONE** (else `VITE_MODE` didn't apply — recheck env)
- [ ] Sign up → dashboard; verify `bookkeepers` row in Supabase
- [ ] Add client → verify `clients` row with `portal_token`
- [ ] Open `/upload/<TOKEN>` (new incognito) → upload a real bank PDF → verify `document_uploads` row has `auto_categorized_at`, `parsed_summary`, `categorization_summary`; portal shows "classified X of Y"
- [ ] Dashboard → client → Analysis tab shows categorization; change a category → verify `categorization_corrections` row
- [ ] Checkout `/checkout?plan=starter` → Stripe test card `4242 4242 4242 4242` → webhook fires → `bookkeepers.plan` = `starter`
- [ ] Manual reminder → Resend log shows the email
- [ ] E-sig: upload engagement letter → add 1-2 signatories → open invite URL (incognito) → ESIGN consent + sign → verify `signatures` + `engagement_letter_signatories` updated, `signature_email_log` shows confirmations
- [ ] Audit export `/api/audit/signature-log?engagementLetterId=...&bookkeeperId=...` → CSV downloads with all columns

If a step fails, the usual cause is a bad env var — check Vercel → Deployments → Latest → Functions logs.

## Step 6 — Switch Stripe to Live (only after Step 5 is 100%)

1. Stripe → toggle Live mode
2. Recreate both products in Live (test-mode products don't transfer) → new Live `price_...`
3. Get Live `sk_live_...` / `pk_live_...`
4. Update Vercel: `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`
5. Redo Step 4 in Live (new webhook + new `whsec_...`) → update `STRIPE_WEBHOOK_SECRET`
- [ ] Live products · Live keys/Price IDs set · Live webhook · one real test txn (refund yourself)

## Step 7 — Optional custom domain

Vercel → Settings → Domains → Add → update DNS (CNAME/A) → once "Configured + Active", update `PUBLIC_APP_URL` and the Stripe webhook endpoint.

## Final check

- [ ] No "Demo mode" at the live URL
- [ ] Real signup lands in Supabase
- [ ] Real upload triggers categorization → `document_uploads`
- [ ] Real reminder sends via Resend
- [ ] Real checkout fires the webhook
- [ ] Real e-sig completes with email confirmations
- [ ] Audit-log export downloads cleanly
- [ ] R2 backup ran today (`backups.log`)
- [ ] Restore drill #1 still on the calendar

All green → **BookDrop is launched.**

## Rollback

1. **Fastest:** flip `VITE_MODE=cloud` → `demo` in Vercel (~30s redeploy). No data lost — cloud rows stay, just unqueried.
2. **Schema:** run `scripts/ROLLBACK_004.sql` (+ E1/E2/E3 rollbacks) only if a migration broke. **Pre-launch only** — destroys data once real customers exist.
3. **Stripe:** revert `STRIPE_SECRET_KEY` to a Test key. New checkouts go to test mode.
4. **Resend:** unset `RESEND_API_KEY`. Email degrades to console.warn; signatures/reminders still complete.

## Ongoing maintenance

| Cadence | Task | Ref |
|---|---|---|
| Daily | Check `backups.log` success line | `scripts/SETUP_BACKUPS.md` |
| Weekly | Vercel function logs for errors | Vercel dashboard |
| Monthly | R2 bucket has ~30 dump files | Cloudflare R2 |
| Quarterly | Restore drill | `scripts/RESTORE_DRILL.md` |
| Annually | Rotate R2 + Resend + Stripe keys | Steps 1, 2 + R2 setup |
