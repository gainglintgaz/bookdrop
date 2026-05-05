# CURRENT_SPRINT.md — BookDrop
## Update this after EVERY task. This is how Claude Code knows what to do next.

Last updated: 2026-05-05
Sprint goal: Pass AI-first audit + finish off-platform backup pipeline + ship V1

---

## STATUS: V1 deploy on hold — AI-first pivot work required before launch

Demo mode still live at https://bookkeeper-portal.vercel.app. Production launch blocked on:

1. **AI-first architectural pivot** — current audit is 1/5 PASS (see `DATA_FLYWHEEL.md` §B). 16 intelligence engines must move from opt-in Analysis tab to default core flow. ~2-3 weeks of restructuring work.
2. **Outcomes + corrections capture (Phase A of data flywheel)** — schema additions + capture in core flow. Without this, the flywheel never starts spinning.
3. **R2 backup pipeline live** — script exists (`scripts/backup-pg-to-r2.ps1`); needs Cloudflare R2 bucket + Wrangler + Task Scheduler entry.
4. **Pre-launch bug checklist run** — 13 grep patterns from `.claude/rules/bug-checklist.md`.
5. **Service config still pending** — Supabase migrations, Resend account, Stripe products (unchanged from prior sprint).

---

## Decisions Log

| Date | Decision | Source |
|---|---|---|
| 2026-04-10 | Tax estimator archived per LEGAL_GUARDRAILS.md (requires PTIN). | Legal review |
| 2026-04-10 | Mobile responsive pass + dead-button audit + a11y fixes shipped. | Overnight polish session |
| 2026-04-10 | Code-split ClientDetailPage 670KB → 47KB; 21 → 48 tests. | Overnight polish session |
| 2026-05-05 | Reject "fold BookDrop into adjacent product as third account type" architecture. ~4 weeks of rewrite for ~$315/yr savings = negative ROI. | Founder decision |
| 2026-05-05 | Adopt 3-stage path: standalone V1 → adjacent-product probe (only if Stage 1 weak) → spin-out if proven. Recorded in `.claude/rules/strategic-roadmap.md`. | Founder directive |
| 2026-05-05 | Adopt universal `ai-first-principles.md` and `data-flywheel.md` from VictorForge factory. Per-project worksheet at `DATA_FLYWHEEL.md`. | Founder directive |
| 2026-05-05 | AI-first audit is mandatory pre-launch gate. BookDrop currently fails (1/5 PASS). Pivot work blocks V1 launch. | Audit run during this session, recorded in `DATA_FLYWHEEL.md` §B |
| 2026-05-05 | New rule files added: `bug-checklist.md` (§11 13-bug grep checklist), `strategic-roadmap.md` (3-stage path). `execution.md` Phase 7 gained live-verification gate + AI-first audit gate + flywheel-worksheet gate. | This session |
| 2026-05-05 | Off-platform backup pipeline scaffolded: `scripts/backup-pg-to-r2.ps1` + `scripts/RESTORE_DRILL.md`. Activation pending Cloudflare R2 bucket + Wrangler + Task Scheduler. | This session |
| 2026-05-05 | Adopt 5 logic-transferred patterns from Perplexity Computer launch (May 2026), adapted to CPA work — NOT financial advisory. Added to backlog: source-traceable everything (provenance UI), Client Tearsheet page, Workflow Library (12 CPA workflows), cross-client portfolio screen, native QBO/Xero integration. Explicitly excluded: investment recommendations, savings advice, asset allocation — Level 3 per LEGAL_GUARDRAILS.md, requires licensing not in scope for BookDrop. | Founder directive: pattern-transfer yes, scope-drift no |

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

### Tax Estimator (ARCHIVED — 2026-04-10)
- ~~TaxEstimatorPage~~ — archived; legal guardrails require licensed CPA review
- See LEGAL_GUARDRAILS.md for rationale; routes removed, HelpPage updated

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
- [x] Protected: /settings
- ~~Protected: /tax-estimator/*~~ — archived

### Overnight Polish (2026-04-10)
- [x] Task 1: Mobile responsive pass — hamburger drawer, table min-width + hidden cols, tab icons-only on mobile, form grids stack to 1-col, billing flex-wrap
- [x] Task 2: Dead button audit — fixed DashboardPage CTA to /clients/client-001, AppShell demo banner link verified
- [x] Task 3: Empty state verification — added client-solo-001 to demo data; fixed BusinessOwnerDashboard dead links (6 occurrences of /clients/demo-acme-supplies) using useAccountType().selfClientId; ClientDetailPage now respects ?tab= URL param
- [x] Task 4: Error handling audit — wired sendError state in MessagePanel (send failure was silently swallowed); all other catch blocks verified

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

## BEFORE V1 LAUNCH — blocking work (NOT deferable)

These cannot wait until "after deploy". They must complete before the public V1 ships:

- [ ] **AI-first architectural pivot** — see `V1_FEATURE_BACKLOG.md` row 1 + `DATA_FLYWHEEL.md` §D. ~2-3 weeks of restructuring.
- [ ] **Outcomes + corrections capture (Phase A of data flywheel)** — see `V1_FEATURE_BACKLOG.md` row 2 + `DATA_FLYWHEEL.md` §C. Schema additions + capture in core flow.
- [ ] **Pre-launch bug checklist run** — all 13 patterns from `.claude/rules/bug-checklist.md`, results documented in PR.
- [ ] **R2 backup pipeline live + Task Scheduler entry** — script exists at `scripts/backup-pg-to-r2.ps1`, drill doc at `scripts/RESTORE_DRILL.md`. Activation pending: Cloudflare R2 bucket creation, Wrangler install, Windows Task Scheduler entry, first successful upload verified in `backups.log`.
- [ ] **First quarterly restore drill scheduled** — within 30 days of going live.

## AFTER DEPLOY (polish — only safe to defer)

- [x] Mobile responsive pass — DONE
- [x] Dead button audit — DONE
- [x] Accessibility audit — DONE (aria-labels on icon buttons + tabs)
- [x] Code-split ClientDetailPage 670KB → 47KB — DONE
- [x] Test coverage 21 → 48 — DONE
- [ ] Test full flow: signup → add client → upload → dashboard → reminder → ZIP
- [ ] Test Stripe: upgrade → webhook → plan change → customer portal
- [ ] Add OG image (og:image meta tag — needs a designed image)
- [ ] Privacy-first analytics integration (optional)

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

### 4. Set Vercel env vars for cloud mode
- [ ] Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- [ ] Set RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- [ ] Set VITE_MODE=cloud (removes demo banner, activates live Supabase)
- [ ] After deploy: add Stripe webhook → https://your-domain/api/stripe/webhook

---

## NEXT SESSION START HERE:
1. Read `DATA_FLYWHEEL.md` §D for the AI-first pivot work plan — start with auto-categorization at upload moment (D.1).
2. Read `V1_FEATURE_BACKLOG.md` rows 1-2 for the engineering scope of the pivot + Phase A flywheel capture.
3. Run the `.claude/rules/bug-checklist.md` greps against current code; log hits in errors-fixed.json.
4. If founder is ready to wire R2: follow `scripts/RESTORE_DRILL.md` "Setup checklist" section, then test backup script with a fresh dev Supabase project.
