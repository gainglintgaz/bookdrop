# BookDrop Launch Checklist

> **Purpose:** the single end-to-end runbook for going live. After Blocks 0-3 are shipped, this is the last 30-60 minutes of work to flip BookDrop from build-stage to production.
>
> **Prerequisite:** all migrations 001-007 applied to live Supabase (Block 1 complete), R2 backup pipeline running (Block 2 complete), all e-sig hardening shipped (Block 3 E1+E2+E3 complete).
>
> **Time required:** ~30-60 min total, depending on Resend domain verification (Resend sometimes auto-verifies in seconds; sometimes takes 24h for DKIM propagation).

---

## Pre-launch verification (before anything else)

Open a fresh PowerShell:

```powershell
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal
git pull origin master
npm install   # in case dependencies changed
npm run build
npx vitest run
```

- [ ] Build exits with 0 errors
- [ ] All tests pass (84+ at time of writing)
- [ ] No uncommitted local changes that would conflict with deploy
- [ ] `scripts/verify-schema.sql` Section 8 shows all 7 migrations applied

If any of these fail, **stop here** and investigate before proceeding to service config.

---

## Step 1 — Resend setup (~10 min, sometimes +24h for DKIM)

### 1a. Account
1. Sign up at https://resend.com (free tier covers 3,000 emails/month + 100/day — more than enough for V1 launch)
2. Settings → Team → Add domain
3. Choose: **Send from a domain you own** (recommended) OR **Use onboarding@resend.dev** (acceptable for first 2 weeks)

### 1b. Domain verification (skip if using onboarding@resend.dev)
1. Add SPF + DKIM records as shown by Resend (your domain registrar's DNS panel — Cloudflare, Namecheap, etc.)
2. Click "Verify DNS" — usually clears within 5 min, sometimes 24h
3. Once verified, set `RESEND_FROM_EMAIL=BookDrop <noreply@bookdrop.io>` (or your domain) in env vars later

### 1c. API key
1. Settings → API Keys → Create new
2. Name: `bookdrop-production`
3. Permission: **Sending Access** (Full Access not needed)
4. Copy the `re_...` key — Resend shows it once

### 1d. Smoke test locally
1. Set `RESEND_API_KEY=re_...` and `RESEND_FROM_EMAIL=...` in `.env.local`
2. Run:
   ```powershell
   npx tsx scripts/smoke-test-resend.ts your-test-email@example.com
   ```
3. Confirm a "BookDrop test email" lands in the test inbox within 30 sec
4. If failure, check Resend dashboard → Logs for the rejection reason

- [ ] Resend account created
- [ ] Sending domain verified (or temporarily using onboarding@resend.dev)
- [ ] API key generated + smoke test passed

---

## Step 2 — Stripe setup (~15 min)

### 2a. Stripe account
1. Sign up / sign in at https://dashboard.stripe.com
2. **Use Test mode for now** (toggle top-right). Switch to Live mode only after end-to-end verification.

### 2b. Create products
1. Products → Add product
   - Name: `BookDrop Starter`
   - Description: `Up to 15 clients, auto-reminders, ZIP downloads`
   - Pricing: `$39 USD / Recurring monthly`
   - **Save** → copy the `price_...` ID into a notes file
2. Add product
   - Name: `BookDrop Pro`
   - Description: `Unlimited clients, late-rate insights, white-label email`
   - Pricing: `$79 USD / Recurring monthly`
   - **Save** → copy the `price_...` ID

### 2c. API keys
1. Developers → API keys
2. Copy:
   - `pk_test_...` (publishable, browser-safe)
   - `sk_test_...` (secret, server-only)

### 2d. Webhook setup (after deployment, see Step 4)
We'll come back here once Vercel has deployed the production app. The webhook needs the live URL.

### 2e. Smoke test locally
1. Set in `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_STARTER=price_...
   STRIPE_PRICE_PRO=price_...
   ```
2. Run:
   ```powershell
   npx tsx scripts/smoke-test-stripe.ts
   ```
3. The script will create a Checkout Session in test mode and print the URL
4. Open the URL → confirm Stripe's hosted checkout page loads → close (don't actually pay)

- [ ] Both products created (`price_...` IDs in your notes)
- [ ] Publishable + secret keys copied
- [ ] Smoke test creates a Checkout URL successfully

---

## Step 3 — Vercel environment variables (~5 min)

### 3a. Open Vercel dashboard
https://vercel.com/dashboard → Your project → Settings → Environment Variables

### 3b. Set ALL of these for `Production` environment

| Variable | Value | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase → Settings → API → anon (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Supabase → Settings → API → service_role (secret) |
| `RESEND_API_KEY` | `re_...` | Step 1c |
| `RESEND_FROM_EMAIL` | `BookDrop <noreply@yourdomain>` or `onboarding@resend.dev` | Step 1b |
| `STRIPE_SECRET_KEY` | `sk_test_...` (or `sk_live_...` once switching to live) | Step 2c |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (set after Step 4) | Step 4 below |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` (or `pk_live_...`) | Step 2c |
| `STRIPE_PRICE_STARTER` | `price_...` | Step 2b |
| `STRIPE_PRICE_PRO` | `price_...` | Step 2b |
| `CRON_SECRET` | (Vercel auto-generates this — leave blank if Vercel says so) | Auto |
| `PUBLIC_APP_URL` | `https://bookkeeper-portal.vercel.app` (or your custom domain) | n/a |

### 3c. Critical last variable

| Variable | Value | Notes |
|---|---|---|
| `VITE_MODE` | `cloud` | **THIS IS THE TRIGGER** that switches the production deploy from demo to live. Set this LAST after every other variable is in place. |

### 3d. Trigger redeploy

After saving env vars, Vercel will auto-redeploy. Or force it: Deployments tab → ⋯ menu on the latest deploy → Redeploy.

- [ ] All 12 env vars set
- [ ] `VITE_MODE=cloud` is the last one set
- [ ] Vercel redeployed (build status: Ready)

---

## Step 4 — Stripe webhook (after deploy)

Now that the production URL is live, set up the webhook.

1. Stripe dashboard → Developers → Webhooks → **Add endpoint**
2. Endpoint URL: `https://bookkeeper-portal.vercel.app/api/stripe/webhook` (or your custom domain)
3. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click **Add endpoint** → copy the signing secret (`whsec_...`)
5. Set `STRIPE_WEBHOOK_SECRET=whsec_...` in Vercel env vars (Production environment)
6. Vercel auto-redeploys

- [ ] Webhook endpoint added in Stripe
- [ ] Signing secret set in Vercel
- [ ] Test event sent (Stripe dashboard → Webhooks → click endpoint → Send test event → `checkout.session.completed`) → confirm 200 OK in the webhook log

---

## Step 5 — Production smoke test (~10 min)

This validates everything works end-to-end against the live Supabase + Stripe + Resend.

Open https://bookkeeper-portal.vercel.app in **incognito** (no cached state):

- [ ] **Demo banner GONE.** If you still see "Demo mode" anywhere, `VITE_MODE` didn't take effect — re-check Vercel env.
- [ ] Sign up flow: click "Get started" → fill form → submit → redirected to dashboard
- [ ] Verify in Supabase: `bookkeepers` table has your new row with the email you used
- [ ] Add a client → verify `clients` row inserted with portal_token
- [ ] Open `https://bookkeeper-portal.vercel.app/upload/<TOKEN>` in another incognito window
- [ ] Upload a real bank statement PDF
  - Verify in Supabase: `document_uploads` row inserted with `auto_categorized_at`, `parsed_summary`, `categorization_summary` populated
  - Verify the client portal shows "We classified X of Y transactions"
- [ ] Open dashboard → click client → Analysis tab → categorization shows
  - Click a category → dropdown opens → pick a different one → verify `categorization_corrections` row in Supabase
- [ ] Trigger a checkout: click "Upgrade to Starter" or hit `/checkout?plan=starter`
  - Stripe-hosted page loads → fill Stripe's test card `4242 4242 4242 4242` (any future date, any CVC)
  - Complete checkout → Vercel webhook fires → verify `bookkeepers.plan` updates to `starter` in Supabase
- [ ] Send a manual reminder → verify Resend log shows the email
- [ ] Sign an engagement letter (multi-signer flow):
  - Upload an engagement letter as the bookkeeper
  - Add 1-2 signatories via EngagementLetterEditor
  - Open the invite email's signing URL in another incognito window
  - Accept ESIGN consent → draw signature → submit
  - Verify `signatures` + `engagement_letter_signatories` rows updated, `signature_email_log` shows confirmation emails sent
- [ ] Download audit log: `https://bookkeeper-portal.vercel.app/api/audit/signature-log?engagementLetterId=...&bookkeeperId=...` → CSV downloads with all expected columns

If any step fails, the most common issue is a misconfigured env var. Check the Vercel function logs (Deployments → Latest → Functions tab → click the failing function).

- [ ] All 12 smoke-test bullets pass

---

## Step 6 — Switch Stripe to Live mode (when ready to take real money)

Only do this AFTER Step 5 passes 100%.

1. Stripe dashboard → toggle Live mode (top-right)
2. Re-do Step 2b (create the same two products in Live mode — the test-mode products don't transfer)
3. Get new Live API keys (`sk_live_...`, `pk_live_...`) and Live Price IDs
4. Update Vercel env vars:
   - `STRIPE_SECRET_KEY=sk_live_...`
   - `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
   - `STRIPE_PRICE_STARTER=price_live_...`
   - `STRIPE_PRICE_PRO=price_live_...`
5. Re-do Step 4 in Live mode (new webhook endpoint with new signing secret)
6. Update `STRIPE_WEBHOOK_SECRET` to the live `whsec_...`
7. Vercel auto-redeploys

- [ ] Live mode products created
- [ ] Live API keys + Price IDs set in Vercel
- [ ] Live webhook configured
- [ ] One real test transaction completed (use your own card, refund yourself)

---

## Step 7 — Optional: custom domain

1. Vercel dashboard → Project → Settings → Domains → Add
2. Enter your domain (e.g. `bookdrop.app`)
3. Update DNS as instructed (CNAME or A record at your registrar)
4. Once Vercel shows "Configured" + "Production: Active", update `PUBLIC_APP_URL` env var
5. Update Stripe webhook endpoint to use the new domain

---

## Final check

- [ ] Demo at https://bookkeeper-portal.vercel.app no longer shows "Demo mode"
- [ ] Real signup works and lands in Supabase
- [ ] Real upload triggers categorization and stores in `document_uploads`
- [ ] Real reminder sends via Resend
- [ ] Real Stripe checkout fires the webhook
- [ ] Real e-sig flow completes with email confirmations
- [ ] Audit-log export downloads cleanly
- [ ] R2 backup ran today (check `backups.log`)
- [ ] Calendar entry for restore drill #1 still scheduled

If everything is green: **BookDrop is launched.**

---

## Rollback plan

If anything breaks in production:

1. **Quickest fix**: flip `VITE_MODE=cloud` → `VITE_MODE=demo` in Vercel. Vercel auto-redeploys to demo mode in ~30 seconds. No data is destroyed; cloud-mode rows stay in Supabase, just aren't queried.

2. **Schema rollback**: only run `scripts/ROLLBACK_004.sql` (and the analogous E1/E2/E3 rollbacks if needed) if a migration broke. Pre-launch only — once real customers exist, schema rollbacks lose data.

3. **Stripe issue**: switch `STRIPE_SECRET_KEY` back to a Test mode key. Live transactions stay valid; new checkouts go to test mode.

4. **Resend issue**: temporarily unset `RESEND_API_KEY`. Email sending degrades to console.warn; signatures and reminders still complete (signatures are valid even when email confirmations fail).

---

## Post-launch ongoing maintenance

| Cadence | Task | Reference |
|---|---|---|
| Daily | Glance at `backups.log` for yesterday's success line | `scripts/SETUP_BACKUPS.md` |
| Weekly | Check Vercel function logs for unexpected errors | Vercel dashboard |
| Monthly | Eyeball R2 bucket for ~30 dump files | Cloudflare R2 |
| Quarterly | Execute restore drill | `scripts/RESTORE_DRILL.md` |
| Annually | Rotate R2 + Resend + Stripe API keys | This file Step 1c, 2c, R2 setup |
