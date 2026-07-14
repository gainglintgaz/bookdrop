# BookDrop capability map (honest, 2026-07-14)

**Product shape:** thin portal + collaborative month close-**PREP** (not TaxDome / full GL).  
**Default mode on prod URL:** `demo` until founder sets `VITE_MODE=cloud` + Resend/Stripe/service role.

| Area | What works | Gap / gate |
|---|---|---|
| **Collection** | Requirements per client; magic-link `/upload/:portal_token` (no client login); file drop | Cloud uploads need Supabase Storage + service path |
| **Storage** | Private `documents` bucket path; signed URLs; client ZIP (JSZip, Starter+) | R2 off-platform backup still founder |
| **Tracking** | Period status, missing docs, urgency sort, period desk stages | Live counts need cloud mode + data |
| **Line truth** | `document_line_items` + portal confirm RPCs + exceptions queue | Migrations 009–011 on BookDrop project |
| **Exchange / transfer** | Portal upload → bookkeeper desk; export QBO/Xero **CSV** after human approve | No live QBO/Xero API sync; no RPA |
| **Email** | Resend: reminders, upload notify, e-sign invite, engagement, **prep-complete notify** | Needs `RESEND_API_KEY` + from domain |
| **Messages** | Two-way MessagePanel (demo memory / cloud table) | Not SMS; not email threading |
| **Schedules** | `reminder_schedules` + cron auto-reminders + close-prep cron 12:00 UTC | Crons need Vercel + secrets |
| **Reports / PDFs** | Browser PDF.js parse; server CSV + **PDF text** overnight; package HTML/ZIP | Image-only PDF → empty lines until OCR |
| **Forms / signatures** | Engagement letters, multi-signer, canvas, audit log, disclosures | Not DocuSign-class legal e-sign network |
| **AI / agentic** | Allowlist playbooks, prep agent, category memory, package draft, k≥5 firm gate | No silent GL post; no Level-3 tax advice; no free-form agent |
| **Integrations** | Stripe checkout/portal (code); export files; FinKeel merge **contract** only | No QBO/Xero/ADP/Gusto OAuth yet |

## Overnight loop (P2.3)

```
cron close-prep → storage CSV+PDF text → categorize/audit → workflow_runs
  → email bookkeeper (if Resend) → Period Desk History = prep-runs inbox
```

Human still approves package export. Never posts books.

## Production readiness

| Item | Status |
|---|---|
| Demo SPA HTTP | Landing/login/signup/help **200** |
| close-prep without secret | Expect **401** (live may 500 if function crash/env) |
| Cloud flip | Founder: `VITE_MODE=cloud`, Supabase service role, Resend, Stripe, CRON_SECRET |
| Commercial “100% ready” | **No** — demo default + founder secrets still blocking |
