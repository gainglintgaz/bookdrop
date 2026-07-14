# BookDrop Session Progress — 2026-07-11

**Worktree:** `C:\Users\vtbsj\.gemini\antigravity\scratch\bookdrop-work-20260711`  
**Branch:** `feat/bookdrop-session-20260711`  
**Base:** `master` @ `90e9c27`

## Strategy reminder
Thin portal + close-PREP; FinKeel remains flagship. Not competing with TaxDome / Financial Cents / Double / Botkeeper feature-for-feature.

| Phase | Goal | Status | Notes |
|---|---|---|---|
| **P0** | Ground truth | ✅ | `npm run build` green; `npx vitest run` 94/94 |
| **P1** | Cloud launch readiness | ✅ | `FOUNDER_ENV_CHECKLIST.md`; honest LandingPage; smoke checklist below |
| **P2** | AI on default path | ✅ | Persist AI enrichment; Documents exceptions strip; demo data shows exceptions; client portal receipt already existed |
| **P3** | Month package auto-draft | ✅ | `evaluatePackageDraft` auto when completeness passes; banner + Export tab "Package ready for review"; HTML package + ZIP |
| **P4** | FinKeel merge contract | ✅ | `INTEGRATION_FINKEEL.md` |
| **P5 / G5** | month-end-close-service live | ✅ | `workflows/execute.ts` + Analysis library Run |
| **D.5** | Dashboard urgency sort | ✅ | `urgency.ts` + Dashboard “Needs your attention first” + table column |
| **Corrections** | Documents-tab exceptions queue | ✅ | `ExceptionsQueue` + `recordCorrection` default path |
| **Phase 0** | Workflow honesty | ✅ | Stub = Preview only (not runnable) |
| **Phase 1** | Line table + write path | ✅ | Migration **009 applied** on BookDrop (`mvvadmlivrpyawmlaqye`); lines insert on upload |
| **Phase 2** | Portal confirm UX | ✅ | RPCs 010 applied; `PortalConfirmPanel` + audit fingerprint; demo localStorage path |
| **Confirm proof** | Bookkeeper strip | ✅ | `ClientConfirmProofStrip` from `portal_line_events` |
| **Phase 3** | Judgment hub | ✅ | Dashboard work-queue filters + Documents tabs (docs/exceptions/confirms/package) |
| **Phase 4** | Editable playbooks | ✅ | Allowlist steps, CRUD, run audit, Analysis UI; migration **011** applied |
| **Phase 5** | Earned intelligence | ✅ | Per-client memory on upload; reminder personalization locked &lt; Loop 2; k≥5 cohort gate |
| **Phase 5.1** | Multi-period cycles | ✅ | 12-mo lookback snapshots; Riverside demo Loop 2+; design doc `BOOKDROP_PHASE_5_1_DESIGN.md` |
| **AI P1** | Period Desk | ✅ | Stage chips replace tab scavenger hunt |
| **AI P2** | Prep agent | ✅ | Allowlisted run + cron endpoint (dry-run honest) |
| **AI P2.2** | Storage CSV prep | ✅ | Cron downloads CSVs, categorize/audit, enrich uploads, workflow_runs |
| **AI P2.3** | PDF + notify + inbox | ✅ | Server PDF text parse, prep-complete email, History prep-runs inbox |
| **AI P3** | Receipt→lines | ✅ | Same line spine as statements |
| **AI P4** | Firm k≥5 | ✅ | Cross-firm category suggestions gated |
| **AI P5** | Export approve | ✅ | Human checkbox before QBO/Xero CSV |

## Mode
- Local `.env`: Supabase URL/anon present; **`VITE_MODE` unset → defaults to `demo`** (`src/lib/mode.ts`)
- Demo URL: https://bookkeeper-portal.vercel.app
- Live Supabase (from CURRENT_SPRINT): `mvvadmlivrpyawmlaqye`

## CURRENT_SPRINT vs reality (P0)
| Claim (May 2026 sprint) | Reality (2026-07-11) |
|---|---|
| Code complete, awaiting launch | Mostly true for portal; cloud keys still founder-owned |
| AI-first 1/5 PASS | Still true marketing-wise until exceptions are default-path for bookkeeper |
| 94 tests | Confirmed green |
| Migrations 001–008 applied | Documented; not re-verified live this session (MCP auth unavailable) |
| Resend/Stripe/R2 | Still blocking real cloud flip |

## Smoke plan (from CLOUD_SMOKE_TEST — checkbox for founder)
- [ ] Set `VITE_MODE=cloud` + Supabase keys in Vercel / `.env.local`
- [ ] Signup bookkeeper → row in `bookkeepers`
- [ ] Add client + 2 requirements → portal token
- [ ] Public `/upload/:token` bank/CSV → auto-categorize receipt on portal
- [ ] Bookkeeper Client detail Documents shows exception counts (after this session fix)
- [ ] Manual reminder (needs Resend)
- [ ] ZIP download (Starter+)
- [ ] Stripe checkout test mode (needs prices)

## Blocked on founder
1. Resend API key + from-address
2. Stripe test products/prices + webhook secret
3. Vercel env set + `VITE_MODE=cloud` last
4. R2 backup pipeline (`scripts/SETUP_BACKUPS.md`)
5. Confirm Supabase project id still `mvvadmlivrpyawmlaqye`

## Next session first command
```powershell
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookdrop-work-20260711
git status
npm run build; npx vitest run
# Continue P3 package auto-draft OR founder env wiring
```
