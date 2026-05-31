> **ARCHIVED SNAPSHOT — frozen 2026-04-06. Do NOT treat as current.**
> Much of this is stale (schema since grew to 13 tables and migrations 001-008 are
> live; tax features were archived to `archive/tax-features`; build-time `VITE_USER_TYPE`
> was replaced by runtime account-type detection). Kept for historical context only.
> **Live onboarding sources:** `CLAUDE.md`, `CURRENT_SPRINT.md`, `golden-paths.md`,
> `.claude/rules/*.md`. See `KNOWLEDGE_TRANSFER.md` for the live pointer.

# BookDrop — Complete Knowledge Transfer (ARCHIVED)
# Last updated: 2026-04-06
# Use this to onboard any AI assistant (Gemini, Claude, etc.) to this project

---

## PRODUCT IDENTITY

**Name**: BookDrop (bookdrop.io)
**Tagline**: The bookkeeping brain that organizes everything before your bookkeeper sees it.
**What it is**: A document collection + financial intelligence portal for solo bookkeepers and small business owners.
**White-label chassis**: Same codebase serves 5 verticals via `tenant.config.ts` — bookkeeping (primary), estate sales, equine, HOA, cleaning services.

---

## BUSINESS MODEL

### Pricing Tiers
- **Free**: Up to 3 clients, no reminders, no ZIP download
- **Starter ($39/mo)**: Up to 15 clients, auto-reminders, ZIP download
- **Pro ($79/mo)**: Unlimited clients, late-rate insights, white-label email

### Future: Local Mode (V2)
- **One-time $799**: Tauri desktop app, SQLite, Gemma 4 local AI, zero recurring fees, 100% private
- Not built yet — deferred to V2

### Revenue Targets
- 100 paying bookkeepers at $39/mo = $3,900 MRR
- Each bookkeeper has 5-50 clients, creating network effects
- Tax season (Jan-Apr) is highest acquisition window

---

## TECH STACK

```
Frontend:     React 19 + TypeScript (strict) + Vite 8
Styling:      Tailwind CSS v4 (NO shadcn/ui components installed yet — using raw Tailwind)
State:        Zustand with selectors (NEVER bare useStore())
Backend:      Supabase (Postgres + Auth + Storage + Edge Functions)
Email:        Resend (transactional)
Payments:     Currently Stripe (considering Lemon Squeezy for lower fees)
Hosting:      Vercel (https://bookkeeper-portal.vercel.app)
PDF Parsing:  pdfjs-dist (client-side)
OCR:          Tesseract.js v7 (client-side, lazy-loaded WASM)
ZIP:          JSZip (client-side)
Testing:      Vitest + React Testing Library
```

**IMPORTANT**: This is a Vite + React SPA. NOT Next.js. No "use client" directives. No server components. No App Router. Plain React Router v7.

---

## ARCHITECTURE: TWO DOORS, ONE PRODUCT

### Mode System (`src/lib/mode.ts`)
- `VITE_MODE`: 'demo' (current default) | 'local' | 'cloud'
- `VITE_USER_TYPE`: 'bookkeeper' (default) | 'business-owner'

### Bookkeeper Mode (Primary)
Full client management: add clients → set document requirements → clients get magic-link portal → upload docs → bookkeeper sees progress, runs analysis, exports.

### Business Owner / Finance Prep Mode
Self-service: upload own statements → AI categorizes → generate ready-to-send package for bookkeeper → save hours off their bill.

### Demo Mode
In-memory data (Maps, arrays). No Supabase calls. 5 demo clients pre-loaded. Used as sales tool / product pitch. Every page works without API keys.

---

## DATABASE SCHEMA (7+ tables)

```sql
bookkeepers          — The paying practitioner (auth.users ref)
clients              — Their clients (never log in, use portal_token)
document_requirements — What docs each client must submit per month
document_uploads     — Actual uploaded files
reminder_schedules   — When to auto-send reminders (day_of_month)
reminder_log         — Audit trail of all emails sent
messages             — Two-way in-app messaging
notifications        — System event notifications
```

### Key Design Decisions
- Clients NEVER create accounts — they use a 12-char `portal_token` magic link
- RLS on everything: `bookkeeper_id = auth.uid()`
- Storage path: `{bookkeeper_id}/{client_id}/{year}/{month}/{requirement_id}/{filename}`
- Document types: `bank | credit_card | receipt | payroll | other`
- Files in Supabase Storage private bucket, signed URLs (1hr expiry)

---

## SUPABASE PROJECT

- **Project ID**: mvvadmlivrpyawmlaqye
- **Region**: us-east-1
- **URL**: https://mvvadmlivrpyawmlaqye.supabase.co
- **Migration**: `supabase/migrations/001_initial_schema.sql` (not yet applied)
- **Status**: Project created, schema NOT deployed yet

---

## FILE STRUCTURE

```
src/
├── App.tsx                    — Router (12 routes)
├── pages/                     — 12 page components
│   ├── LandingPage.tsx        — Marketing landing page
│   ├── LoginPage.tsx          — Auth (demo mode bypass)
│   ├── SignupPage.tsx         — Auth (demo mode bypass)
│   ├── DashboardPage.tsx      — Bookkeeper dashboard
│   ├── BusinessOwnerDashboard.tsx — Finance Prep mode
│   ├── ClientDetailPage.tsx   — Full client view (4 tabs: docs, analysis, activity, export)
│   ├── UploadPage.tsx         — Public client upload portal
│   └── SettingsPage.tsx       — Account + plan settings
├── components/
│   ├── client/                — Client-facing (FileDropzone, RequirementRow)
│   ├── practitioner/          — Bookkeeper panels (15 components)
│   └── shared/                — Layout, notifications, messages (8 components)
├── lib/                       — 30 engine files (ALL client-side)
├── hooks/                     — useAppMode, useClients, usePlanGating
├── stores/                    — auth.store.ts (Zustand)
└── types/                     — index.ts, messages.ts
api/                           — Vercel serverless functions
├── cron/auto-reminders.ts     — Daily cron
├── send-reminder.ts           — Manual reminder
├── notify-upload.ts           — Upload notification
├── stripe/                    — Checkout, portal, webhook
└── _lib/                      — Supabase admin, Resend, email templates
supabase/migrations/           — SQL schema
```

---

## 16 INTELLIGENCE ENGINES (All Client-Side, No API Keys)

| # | Engine | File | What It Does |
|---|--------|------|--------------|
| 1 | Statement Parser | `parse-bank-statement.ts` | Parses PDFs (bank, credit card, payroll, mortgage, utility) into structured transactions |
| 2 | Receipt Scanner | `receipt-scanner.ts` | Camera/upload → image processing → Tesseract.js OCR → extract amount/date/vendor |
| 3 | Auto-Categorizer | `categorization-engine.ts` | 200+ vendor mappings, fuzzy matching, IRS deduction flags, suspicious item detection |
| 4 | Category Memory | `category-memory.ts` | localStorage learning — remembers user corrections per vendor |
| 5 | Tax Intelligence | `tax-intelligence.ts` | 14 IRS deduction categories, 1099 tracking, quarterly estimates, sales tax, alerts |
| 6 | Trend Analysis | `trend-analysis.ts` | Month-over-month comparisons, category/vendor trends, growth rate, spike detection |
| 7 | Cash Flow Forecast | `cash-flow-forecast.ts` | 3-month prediction, recurring items, seasonal patterns, runway calculation |
| 8 | Duplicate Detector | `duplicate-detector.ts` | Finds duplicate transactions, missing recurring items, unusual amounts (z-score) |
| 9 | Expense Policy | `expense-policy.ts` | Configurable rules engine — max per transaction, blocked categories, violations |
| 10 | Reconciliation | `reconciliation.ts` | 3-signal matching (amount, date, fuzzy vendor), split matches, confidence scoring |
| 11 | Completeness Check | `completeness-check.ts` | Document readiness scoring — required docs, file quality, balance continuity |
| 12 | Client Scoring | `client-scoring.ts` | A+ to F reliability rating (on-time rate, completeness, response time) |
| 13 | Insights Generator | `insights.ts` | Spending analysis, vendor frequency, anomalies, compliance/savings advice |
| 14 | Workflow Engine | `workflow-engine.ts` | Orchestrates full pipeline: parse → categorize → tax → audit → readiness |
| 15 | Meeting Agenda | `meeting-agenda.ts` | Auto-generates client check-in agendas with talking points |
| 16 | Finance Prep | `finance-prep.ts` | HTML report generator — the "bookkeeper-ready package" |

---

## EXPORT FORMATS

| Format | Target Software | File |
|--------|----------------|------|
| IIF | QuickBooks Desktop | `export-qb.ts` |
| CSV | QuickBooks Online | `export-qb.ts` |
| Xero CSV | Xero | `export-qb.ts` |
| OFX | Any bank software | `export-qb.ts` |
| Journal Entries | Double-entry accounting | `export-qb.ts` |
| Month Status CSV | Excel/Sheets | `export-csv.ts` |
| Teams/Slack Summary | Team chat | `export-csv.ts` |
| ICS Calendar | Outlook/Google/Apple | `calendar.ts` |
| ZIP Bundle | Any | `download-zip.ts` |
| HTML Package | Email to bookkeeper | `finance-prep.ts` |

---

## COMMUNICATION SYSTEM

### What Works Now
- **In-app messaging**: Bookkeeper ↔ client chat with file attachments, read receipts, 10s polling
- **Email reminders**: 3 escalation tones (friendly/professional/firm), auto-cron daily via Resend
- **Upload notifications**: Bookkeeper gets email when client uploads
- **Activity feed**: Timeline of all events (uploads, reminders, messages)

### What Does NOT Exist
- No Zoom/Teams/Webex/Google Meet integration
- No Gmail/Outlook/ProtonMail direct integration (reminders use Resend, client replies go to bookkeeper's reply-to email)
- No real-time WebSocket chat (uses polling)
- No SMS (Twilio not integrated yet, mentioned in plan but not built)

---

## WHAT'S BUILT AND WORKING (as of 2026-04-06)

### ✅ Complete
- Full landing page with feature showcase
- Auth flow (login/signup with demo mode bypass)
- Bookkeeper dashboard with stats, action items, activity feed
- Business Owner dashboard with Finance Prep
- Client management (add, edit, list, detail)
- Public upload portal (magic-link, drag-drop, progress tracking)
- All 16 intelligence engines wired into Analysis tab
- Receipt scanner with Tesseract.js OCR
- 10 export formats
- In-app messaging (demo mode in-memory)
- Notification center + inbox badge
- Finance Prep one-click package generator
- Settings page with plan management
- Calendar integration (.ics downloads)
- Completeness scoring + readiness checks

### ⚠️ Built But Not Connected to Live Backend
- Supabase schema written but not applied to database
- Email templates written but Resend not configured
- Stripe checkout/portal/webhook code exists but no keys
- Cron job code exists but not deployed to Vercel

### ❌ Not Built Yet
- Tax Estimator (refund/liability calculator) — NEXT TO BUILD
- Expanded document types (W-2, 1099 variants, 1040, 1098)
- TurboTax/H&R Block tax-line CSV export
- Tauri desktop app (Local Mode)
- SQLite local database
- Gemma 4 local AI
- SMS reminders
- Real-time WebSocket chat
- Third-party calendar sync (only .ics download)
- Zoom/Teams/Gmail/Outlook integrations

---

## CURRENT DEPLOYMENT

- **URL**: https://bookkeeper-portal.vercel.app
- **Mode**: Demo (VITE_MODE=demo)
- **Vercel Project**: victors-projects-10ac4001/bookkeeper-portal
- **Build**: `tsc -b && vite build` — zero errors
- **Last deploy**: 2026-04-05

---

## ENV VARS NEEDED FOR CLOUD MODE

```env
VITE_SUPABASE_URL=https://mvvadmlivrpyawmlaqye.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...  (already set)
VITE_MODE=cloud                                    (currently: demo)
VITE_USER_TYPE=bookkeeper                          (or: business-owner)
RESEND_API_KEY=re_...                              (not set)
STRIPE_SECRET_KEY=sk_live_...                      (not set)
STRIPE_WEBHOOK_SECRET=whsec_...                    (not set)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...            (not set)
VITE_POSTHOG_KEY=phc_...                           (optional)
```

---

## COST ANALYSIS (Current Monthly)

| Service | Cost | Notes |
|---------|------|-------|
| Vercel | $0 (Hobby) | Free tier, 100GB bandwidth |
| Supabase | $0 (Free) | 500MB DB, 1GB storage, 50K auth users |
| Resend | $0 (Free) | 3,000 emails/month |
| Domain | ~$12/year | Not purchased yet |
| **Total** | **$0/mo** | Until scaling past free tiers |

### At Scale
| 100 users | Cost |
|-----------|------|
| Vercel Pro | $20/mo |
| Supabase Pro | $25/mo |
| Resend Pro | $20/mo (50K emails) |
| Domain | $1/mo |
| **Total** | **~$66/mo** |

### Revenue at 100 users
- 100 × $39 (Starter) = $3,900/mo
- **Margin: ~98%**

---

## VERSION ROADMAP

### V1 (Current — Cloud Web App)
- Everything listed above
- Tax Estimator (being built now)
- Launch target: This week (tax season)

### V1.1 (Post-launch)
- Real-time chat (WebSocket)
- SMS reminders (Twilio)
- Lemon Squeezy payment integration
- State tax calculations
- More document type support

### V2 (Desktop / Local Mode)
- Tauri desktop app (.exe/.dmg)
- SQLite local database
- Gemma 4 local AI insight layer
- Hybrid local/cloud sync
- $799 one-time pricing
- 100% private mode (no data leaves device)

### V3 (Platform)
- Multi-vertical marketplace
- White-label API for other SaaS
- CPA firm tier (multi-bookkeeper)
- Mobile app (React Native)

---

## CODING RULES (from CLAUDE.md — enforce these)

1. **NEVER use bare useStore()** — always `useStore(state => state.field)`
2. **NEVER use TypeScript `as` casting** to silence errors
3. **NEVER store amounts as floats** (use cents for money)
4. **NEVER hardcode** values that belong in `tenant.config.ts`
5. **NEVER use .single()** when result might be null — use `.maybeSingle()`
6. **This is Vite/React** — no "use client", no server components, no App Router
7. **ParsedTransaction has NO `type` field** — derive it: `amount >= 0 ? 'credit' : 'debit'`
8. **noUnusedLocals: true, noUnusedParameters: true** — TypeScript is strict
9. **Build verification**: `npx tsc -b` (zero errors) → `npx vite build` → `npx vercel --prod --force`
10. **Demo mode** uses module-level Maps/arrays for in-memory persistence during session

---

## GEMINI SESSION PROPOSALS (context for continuity)

Gemini proposed these features across sessions — track their status:

| Proposal | Status | Notes |
|----------|--------|-------|
| Finance Prep branding | ✅ Done | BusinessOwnerDashboard + finance-prep.ts |
| useAppMode hook | ✅ Done | src/hooks/useAppMode.ts |
| Tesseract.js OCR | ✅ Done | receipt-scanner.ts + ReceiptScannerPanel.tsx |
| One-click package button | ✅ Done | BusinessOwnerDashboard.tsx |
| Wire NotificationCenter | ✅ Done | AppShell.tsx |
| Wire ActivityFeed | ✅ Done | DashboardPage.tsx |
| Wire WorkflowResultPanel | ✅ Done | ClientDetailPage.tsx |
| Wire MessagePanel | ✅ Done | ClientDetailPage.tsx |
| Tax Estimator | 🔨 Building | Tax refund/liability calculator |
| Expanded doc types | 🔨 Building | W-2, 1099, 1040, 1098 |
| Tauri desktop app | ❌ V2 | Deferred |
| SQLite local DB | ❌ V2 | Deferred |
| Gemma 4 local AI | ❌ V2 | Deferred |
| Hybrid sync | ❌ V2 | Deferred |

---

## SOCIAL MEDIA LAUNCH STRATEGY

**Target**: Tax season 2026 (April — extended deadline)
**Channels**: Facebook bookkeeping groups, r/bookkeeping, r/smallbusiness, r/taxpros, QuickBooks forums, LinkedIn
**Angle**: "AI tax brain that feeds your bookkeeper" — free tier, tax estimator as viral hook
**Differentiator**: All intelligence runs client-side (privacy), organized packages save bookkeeper hours

---

## HOW TO START A NEW SESSION

1. Point the AI to this file: `KNOWLEDGE_TRANSFER.md`
2. Also read: `CLAUDE.md`, `CURRENT_SPRINT.md`, `golden-paths.md`
3. Run `npx tsc -b` to verify build health
4. Check `src/lib/mode.ts` for current mode
5. The plan file is at: `.claude/plans/soft-riding-quail.md` (7-phase integration plan — all phases complete)

---

*Generated by Claude. Updated 2026-04-06.*
