# CURRENT_SPRINT — BookDrop

Last updated: 2026-05-13
Status: **V1 schema live · code complete · awaiting manual launch steps**
Full history: `CURRENT_SPRINT_ARCHIVE.md`

## Current state

- Demo at https://bookkeeper-portal.vercel.app (`VITE_MODE=demo`)
- Live Supabase: `mvvadmlivrpyawmlaqye` — 13 tables, all RLS, migrations 001-008 applied 2026-05-12
- Tests: 94/94 · Build: clean · Bundle: ClientDetailPage 47KB
- AI-first audit: **1/5 PASS** — pivot required (see `DATA_FLYWHEEL.md` §B + §D)

## Blocking before `VITE_MODE=cloud` flip

| # | Task | Owner | Doc |
|---|---|---|---|
| 1 | AI-first pivot (engines → default core flow) | Me | `DATA_FLYWHEEL.md` §D |
| 2 | R2 backup bucket + Wrangler + Task Scheduler | You | `scripts/SETUP_BACKUPS.md` |
| 3 | Resend account + API key | You | `LAUNCH_CHECKLIST.md` §1 |
| 4 | Stripe products $39/$79 + webhook | You | `LAUNCH_CHECKLIST.md` §2 |
| 5 | Vercel env vars set + `VITE_MODE=cloud` | You | `LAUNCH_CHECKLIST.md` §3 |
| 6 | End-to-end browser smoke test on live URL | You | `scripts/CLOUD_SMOKE_TEST.md` |

## Recent decisions (last 7 — older in archive)

| Date | Decision |
|---|---|
| 2026-05-13 | Doc hygiene rule + audit script + GH Action shipped. Hard caps enforced. |
| 2026-05-12 | Factory rules sync v4.3: 16 rules synced, 3 new, platform mirrors regenerated |
| 2026-05-12 | V1.1 Client Tearsheet + Workflow Library scaffolding shipped (commit `44efb1c`) |
| 2026-05-12 | Bug-checklist run: 1 real hit (fictional formula in AuditReportPanel), fixed |
| 2026-05-12 | Migrations 004-008 applied to live BookDrop project via Supabase MCP |
| 2026-05-12 | Migration 008 (advisor fixes): security_invoker view + pinned search_paths + REVOKE EXECUTE from anon + dup-index drop |
| 2026-05-06 | All 4 pre-launch blockers cleared on code side (10 audit gaps closed across E1+E2+E3) |

## V1.1 build queue (post-launch)

1. AI-first pivot D.2-D.5: reconciliation on upload, AI-personalized reminders, auto-package at close, urgency-sorted dashboard
2. Workflow Library executor wiring (12 entries in registry; need per-workflow runners)
3. Recurring AJE Templates (Pro tier moat)
4. Native QuickBooks Online + Xero integration
5. Compact factory `.claude/rules/*.md` (logged as factory-change candidate in harvest doc)

## Next session start here

1. If launch steps 2-6 done → check production smoke test results
2. Otherwise → start AI-first pivot D.2 (reconciliation auto-run on upload)
3. Or run `scripts/audit-docs.ps1` if any doc is hitting caps
