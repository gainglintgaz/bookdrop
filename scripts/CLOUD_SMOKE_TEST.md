# Cloud-Mode Smoke Test

> **Purpose:** validate that BookDrop works end-to-end against a live Supabase project with all 4 migrations applied. Run this **before** flipping the production deployment to `VITE_MODE=cloud`.
>
> **Time required:** 20-30 min for the full pass.
>
> **Prerequisite:** `scripts/verify-schema.sql` ran clean — Section 8 shows ✓ exists for every Migration 004 object, Section 5 shows RLS enabled on every table, Section 7 shows the `documents` bucket as private.

---

## Setup (~5 min)

1. **Open** `.env.local` in the project root.
2. **Set the cloud connection variables**:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   VITE_MODE=cloud
   ```
   Get these from Supabase dashboard → Settings → API.
3. **Save the file**. (Do NOT commit — `.env.local` is gitignored.)
4. **Stop any running dev server** and start fresh:
   ```bash
   npm run dev
   ```
5. **Open** http://localhost:5199 in an incognito window (no cached demo state).

You should see the public landing page. The "Demo (Practitioner)" / "Demo (Solo)" banners should NOT appear (those only render when `isDemoMode` is true).

---

## Step 1 — Practitioner signup (~2 min)

- [ ] Navigate to `/signup`
- [ ] Toggle = "Bookkeeper / CPA" (default)
- [ ] Fill in: full name, practice name, email (use a real address you can check), password
- [ ] Submit

**Verify in Supabase dashboard → Table Editor → `bookkeepers`**:
- [ ] One new row with the email you just entered
- [ ] `account_type = 'practitioner'`
- [ ] `self_client_id` is NULL
- [ ] `created_at` is now-ish

If signup fails, check the browser console for errors. Common issues:
- 401: anon key wrong → re-copy from Supabase dashboard
- "relation bookkeepers does not exist": migration 001 didn't apply → re-run

---

## Step 2 — Add a client (~3 min)

- [ ] You should land on `/dashboard` after signup
- [ ] Click "Add Client"
- [ ] Business name: `Acme Test Co`
- [ ] Contact name: `Test Contact`
- [ ] Contact email: a real email you can check (could be the same as signup)
- [ ] Add 2 document requirements:
  - "Chase Business Checking" — type: bank
  - "Amex Business Card" — type: credit_card
- [ ] Click Save

**Verify in Supabase**:
- [ ] `clients` table has 1 row, `bookkeeper_id` matches your `bookkeepers.id`
- [ ] `clients.portal_token` is a 12-char string
- [ ] `document_requirements` has 2 rows linked to that client

---

## Step 3 — Public portal upload (auto-categorization MUST run) (~5 min)

The single most important smoke test. This is what proves Phase A flywheel works in cloud mode.

- [ ] Copy the client's `portal_token` from the dashboard (or from `clients.portal_token` in Supabase)
- [ ] Open a new browser window/tab (NOT incognito of the same session — clean window)
- [ ] Navigate to `http://localhost:5199/upload/<TOKEN>`
- [ ] You should see the public upload portal — no auth required
- [ ] Drop a real bank statement PDF (or CSV) into the "Chase Business Checking" requirement

**Verify in the UI**:
- [ ] After upload completes, an emerald-green receipt card appears: "We classified X of Y transactions"
- [ ] If the upload was a real bank statement that the parser handles, X > 0

**Verify in Supabase `document_uploads` table**:
- [ ] One new row exists
- [ ] `auto_categorized_at` is a timestamp (NOT null) — this is the key field
- [ ] `auto_categorization_confidence` is one of `high` / `medium` / `low`
- [ ] `parsed_summary` JSON contains `bankName`, `transactionCount`, etc.
- [ ] `categorization_summary` JSON contains `totalCategorized`, `highConfidence`, `byCategory`, etc.

**If `auto_categorized_at` is NULL after a bank-statement upload**:
- The parser may have failed (file format unsupported)
- Check browser console for `[autoCategorizeUpload]` warnings
- This is NON-BLOCKING — the upload itself succeeded and the bookkeeper can categorize manually in the Analysis tab

---

## Step 4 — Bookkeeper view of categorization + provenance (~3 min)

- [ ] Back in the bookkeeper window, navigate to `/clients/<CLIENT_ID>?tab=analysis`
- [ ] Click the "Categorization" sub-section
- [ ] You should see the transactions table with categories
- [ ] **Hover over the category cell** — a small icon appears
- [ ] **Click the icon** — provenance popover opens, showing source type + confidence
- [ ] Categories are clickable — clicking opens a dropdown to correct

**Verify in Supabase**:
- [ ] No `categorization_corrections` rows yet (you haven't corrected anything)

---

## Step 5 — Categorization correction (Phase A flywheel write) (~2 min)

The other key Phase A test.

- [ ] In the categorization table, find a transaction with the wrong category
- [ ] Click the category cell → dropdown → pick a different category
- [ ] You should see an emerald checkmark next to the corrected category

**Verify in Supabase `categorization_corrections` table**:
- [ ] **One new row** with:
  - `bookkeeper_id` = your bookkeeper.id
  - `client_id` = the client you're viewing
  - `original_category` = what the engine guessed
  - `corrected_category` = what you chose
  - `original_confidence` = the engine's confidence
  - `status = 'applied'`
  - `applied_at` timestamp now-ish

If this row didn't appear, the cloud-mode write failed. Check:
- Browser console for `[recordCorrection]` warnings
- Supabase logs for the insert query

---

## Step 6 — Reminder (~2 min)

- [ ] Back to the dashboard
- [ ] Find the "Acme Test Co" client row
- [ ] Click the "Send reminder" icon button (paper-plane)

**Verify in Supabase `reminder_log`**:
- [ ] One new row with `client_id`, `bookkeeper_id`, `period_year`, `period_month`, `triggered_by = 'manual'`
- [ ] `resend_email_id` may be null (Resend not configured yet — that's fine for this smoke test)

---

## Step 7 — Engagement letter signing (DEMO MODE TEST) (~3 min)

This step validates the demo branch added in Block 0. It's a quick sanity check that `VITE_MODE=cloud` doesn't break the demo flow.

- [ ] Stop the dev server
- [ ] Set `VITE_MODE=demo` in `.env.local`
- [ ] Restart `npm run dev`
- [ ] In incognito, go to a demo upload page (use a known demo token like `aB3xK9mP2qRt`)
- [ ] If there's an engagement letter, sign it
- [ ] Should succeed with "demo: true" in the response (no DB write)

---

## Step 8 — Demo mode regression check (~2 min)

- [ ] With `VITE_MODE=demo`, visit http://localhost:5199
- [ ] Demo banner appears at the top
- [ ] Sign in as the demo practitioner (auto-login)
- [ ] Dashboard loads with 5 demo clients
- [ ] Click any client → Documents tab loads → Analysis tab loads
- [ ] **Click a category to correct it** — UI updates locally (writes to localStorage in demo)
- [ ] Reload the page — correction persists (localStorage demo write succeeded)

---

## Cleanup

- [ ] Set `VITE_MODE=demo` in `.env.local` (or delete the cloud entries entirely)
- [ ] Stop the dev server
- [ ] **Do not commit** `.env.local` changes

The test data in your live Supabase project (the `Acme Test Co` client + signatures + corrections) is harmless and useful as a backup-pipeline target later. You can delete it manually if you want a clean slate before launch day.

---

## Acceptance gate

The Block 1 smoke test passes when ALL of these are checked:

- [ ] Step 1: bookkeepers row in live DB
- [ ] Step 2: clients + document_requirements rows in live DB
- [ ] Step 3: document_uploads row WITH `auto_categorized_at` populated AND `parsed_summary` + `categorization_summary` JSONB populated
- [ ] Step 4: categorization table renders, provenance popovers work
- [ ] Step 5: categorization_corrections row written on correction
- [ ] Step 6: reminder_log row written
- [ ] Step 7: demo signing returns mock-success without DB hit
- [ ] Step 8: demo mode unchanged after VITE_MODE flip back

If anything fails, stop and investigate before proceeding to Block 2 (R2 backup) or Block 4 (production env vars).
