# CURRENT_SPRINT.md — BookDrop
## Update this after EVERY task. This is how Claude Code knows what to do next.

Last updated: 2026-05-12
Sprint goal: Land V1.1 features + finalize manual launch steps (R2 backups + Resend + Stripe + Vercel env vars)

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
| 2026-05-06 | Source-provenance UI shipped (commit 30bc3a3): Provenance component + 4-panel integration + 14 tests, focused on the k=N anti-fabrication invariant. Tests 48 → 62. | Pre-pivot deliverable, technical groundwork done |
| 2026-05-06 | AI-first pivot Phase A shipped across 4 commits (ea9b6b8, 99ca2ea, 02556f8, a5ccae8): Migration 004 schema + types + auto-categorize-on-upload + correction-capture UX + Trust Ladder LOCKED gates on TrendAnalysisPanel + CashFlowForecastPanel. Categorization no longer waits for Analysis-tab opt-in; runs at upload moment. Every correction now lands in `categorization_corrections` table (or localStorage in demo). Trust Ladder enforced: features that need 3+ months of data hard-lock at <2 months and show PREVIEW banner at 2 months, never fabricate. | DATA_FLYWHEEL.md §D.1-§D.5 + §E Trust Ladder |
| 2026-05-06 | E-signature audit run (read-only). Honest verdict: proof-of-concept only. 10 gaps identified including no multi-signer support, no per-page placement, no AcroForm fields, no ESIGN consent disclosure, no email confirmations, no user-agent logging, no rate limiting, single-page signature only. NOT production-ready for real CPA workflows (W-9s, joint returns, fillable IRS forms). Logged as HIGH priority in V1_FEATURE_BACKLOG.md. ~2-3 weeks of work to close gaps. | Honest audit, no scope creep — fixing requires explicit founder direction |
| 2026-05-06 | Pre-launch blocker roadmap planned (`C:\Users\vtbsj\.claude\plans\glimmering-singing-sunrise.md`) — 4 blocks: schema activation, R2 backup activation, e-sig hardening (3 phases), service config. Founder approved + executed in this session. | Plan approved + executed |
| 2026-05-06 | **Block 0 SHIPPED (commit e671cb7)** — fixed 7 TypeScript build errors (3 type fixes + 4 unused-import cleanups), made migration 002 idempotent (wrapped ALTERs with IF NOT EXISTS), added demo branch to api/sign-document.ts. Build/tests baseline restored. | Pre-existing issues cleaned up |
| 2026-05-06 | **Block 1 SHIPPED (commit cef860d)** — schema activation tooling: scripts/verify-schema.sql (8-section diagnostic), scripts/CLOUD_SMOKE_TEST.md (8-step user runbook), scripts/ROLLBACK_004.sql (additive-only rollback + nuclear option). User runs migrations on the existing build-stage Supabase project (no separate staging — there's no real data yet). | Schema-deployment tooling ready |
| 2026-05-06 | **Block 2 SHIPPED (commit 1a7f403)** — R2 backup activation runbook: scripts/SETUP_BACKUPS.md covering Cloudflare R2 bucket creation, Wrangler install, pg_dump install, env vars (with the pooler-vs-direct-connect footgun called out), Task Scheduler entry, restore drill calendar entry. | Backup pipeline activation tooling ready |
| 2026-05-06 | **Block 3 Phase E1 SHIPPED (commit 4e53c84)** — legal-grade single-signer hardening: migration 005 (signatures + user_agent + consent + attempt_id; signature_email_log; signature_attempts), src/lib/esign-disclosures.ts (versioned ESIGN/UETA copy), src/components/portal/ESignConsentScreen.tsx (3-stage signing flow with disclosure), api/sign-document.ts hardening (atomic ordering, rate limit 5/hr, user_agent capture, confirmation emails via Resend with 1-hour signed PDF URLs). 11 new tests. | 7/10 e-sig audit gaps closed |
| 2026-05-06 | **Block 3 Phase E2 SHIPPED (commit 5b4bee9)** — multi-signer + per-page placement: migration 006 (engagement_letter_signatories + backfill + signatures.signatory_id + engagement_letters.fully_signed_at), api/sign-document.ts accepts both portalToken (legacy) and signatoryToken (multi-signer) with per-page placement loop, api/invite-signatories.ts (new endpoint with idempotent reminder mode), api/_lib/email-templates.ts (signatoryInviteEmailHtml with role-aware copy), src/components/practitioner/EngagementLetterEditor.tsx (form-based multi-recipient UX). | 10/10 e-sig audit gaps closed (3 from E2) |
| 2026-05-06 | **Block 3 Phase E3 SHIPPED (commit eb76d5c)** — AcroForm + initials + audit export: migration 007 (signatures.initials_image_data + filled_form_fields + signature_audit_view), src/lib/pdf-form-detect.ts (detectFormFields + fillAndFlattenForm), api/audit/signature-log.ts (CSV export with 18 columns + UTF-8 BOM for Excel + RFC 4180 escaping). 11 new tests. | All 10 audit gaps closed |
| 2026-05-06 | **Block 4 SHIPPED (commit 3b95c37)** — service config tooling: LAUNCH_CHECKLIST.md (7-step end-to-end runbook), scripts/smoke-test-resend.ts (sends a test email + reports), scripts/smoke-test-stripe.ts (creates a Checkout Session in test or live mode with safety warnings). User runs the checklist when ready to flip VITE_MODE=cloud in Vercel. | Pre-launch tooling complete; user-manual work remaining |
| 2026-05-06 | **PRE-LAUNCH ROADMAP COMPLETE** — 9 commits this session (e671cb7 → 3b95c37). Tests: 62 → 84 (added 22). Build clean throughout. Demo mode preserved end-to-end. Migrations 002 idempotent + 005, 006, 007 all additive. All 4 pre-launch blockers cleared on the code side; remaining work is manual user runbooks (Block 1 SQL + Block 2 R2 setup + Block 4 launch checklist). | Code-side pre-launch work done |
| 2026-05-06 | **Visual SignaturePlacementDesigner SHIPPED (commit 62a7e12)** — completes multi-signer story. PDF render via pdfjs-dist, click-to-drop placement markers per signatory, lazy-loaded so most signing flows skip the heavy chunk. | Phase E2/E3 UX gap closed |
| 2026-05-06 | **ai-first-principles §10 SHIPPED (commit 4f3c8ad)** — added 6 sub-rules for AI integration: stable tool interface, tier the work, tool-call billing tracking, citations on every claim, benchmark before default, no silent fallback chains. | Factory rule augmented |
| 2026-05-12 | **Migrations 004-008 APPLIED LIVE (commit 74c6825)** — via Supabase MCP against project mvvadmlivrpyawmlaqye. 13 tables (was 8), all RLS, bucket private, security advisors green. `src/types/supabase.ts` regenerated from live schema. Migration 008 (advisor fixes) added: security_invoker on view, pinned function search_path, REVOKE EXECUTE from anon on SECURITY DEFINER functions, REVOKE SELECT on materialized view, deny-all policy on signature_attempts, drop dup index. | Phase 1 LIVE — no more manual SQL pasting needed |
| 2026-05-12 | **V1.1 Client Tearsheet shipped** — `/clients/:clientId/tearsheet` route + page. Loop-12-gated sparkline (renders LOCKED until 12 close_cycle_outcomes for that client). All numbers traced to source via Provenance component. Linked from ClientDetailPage header. | Perplexity-pattern transfer (company tearsheet → client tearsheet) |
| 2026-05-12 | **V1.1 Workflow Library scaffolding shipped** — `src/lib/workflows/registry.ts` with 12 CPA workflows (close, tax-data-prep, audit, compliance, onboarding, comms). `WorkflowLibraryPanel.tsx` renders cards with `live` / `preview` / `planned` status badges. Trust-Ladder-gated workflows show honest LOCKED copy. Tests: workflow integrity + LEGAL_GUARDRAILS forbidden-phrase check. | Perplexity "35 workflows" pattern transfer; foundation for D.1-D.5 wiring |
| 2026-05-12 | **GitHub Actions CI shipped** — `.github/workflows/ci.yml` runs `npm run build` + `vitest run` on every push/PR + the pre-launch bug-checklist 13-pattern advisory job. CI catches regressions before merge. | Production hygiene |
| 2026-05-12 | **Bug checklist run (13 patterns)** — 1 real hit: fictional formula description `recurringDetector(vendor, cycleDays=25..32)` in AuditReportPanel adapter didn't match real implementation. Fixed: now reads `vendorsInPrevMonth − vendorsInCurrentMonth (fuzzy match ≥ 0.7)`. All other patterns clean (tax-estimator hits are archived feature, year hits are legitimate fallbacks + copyright + demo data). | Honesty-strings pass before launch |
| 2026-05-12 | **VictorForge factory sync** — 3 new factory rules ported into BookDrop (`aggregate-design.md`, `data-protection.md`, `self-reflection.md`). Rule count: 14 → 16. Platform mirrors regenerated (AGENTS.md, .cursor/rules, GEMINI.md, .windsurfrules, PERPLEXITY_SPACE_INSTRUCTIONS.md). Factory onboarding script `onboard-existing-project.ps1` has a PowerShell syntax error (duplicate `else` branches around line 89) — worked around manually, logged as [FACTORY-CHANGE-CANDIDATE]. | Cross-project factory v4.3 prep |

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
