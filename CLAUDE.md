# CLAUDE.md — BookkeeperPortal
## Read this + CLAUDE_AUTONOMY_PROTOCOL.md before every session

## Intelligence Feed (check BEFORE choosing what to build)
Read [INTEL_FEED.md](./INTEL_FEED.md) — auto-routed findings from the intelligence engine. If there are PENDING items, present them to Victor first: "You have {N} pending intel items for BookDrop. Top priority: {title}. Act on this, or work on something else?"

## What we're building
A document collection portal for solo bookkeepers. Bookkeepers add clients; each client gets a unique link to upload monthly documents (bank statements, receipts, payroll); the bookkeeper sees who's submitted and who's late; auto-reminders go out on a schedule; everything is downloadable as ZIP.

Built on a **universal white-label chassis** (`src/lib/tenant.config.ts`) so one codebase serves multiple verticals — bookkeeping (primary), estate sales, HOA boards, any professional collecting recurring client documents. Core logic never branches on vertical, only on config values. Active vertical via `VITE_TENANT_VERTICAL`.

## Product name
Primary: **BookDrop** (bookdrop.io). White-label: tenant name replaces all branding via tenant.config.ts.

## Tech stack
React 18 + TypeScript (strict) + Vite · Tailwind + shadcn/ui · Zustand (selectors, no bare `useStore()`) · Supabase (Postgres + Auth + Storage + Edge Functions) · Resend + React Email · Stripe (Checkout + Webhooks + Portal) · Vercel · Vitest + RTL · JSZip (client-side ZIP) · PostHog.

## Database, RLS, storage
Full per-column schema, RLS policies, and storage layout: **see [SCHEMA.md](./SCHEMA.md)**. Core tables: `bookkeepers`, `clients`, `document_requirements`, `document_uploads`, `reminder_schedules`, `reminder_log` (live DB adds messaging / notifications / e-sig / categorization tables via migrations 004-008). RLS on every table (`bookkeeper_id = auth.uid()`); public upload page is identified by `portal_token` with no auth, inserted by a service-role function that validates the token first.

## Pricing
- Free: ≤3 clients, no reminders, no ZIP
- Starter ($39/mo): ≤15 clients, auto-reminders, ZIP download
- Pro ($79/mo): unlimited clients, late-rate insights, white-label email-from

## Insight layer (ship from day 1, even basic)
Per client: `late_rate` (% of months everything's on time), most_reliable / most_time_consuming client, `average_submission_day` (actual vs due). Surface on dashboard — after 3 months the bookkeeper sees patterns they've never seen. This generates referrals.

## Tracking files
- Current status → [CURRENT_SPRINT.md](./CURRENT_SPRINT.md)
- Bug log w/ root cause → `errors-fixed.json`
- Proven patterns → [golden-paths.md](./golden-paths.md)
- Onboarding pointer → [KNOWLEDGE_TRANSFER.md](./KNOWLEDGE_TRANSFER.md)

## Legal guardrails (MANDATORY — read [LEGAL_GUARDRAILS.md](./LEGAL_GUARDRAILS.md))
**Philosophy:** Show data. Never tell users what to do with it.
1. **Level 1 (build freely):** tracking, categorization, totals, exports, benchmarks
2. **Level 2 (add disclaimer):** estimation calculators, flagging thresholds, what-if scenarios
3. **Level 3 (never build):** "You should deduct…", "File Form…", "Invest in…", moving money

**Banned phrases (financial context):** "You should", "We recommend", "Deduct this on", "File Form", "Adjust your", "Consider [financial action]", "Tax advice", "Financial advisor".
**Safe alternatives:** observations ("Categorized as: Office Expense"), flags ("1099 threshold reached for this vendor"), data ("Net cash flow: $X this month").
**Before building anything touching money/taxes/recommendations:** check LEGAL_GUARDRAILS.md for the Level; Level 2 → add the disclaimer template; Level 3 → refuse + explain.
**Archived tax features:** `archive/tax-features` branch holds the tax estimator + tax intelligence engine. Restore only with Level 2 disclaimers (or once Victor has a PTIN) and only after reviewing LEGAL_GUARDRAILS.md.

## Architectural decisions (LOCKED)
1. Client upload page uses `portal_token`, NOT Supabase auth — clients never create accounts
2. Files in Supabase Storage (not base64 in DB, not third-party)
3. ZIP generation is client-side via JSZip — no server-side generation
4. Reminder cron is a Supabase Edge Function, NOT an external cron service
5. Reminders sent via Resend with the bookkeeper's reply-to — never a no-reply address
6. Money: Stripe amounts in cents; convert to display values at the component level
7. Vertical config is static at build time (env var), not runtime DB config in V1

## Do NOT do these (learned the hard way on FinKeel)
- No bare `useStore()` — always `useStore(state => state.specificField)`
- No TypeScript `as` casting to silence type errors
- No floats for amounts, anywhere
- Don't pull plan/mode from global state inside save functions — pass at the call site
- Don't apply side effects (labels, status changes) before the batch is confirmed successful
- No `.single()` when the result might be null — use `.maybeSingle()`
- Don't hardcode any value that belongs in tenant.config.ts

## UX-first development (full details: [UX-FIRST-CHECKLIST.md](./UX-FIRST-CHECKLIST.md))
1. **Build outside-in:** UI/experience layer FIRST, then engines/APIs. Never deploy invisible features.
2. **5-second rule:** before every deploy, open in incognito — can a stranger understand the product in 5 seconds?
3. **Discoverable:** if a user can't find it without reading source, it doesn't exist.
4. **Empty states mandatory:** every page explains itself when there's no data.
5. **Demo mode = sales tool:** treat sample data as the product pitch.
6. **Every nav link works:** no dead redirects, placeholder pages, or broken routes.
7. **Pre-deploy UX smoke check:** first impression, discovery, navigation, empty states, demo quality, value visibility — all pass before sharing a URL.

**The AI Slop Trap:** 2,000 lines of backend feels productive, but if the 50 lines of UI that introduce the product don't exist, the app looks like an empty mock. After each session ask: "If I deleted all backend logic and kept only what's on screen, would this impress someone?"
