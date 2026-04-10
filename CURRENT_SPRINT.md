# CURRENT_SPRINT.md — BookDrop
## Update this after EVERY task. This is how Claude Code knows what to do next.

Last updated: 2026-04-06
Sprint goal: Ship V1 — connect services, deploy, go live

---

## STATUS: CODE COMPLETE — Awaiting service configuration + deploy

---

## DONE ✓

### Project Setup
- [x] Vite + React 19 + TypeScript (strict) + Tailwind v4 scaffolded
- [x] All dependencies installed (Supabase, Zustand, React Router, Lucide, Vitest, JSZip, Stripe, Resend, Tesseract.js, pdfjs-dist)
- [x] Path aliases configured (@/ → src/)
- [x] Tailwind theme with project colors
- [x] .env template + .env.local with Supabase credentials

### Database & Types
- [x] Supabase migration 001 — 10 tables + RLS + views + storage bucket + indexes
- [x] Supabase migration 002 — account_type, business_name, self_client_id (dual-audience)
- [x] TypeScript types (src/types/index.ts) — all DB, enriched, form, API types + AccountType + SoloPlan
- [x] Tenant config (src/lib/tenant.config.ts) — 5 verticals
- [x] computeSubmissionStatus + getMissingDocuments

### Core Infrastructure
- [x] Supabase client (src/lib/supabase.ts)
- [x] Database helpers (src/lib/db.ts)
- [x] Utilities (src/lib/utils.ts) — cn, toCents, fromCents, portalToken, formatters
- [x] Auth store (src/stores/auth.store.ts) — signUp, signUpSolo, demo mode for both personas
- [x] useClients hook
- [x] usePlanGating hook — enforces free/starter/pro limits
- [x] useAccountType hook — runtime practitioner/solo detection
- [x] useAppMode hook — runtime mode + account type
- [x] sendManualReminder function — logs to reminder_log
- [x] downloadUploadsAsZip — client-side ZIP via JSZip

### Shared Components
- [x] LoadingSpinner, ErrorState
- [x] ProtectedRoute
- [x] AppShell with adaptive sidebar nav (practitioner vs solo)
- [x] StatusBadge (green/yellow/red/gray)
- [x] MonthSelector
- [x] NotificationCenter, InboxBadge

### Client Upload Page (public, no auth)
- [x] /upload/:token route
- [x] FileDropzone (drag-and-drop + click)
- [x] RequirementRow (upload status, file info, re-upload)
- [x] Full flow: loading → error → progress → requirements → completion banner

### Bookkeeper Auth
- [x] LoginPage, SignupPage (with practitioner/solo toggle), ForgotPasswordPage

### Bookkeeper Dashboard
- [x] Summary stats (complete/partial/not started/missing)
- [x] Month selector
- [x] Client table with progress bars
- [x] Copy portal link, view detail, send reminder buttons
- [x] Plan limit banner + locked "Add Client" when at limit
- [x] Empty state with CTA

### Business Owner Dashboard (Solo)
- [x] BusinessOwnerDashboard — financial snapshot, quick actions
- [x] Runtime routing via DashboardRouter (useAccountType)

### Client Management
- [x] AddClientPage — full form + requirements builder + auto reminder schedules
- [x] EditClientPage — pre-populated, add/remove/reorder requirements, deactivate toggle
- [x] ClientDetailPage — month nav, per-requirement status, file download, reminder history
- [x] 16 intelligence engines (parser, reconciliation, categorization, tax intelligence, etc.)
- [x] ZIP download, send reminder, edit, copy portal link

### Tax Estimator
- [x] TaxEstimatorPage hub — personal vs business separation
- [x] PersonalTaxEstimatorPage — W-2, investments, dependents, credits
- [x] BusinessTaxEstimatorPage — Schedule C, S-Corp, QBI, quarterly estimates

### Settings
- [x] Profile, reminder tone, notification preferences, plan management

### Landing Page
- [x] Hero, How It Works, Features Grid, Social Proof stats, Pricing, CTA, Footer

### API Routes (Vercel Serverless Functions)
- [x] api/cron/auto-reminders.ts — daily cron, dedup via reminder_log, 3 tones × escalation
- [x] api/send-reminder.ts — manual reminder trigger from dashboard
- [x] api/notify-upload.ts — notifies bookkeeper on client upload
- [x] api/stripe/create-checkout.ts — Stripe Checkout session creation
- [x] api/stripe/webhook.ts — signature verification, plan updates on sub events
- [x] api/stripe/portal.ts — Stripe Customer Portal session
- [x] api/_lib/supabase.ts — server-side admin client (service_role)
- [x] api/_lib/resend.ts — email sending wrapper
- [x] api/_lib/email-templates.ts — reminder, upload notification, welcome HTML templates

### Deployment Config
- [x] vercel.json — SPA rewrites, cron schedule (daily 14:00 UTC), security headers
- [x] index.html — OG meta tags, Twitter Card, theme-color, proper title
- [x] Route code-splitting — main bundle 257KB (was 1,437KB), lazy-loaded per page
- [x] Favicon (public/favicon.svg)

### Dual-Audience (Practitioner + Solo)
- [x] Migration 002 — account_type column + self_client_id
- [x] SignupPage — toggle between Bookkeeper/CPA and Business Owner
- [x] Auth store — signUpSolo() auto-creates client row, links self_client_id
- [x] AppShell — adaptive nav (Clients vs My Business, Messages hidden for solo)
- [x] Runtime dashboard routing (DashboardRouter component)
- [x] Demo data for both personas (demoBookkeeper + demoSoloUser)

### E-Signatures (2026-04-06)
- [x] Migration 003 — engagement_letters + signatures tables with RLS
- [x] pdf-lib installed (npm install pdf-lib)
- [x] api/sign-document.ts — portal_token validation, pdf-lib embeds signature image + audit text, uploads signed PDF to documents bucket
- [x] src/components/portal/SignatureCanvas.tsx — Canvas-based signature pad with mouse/touch support, base64 PNG export
- [x] src/components/portal/EngagementLetterRow.tsx — shows letter, signature pad if unsigned, "Signed ✓" badge if signed
- [x] src/pages/UploadPage.tsx — engagement letters section above document uploads
- [x] src/pages/ClientDetailPage.tsx — engagement letters section in Documents tab, PDF upload UI, signed/unsigned status

### Bug Audit Fixes (2026-04-06)
- [x] ZIP download gated to Starter/Pro plans only (was visible to free users)
- [x] Intelligence engine data gates — empty state when no statements uploaded, limited-data warning on trend panels with < 3 months
- [x] category-memory.ts bare catch{} replaced with console.warn + error object
- [x] email-templates.ts clipboard fallback catches now log with console.warn

### Testing
- [x] 21 unit tests passing (utils + type computations)
- [x] Build passes (tsc + vite build) — 0 type errors

### Routing
- [x] Public: /, /upload/:token, /login, /signup, /forgot-password
- [x] Protected: /dashboard, /clients, /clients/new, /clients/:id, /clients/:id/edit
- [x] Protected: /tax-estimator, /tax-estimator/personal, /tax-estimator/business
- [x] Protected: /settings

---

## BLOCKED ON USER (service accounts + secrets)

### 1. Run Supabase Migrations (~10 min)
- [ ] Go to https://supabase.com/dashboard/project/mvvadmlivrpyawmlaqye → SQL Editor
- [ ] Paste + run `supabase/migrations/001_initial_schema.sql`
- [ ] Paste + run `supabase/migrations/002_account_type.sql`
- [ ] Paste + run `supabase/migrations/003_esignatures.sql`
- [ ] Verify Storage → `documents` bucket exists (private, 50MB)
- [ ] Copy service_role key from Settings → API

### 2. Create Resend Account (~5 min)
- [ ] Go to https://resend.com → Create account → API Keys → Create key
- [ ] Add sending domain OR use onboarding@resend.dev for testing

### 3. Create Stripe Products (~15 min)
- [ ] Go to https://dashboard.stripe.com → Products
- [ ] Create "BookDrop Starter" — $39/mo recurring → copy Price ID
- [ ] Create "BookDrop Pro" — $79/mo recurring → copy Price ID
- [ ] Copy publishable key + secret key from Developers → API keys

### 4. Deploy to Vercel (~5 min)
- [ ] Go to https://vercel.com/new → Import repo
- [ ] Set env vars (see .env.local comments for full list)
- [ ] Deploy
- [ ] After deploy: add Stripe webhook → https://your-domain/api/stripe/webhook
- [ ] Copy webhook signing secret into Vercel env vars

---

## AFTER DEPLOY (polish)

- [ ] Test full flow: signup → add client → upload → dashboard → reminder → ZIP
- [ ] Test Stripe: upgrade → webhook → plan change → customer portal
- [ ] Mobile responsive pass (dashboard, upload page, client detail)
- [ ] Add OG image (og:image meta tag — needs a designed image)
- [ ] PostHog analytics integration (optional)

---

## NEXT SESSION START HERE:
→ If migrations are run: switch VITE_MODE=cloud, test end-to-end
→ If Stripe is configured: test checkout flow
→ If deployed: run full smoke test
