# VACATION_QUEUE — dispatchable work for the week away

How this works: each row is a **fully-specified, low-risk task**. When you're ready, you (or a future Claude session) picks one off the top, ships it as a PR, and CI verifies it. From your phone you review the Vercel preview deploy + the diff, then merge if it looks right.

**You're not supposed to do these from your phone.** They're for me (or the next Claude session you start) to dispatch from. Phone is for review + merge.

Tasks ordered by safety + impact. Pick from top first.

| # | Task | Tier | Risk | Files | Est. effort | Acceptance |
|---|---|---|---|---|---|---|
| 1 | Compact `golden-paths.md` (301→<150 lines) by removing exhausted patterns + tightening prose | hygiene | very low | golden-paths.md | 30 min | `npm run audit-docs` clean for this file |
| 2 | Compact / archive `KNOWLEDGE_TRANSFER.md` (294→archive) — content lives in rules now | hygiene | very low | KNOWLEDGE_TRANSFER.md → KNOWLEDGE_TRANSFER_ARCHIVE.md, replace with 1-paragraph pointer | 20 min | Audit-docs reports `golden-paths` gone + 1 less HARD violation |
| 3 | Compact `LAUNCH_CHECKLIST.md` (211→<150) — drop verbose context, keep step-by-step | hygiene | very low | LAUNCH_CHECKLIST.md | 30 min | Audit-docs SOFT cap cleared |
| 4 | Compact `CLAUDE.md` (194→<150) — extract reference material to rules, keep entrypoint terse | hygiene | very low | CLAUDE.md | 30 min | Audit clean |
| 5 | Add `npm run lint:strict` script that runs ESLint with `--max-warnings 0` | hygiene | low | package.json | 5 min | Script exists, CI runs it |
| 6 | Add lazy-load Suspense fallback skeleton (replaces spinner) on Dashboard / ClientDetail / Clients pages | UX | low | src/components/shared/LoadingSpinner.tsx, src/App.tsx | 1 hr | Visual: skeleton instead of spinner on first load |
| 7 | Add `<meta name="theme-color">` + apple-touch-icon for iOS install banner | UX | low | index.html | 15 min | Lighthouse PWA score improves |
| 8 | Add favicon variants (16/32/192/512) | UX | low | public/favicon-*.png + index.html | 30 min | iOS/Android home-screen icon renders |
| 9 | Add Sentry browser SDK (or alternative — PostHog, Rollbar) behind feature flag for prod-only error capture | observability | medium | new lib/error-tracking.ts, src/main.tsx | 1 hr | Test mode: throws caught + reported; demo mode: disabled |
| 10 | Wire `client-meeting-qa` workflow as the first `live` executor in Workflow Library | V1.1 | medium | src/lib/workflows/registry.ts (status: live), new src/lib/workflows/executors/client-meeting-qa.ts | 2 hr | Click "Run workflow" → 1-page HTML brief downloaded |
| 11 | Wire `1099-prep` workflow (live executor) — vendor ≥$600 from current period | V1.1 | medium | new src/lib/workflows/executors/1099-prep.ts | 2 hr | CSV download with vendor name + total paid YTD |
| 12 | Wire `recon-troubleshoot` workflow — diff bank vs ledger for selected period | V1.1 | medium | new src/lib/workflows/executors/recon-troubleshoot.ts | 3 hr | Surfaces unmatched txns ranked by $ delta |
| 13 | Add `dashboard urgency-sort` (AI-first pivot D.5) — clients sorted by `(days_since_last_activity × incomplete_required_docs × historical_late_rate)` | V1.1 | medium | src/pages/DashboardPage.tsx + new src/lib/urgency-score.ts | 2 hr | Tests: scoring fn unit-tested; UI shows urgency badge per client row |
| 14 | Add `AI-personalized reminder` (D.3) — read last 3 reminder→upload deltas per client, suggest day-offset | V1.1 | medium | api/cron/auto-reminders.ts + new src/lib/reminder-personalization.ts | 4 hr | LOCKED until Loop 2 per client per ai-first-principles.md §3 |
| 15 | Add `auto-package at close` (D.4) — when bookkeeper marks close complete, auto-generate + email package | V1.1 | medium | api/finalize-close.ts + email-templates | 3 hr | Hits close-sign-off endpoint → email arrives with PDF |
| 16 | Migrate `LEGAL_GUARDRAILS.md` to live next to feature code as `.legalspec.md` files | architecture | low | New convention: each `src/features/*/.legalspec.md` | 2 hr | Each Level-2/3 feature has its disclaimer co-located |
| 17 | Add `src/types/index.ts` cleanup — split into `db.ts`, `enriched.ts`, `ui.ts` (it's currently 1 god-type file) | refactor | medium | Split src/types/index.ts | 2 hr | TypeScript still passes, no runtime change |
| 18 | Add `useStableCallback` hook + replace `useCallback` with it in 3 hot paths (eliminates render storms) | perf | low | new src/hooks/useStableCallback.ts | 1 hr | Profiler: re-render count drops on those panels |
| 19 | Wire SignaturePlacementDesigner drag-to-reposition (currently click-to-drop only) | UX | medium | src/components/practitioner/SignaturePlacementDesigner.tsx | 3 hr | Existing markers can be repositioned without removing |
| 20 | Add Vercel BotID (GA June 2025, mentioned in session reminders) to public upload endpoint | security | low | vercel.ts or vercel.json | 30 min | Bot traffic on /upload/:token rate-limited |

## How to dispatch a task to me (when you have a moment)

Just say: "ship #N from VACATION_QUEUE" — I'll do it, run CI, commit, push. You'll see the PR notification on GitHub Mobile within minutes.

## Auto-dispatch (optional — see PHONE_REVIEW.md)

Tasks #1–#5 are pure hygiene. If you set up the optional `claude-agent-dispatch.yml` workflow with your Anthropic API key as a repo secret, you can fire-and-forget those from GitHub Mobile by tapping "Run workflow" with `task_id=1`.
