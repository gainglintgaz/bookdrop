# CLAUDE.md — BookkeeperPortal
## Read this + CLAUDE_AUTONOMY_PROTOCOL.md before every session

---

## WHAT WE'RE BUILDING

A document collection portal for solo bookkeepers. Bookkeepers add clients,
clients get a unique link to upload their monthly documents (bank statements,
receipts, payroll reports), bookkeeper sees who's submitted and who's late,
auto-reminders go out on a schedule, everything downloadable as ZIP.

Built on a universal white-label chassis so the same codebase serves:
- Bookkeepers collecting monthly financial documents (primary vertical)
- Estate sale companies collecting consignment agreements and photos
- HOA boards collecting compliance documents from homeowners
- Any professional who needs clients to regularly submit documents

---

## THE PRODUCT NAME

Primary: **BookDrop** (bookdrop.io or similar)
White-label: tenant name replaces all branding via tenant.config.ts

---

## TECH STACK

```
Frontend:     React 18 + TypeScript (strict) + Vite
Styling:      Tailwind CSS + shadcn/ui components
State:        Zustand with selectors (no bare useStore())
Backend:      Supabase (Postgres + Auth + Storage + Edge Functions)
Email:        Resend (transactional) + React Email (templates)
Payments:     Stripe (Checkout + Webhooks + Customer Portal)
Hosting:      Vercel
Testing:      Vitest + React Testing Library
File DL:      JSZip (client-side ZIP generation)
Analytics:    PostHog (self-hosted or cloud)
```

---

## THE UNIVERSAL CONFIG SYSTEM

src/lib/tenant.config.ts controls all vertical-specific behavior.
Every UI element that varies by vertical reads from this config.
The core logic never branches on vertical — only on config values.

```typescript
// Current active vertical: bookkeeping
// To switch vertical: change VITE_TENANT_VERTICAL in .env
```

---

## DATABASE — ALL TABLES

### bookkeepers (practitioners / the paying customer)
- id UUID PK (auth.users ref)
- email TEXT UNIQUE
- full_name TEXT
- practice_name TEXT
- reply_to_email TEXT
- plan TEXT — 'free' | 'starter' | 'pro'
- stripe_customer_id TEXT
- stripe_subscription_id TEXT
- reminder_tone TEXT — 'friendly' | 'professional' | 'firm'
- created_at TIMESTAMPTZ

### clients (the bookkeeper's clients — never log in)
- id UUID PK
- bookkeeper_id UUID FK → bookkeepers (RLS: bookkeeper can only see own clients)
- business_name TEXT NOT NULL
- contact_name TEXT
- contact_email TEXT NOT NULL
- portal_token TEXT UNIQUE NOT NULL (12-char random — the magic link key)
- notes_private TEXT (bookkeeper only)
- notes_for_client TEXT (shown on upload page)
- is_active BOOLEAN DEFAULT true
- created_at TIMESTAMPTZ

### document_requirements (what documents each client must submit)
- id UUID PK
- client_id UUID FK → clients CASCADE DELETE
- label TEXT NOT NULL — e.g. "Chase Business Checking — April statement"
- doc_type TEXT — 'bank' | 'credit_card' | 'receipt' | 'payroll' | 'other'
- required BOOLEAN DEFAULT true
- sort_order INT DEFAULT 0

### document_uploads (actual files submitted by clients)
- id UUID PK
- requirement_id UUID FK → document_requirements
- client_id UUID FK → clients (denormalized for query performance)
- bookkeeper_id UUID FK → bookkeepers (denormalized for RLS)
- period_year INT NOT NULL
- period_month INT NOT NULL (1-12)
- filename_original TEXT NOT NULL
- storage_path TEXT NOT NULL (Supabase Storage path)
- file_size_bytes BIGINT
- uploaded_at TIMESTAMPTZ DEFAULT now()

### reminder_schedules (when to send reminders each month)
- id UUID PK
- client_id UUID FK → clients CASCADE DELETE
- day_of_month INT NOT NULL (1, 5, 10)
- reminder_number INT NOT NULL (1=initial, 2=followup, 3=escalation)
- is_active BOOLEAN DEFAULT true

### reminder_log (audit trail of all emails sent)
- id UUID PK
- client_id UUID FK → clients
- bookkeeper_id UUID FK → bookkeepers
- period_year INT NOT NULL
- period_month INT NOT NULL
- sent_at TIMESTAMPTZ DEFAULT now()
- reminder_number INT NOT NULL
- triggered_by TEXT — 'auto' | 'manual'
- resend_email_id TEXT (delivery tracking)

---

## RLS POLICIES (enforce on every table)

- bookkeepers: users can only read/write their own row
- clients: bookkeeper_id = auth.uid()
- document_requirements: via client → bookkeeper_id = auth.uid()
- document_uploads: bookkeeper_id = auth.uid()
- reminder_schedules: via client → bookkeeper_id = auth.uid()
- reminder_log: bookkeeper_id = auth.uid()
- Public upload page: uses portal_token to identify client — NO auth required
  Upload function runs as service role, validates portal_token exists before inserting

---

## STORAGE STRUCTURE

Bucket: documents (private)
Path: {bookkeeper_id}/{client_id}/{year}/{month}/{requirement_id}/{filename}
Access: signed URLs only, generated server-side, expire in 1 hour

---

## PRICING TIERS

- Free: up to 3 clients, no reminders, no download ZIP
- Starter ($39/mo): up to 15 clients, auto-reminders, ZIP download
- Pro ($79/mo): unlimited clients, late-rate insights, white-label email from address

---

## INSIGHT LAYER (include from day 1, even basic version)

late_rate per client: what % of months this client submits everything on time
most_reliable_client: the one with highest on-time rate
most_time_consuming: the one with worst late rate
average_submission_day: which day of the month they actually submit vs due date

Surface these on dashboard. After 3 months, bookkeeper sees patterns
they have never seen before. This is what generates referrals.

---

## CURRENT SPRINT

See CURRENT_SPRINT.md

---

## ERRORS FIXED

See errors-fixed.json

---

## GOLDEN PATHS

See golden-paths.md

---

## ARCHITECTURAL DECISIONS (LOCKED)

1. Client upload page uses portal_token, NOT Supabase auth — clients never create accounts
2. Files stored in Supabase Storage (not base64 in DB, not third-party)
3. ZIP generation happens client-side with JSZip — no server-side generation
4. Reminder cron runs as Supabase Edge Function, NOT external cron service
5. All reminders sent via Resend with bookkeeper's reply-to — not from a no-reply address
6. Monetary values: Stripe amounts in cents, display values converted at component level
7. Vertical config is static at build time (env var), not runtime database config in V1

---

## DO NOT DO THESE (learned the hard way on FinKeel)

- Do NOT use bare useStore() — always useStore(state => state.specificField)
- Do NOT use TypeScript `as` casting to silence type errors
- Do NOT store amounts as floats anywhere
- Do NOT pull plan/mode from global state inside save functions — pass at call site
- Do NOT apply side effects (labels, status changes) before batch is confirmed successful
- Do NOT use .single() when result might be null — use .maybeSingle()
- Do NOT hardcode any value that should be in tenant.config.ts

---

## UX-FIRST DEVELOPMENT (learned the hard way on BookDrop)

See UX-FIRST-CHECKLIST.md for full details. Summary of non-negotiable rules:

1. **Build outside-in**: UI/experience layer FIRST, then engines/APIs. Never deploy invisible features.
2. **5-second rule**: Before every deploy, open in incognito — can a stranger understand the product in 5 seconds?
3. **Features must be discoverable**: If a user can't find it without reading source code, it doesn't exist.
4. **Empty states are mandatory**: Every page must explain itself when there's no data.
5. **Demo mode = sales tool**: Treat demo/sample data as the product pitch, not a dev convenience.
6. **Every nav link must work**: No dead redirects, no placeholder pages, no broken routes.
7. **Pre-deploy UX smoke check**: First impression, feature discovery, navigation, empty states, demo quality, value visibility — all must pass before sharing any URL.

### Build Order (Always)
```
1. Landing/onboarding experience
2. Navigation and page structure
3. Empty states for every page
4. Feature showcase/discovery
5. Demo mode as sales tool
6. THEN build engines, parsers, APIs
7. Wire engines into the already-visible framework
```

**The AI Slop Trap**: Fast code generation creates a false sense of completeness. 2,000 lines of backend logic feels productive, but if the 50 lines of UI that introduce the product don't exist, the app looks like an empty mock. After every coding session ask: "If I deleted all backend logic and only kept what's on screen, would this impress someone?"
