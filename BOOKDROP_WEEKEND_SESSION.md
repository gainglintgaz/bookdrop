# BookDrop — Weekend Build Session

## Context
BookDrop is a dual-audience bookkeeping portal: (1) bookkeepers/CPAs manage clients, and (2) business owners/solo practitioners manage their own books. Code-complete MVP with 21 passing tests. NOT YET DEPLOYED. This session: get BookDrop from "code complete" to "deployed and functional."

## Project Location
```bash
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal
```

## Tech Stack
React 19 + TypeScript | Vite | Tailwind CSS v4 | shadcn/ui | Supabase (6 tables, RLS) | Stripe | Resend | Vercel | Zustand

## CRITICAL RULES
1. **Money = BIGINT cents in DB, / 100 for display.** Same pattern as FinKeel.
2. **ALL AI calls go through Supabase Edge Functions.** NEVER frontend API keys.
3. **RLS on every table.** Bookkeepers see only their clients. Business owners see only their own data.
4. **NO money transfer features.** Victor doesn't have a money transmitter license.
5. **NO CPA/tax prep claims.** BookDrop helps organize documents, does NOT prepare taxes.
6. **NO competitor names in UI.** Same public-language rules as FinKeel.
7. **Stripe = SaaS subscription billing ONLY.** Free/Starter/Pro tiers.
8. **Use `logger` from logging utility — NOT raw console.log.**

## Session Start Protocol
```bash
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal
git status
git log --oneline -10
cat CLAUDE.md 2>/dev/null || echo "No CLAUDE.md"
cat .claude/CLAUDE.md 2>/dev/null || echo "No .claude/CLAUDE.md"
ls src/
npm run test 2>/dev/null || npx vitest run
npx vite build
```

Also read the project brief:
```bash
cat C:\Users\vtbsj\victor-ai-factory\projects\bookdrop\BRIEF.md
```

## What EXISTS (Code Complete)
| Component | Status |
|-----------|--------|
| Public client upload portal (no auth required) | ✅ Built |
| Bookkeeper dashboard + client management | ✅ Built |
| Business owner dashboard (solo practitioners) | ✅ Built |
| 16 intelligence engines (parsing, categorization, tax) | ✅ Built |
| Tax estimator (personal & business) | ✅ Built |
| Stripe integration (checkout, webhooks, portal) | ✅ Built |
| Resend email system (3-tone auto-reminders) | ✅ Built |
| Vercel deployment config (SPA rewrites, cron) | ✅ Built |
| Route code-splitting (257KB bundle) | ✅ Optimized |
| 21 tests passing | ✅ Tested |

## What NEEDS TO BE DONE (Priority Order)

### Phase 1: Infrastructure Setup (Day 1 — BLOCKING)
These are blocking — nothing works without them.

1. **Create Supabase Project** (if not already created):
   - Use Supabase MCP: `list_projects` to check if BookDrop project exists
   - If not: `create_project` (ask Victor for org ID)
   - Region: `us-east-1` (closest to Spartanburg, SC)

2. **Run Database Migrations**:
   - Find migration files: `ls supabase/migrations/` or `ls src/db/` or similar
   - Execute `001_initial_schema.sql` via Supabase MCP `apply_migration`
   - Execute `002_dual-audience.sql` migration
   - Verify all 6 tables created with correct RLS policies
   - Test: each table should have RLS enabled + at least one policy

3. **Set Up Stripe Products/Prices**:
   - Check if Stripe is configured: look for STRIPE_SECRET_KEY references
   - Three tiers: Free / Starter / Pro
   - Look at existing Stripe checkout/webhook code for expected price IDs
   - Document what Victor needs to create in Stripe Dashboard

4. **Environment Variables**:
   - Create `.env.local` with all required vars
   - Check what vars the code expects: `grep -r "import.meta.env" src/ | sort -u`
   - Supabase URL + anon key (VITE_ prefix OK for these)
   - Stripe publishable key (VITE_ prefix OK)
   - Stripe secret key (server-side only — Edge Function)
   - Resend API key (server-side only — Edge Function)

### Phase 2: End-to-End Testing (Day 1-2)
5. **Client Upload Flow**:
   - Test: unauthenticated user can upload a document
   - Test: document appears in bookkeeper's dashboard
   - Test: categorization engine processes the upload
   - Fix any broken flows

6. **Bookkeeper Dashboard**:
   - Test: login, see clients list
   - Test: click into client, see their documents
   - Test: progress tracking updates correctly
   - Test: reminder emails configured (check Resend integration)

7. **Business Owner Dashboard**:
   - Test: solo practitioner login
   - Test: upload own receipts/documents
   - Test: tax estimator produces reasonable results
   - Test: can export data

8. **Stripe Billing Flow**:
   - Test: checkout creates subscription
   - Test: webhook handles payment events
   - Test: customer portal accessible
   - Test: tier limits enforced (Free/Starter/Pro)

### Phase 3: Invoice & AR Features (Day 2)
9. **Invoice Generation** (if not already built):
   - Bookkeepers should be able to generate invoices for clients
   - Business owners should be able to create sales invoices
   - Track: sent, viewed, paid, overdue statuses
   - Link invoices to uploaded documents/receipts

10. **Accounts Receivable View**:
    - Aging buckets: Current / 30-day / 60-day / 90+ day
    - Total outstanding per client
    - Cash flow impact projection
    - This is the "Unpaid Invoice Cash Flow Radar" feature — highest-scored idea from intelligence engine

11. **Accounts Payable Tracking**:
    - Business owners track bills they need to pay
    - Due date reminders
    - Link to uploaded bill documents

### Phase 4: Deployment (Day 2-3)
12. **Deploy to Vercel**:
    - `vercel deploy` or push to linked GitHub repo
    - Configure environment variables in Vercel dashboard
    - Test production build: `npx vite build`
    - Verify all routes work (SPA rewrites configured)

13. **Deploy Edge Functions** (if any):
    - Reminder email cron function
    - Any AI processing functions
    - Verify secrets set in Supabase Dashboard

14. **Domain Setup** (if domain purchased):
    - Configure DNS in Cloudflare/Vercel
    - SSL certificate auto-provision

### Phase 5: Polish & Launch Prep (Day 3)
15. **Landing Page Finalization**:
    - Clear value prop for BOTH audiences (bookkeepers AND business owners)
    - Pricing table (Free/Starter/Pro)
    - No competitor names (follow public-language.md rules)
    - Privacy messaging ("your client data stays private")

16. **Mobile Responsive Polish**:
    - Test on mobile viewport (375px)
    - Fix any layout breaks
    - Upload portal must work on phones (clients photograph receipts)

17. **Error Handling Audit**:
    - Every API call has error handling
    - Toast notifications for success/failure
    - Empty states for all lists (no blank screens)
    - Loading states for async operations

## Testing
```bash
npx vitest run           # All 21+ tests
npx vite build           # Production build must pass
```

## Commit Rules
- One feature = one commit
- Run `npx vite build` before every commit
- NEVER commit .env files or API keys
- Include `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

## Cross-Reference with FinKeel
BookDrop and FinKeel share architectural patterns:
- Same Supabase + Vercel + Stripe stack
- Same money-in-cents convention
- Same privacy-first approach
- Same Edge Function pattern for AI calls
- FinKeel's invoice service (`invoiceService.ts`) can inform BookDrop's invoice feature
- BookDrop's CPA portal concept was scored 8.0+ by intelligence engine

## Intelligence Engine Findings Relevant to BookDrop
- **VolunteerBooks** (HOA + Church Treasurer): 685,000 orgs, $12-15/mo potential. BookDrop's client portal is the foundation.
- **Unpaid Invoice Cash Flow Radar**: 56% of SMBs owed avg $17,500. Build AR aging into BookDrop.
- **DocCollect competitor**: $29/mo CPA document portal. BookDrop undercuts on price and adds AI categorization.
- **Wave receipt scanning broken** (March 2026): Wave users are defecting. BookDrop + receipt OCR = natural migration path.

## What NOT to Do
- Don't touch FinKeel code (separate repo)
- Don't add money transfer features
- Don't claim CPA/tax prep capabilities
- Don't expose competitor names in UI
- Don't deploy without testing all flows end-to-end
- Don't skip RLS policies on any table
