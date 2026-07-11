# BookDrop — Full Session Kickoff (multi-hour / separate worktree)

> **Paste the block under § KICKOFF PROMPT as the first message** in a Grok Build session whose workspace is the BookDrop repo (or an isolated git worktree of it).  
> **Last updated:** 2026-07-11  
> **Canonical copies:**  
> - AgentNativeMoat: `docs/handoff/BOOKDROP_SESSION_KICKOFF.md`  
> - BookDrop repo: `BOOKDROP_SESSION_KICKOFF.md` (same content)  
> - Shorter decision summary: `docs/handoff/bookdrop-decision-and-kickoff.md` → also `BOOKDROP_KICKOFF.md` in BookDrop

---

## Paths

| What | Path |
|---|---|
| **BookDrop repo (main working copy)** | `C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal` |
| **AgentNativeMoat handoffs** | `C:\Users\vtbsj\.grok\worktrees\projects-agentnativemoat\2026-07-11-536927a0\docs\handoff\` |
| **Demo URL** | https://bookkeeper-portal.vercel.app |
| **FinKeel (do NOT edit unless dual-session)** | `C:\Users\vtbsj\.gemini\antigravity\scratch\family-budget-tracker` |

### Create a separate git worktree (recommended for multi-hour build)

```powershell
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal
git fetch origin 2>$null
git branch -a
# Pick base branch (often master or main):
git worktree add "C:\Users\vtbsj\.gemini\antigravity\scratch\bookdrop-work-YYYYMMDD" -b feat/session-YYYYMMDD master
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookdrop-work-YYYYMMDD
npm install
grok
```

Work only in the worktree path so the primary `bookkeeper-portal` folder stays clean.

---

## § KICKOFF PROMPT (copy everything between the fences)

```markdown
# BookDrop — multi-hour build session (thin portal + close-PREP + FinKeel-merge path)

You are Grok Build working **only** in this BookDrop workspace (git worktree or bookkeeper-portal).
Do **not** edit FinKeel unless the founder opens a dual-repo session.

## Strategy (non-negotiable)
- **FinKeel** = portfolio flagship money OS. BookDrop does **not** replace it.
- BookDrop goal: **thin bookkeeper portal + close-PREP module**, designed to **merge into FinKeel later** (client docs / invite bookkeeper / package export) OR stay thin SaaS.
- We are **NOT** competing feature-for-feature with TaxDome, Financial Cents, Double/Keeper, Botkeeper, Docyt, SmartVault.
- Beachhead: solo bookkeepers on email/Drive — not locked-in multi-tool firms.
- Honest product: magic-link collection + status + reminders + ZIP; AI only on **default path** (upload → categorize/exceptions), not marketing “16 engines” while Analysis-tab bolt-on remains.

## Read first (in order) — full paths relative to repo root

### Decision / handoff
1. `BOOKDROP_SESSION_KICKOFF.md` (this file)
2. `BOOKDROP_KICKOFF.md` if present (shorter decision summary)
3. External if readable: AgentNativeMoat `docs/handoff/bookdrop-decision-and-kickoff.md`

### Product identity
4. `CLAUDE.md`
5. `CLAUDE_AUTONOMY_PROTOCOL.md`
6. `KNOWLEDGE_TRANSFER.md`
7. `VICTORFORGE_PHILOSOPHY.md` (if present)
8. `LEGAL_GUARDRAILS.md`
9. `tenant.config.ts` / `src/lib/tenant.config.ts`

### Sprint / launch / AI strategy
10. `CURRENT_SPRINT.md`
11. `CURRENT_SPRINT_ARCHIVE.md` (only if history needed)
12. `V1_FEATURE_BACKLOG.md`
13. `DATA_FLYWHEEL.md`  ← AI-first audit 1/5 + pivot §D
14. `LAUNCH_CHECKLIST.md`
15. `scripts/CLOUD_SMOKE_TEST.md`
16. `scripts/SETUP_BACKUPS.md`
17. `LAUNCH` / email scripts under `scripts/` as needed

### Architecture / code map (orient, don’t rewrite all)
18. `src/App.tsx` — routes
19. `src/pages/` — Landing, Dashboard, Clients, ClientDetail, Upload, Settings, auth
20. `src/components/practitioner/` — Analysis panels, Workflow*, e-sign
21. `src/components/client/` — dropzone, requirements
22. `src/lib/workflow-engine.ts` — pipeline
23. `src/lib/workflows/registry.ts` — 12 workflows (mostly stub/planned)
24. `src/lib/categorization-engine.ts`, `parse-bank-statement.ts`, `reconciliation.ts`, `completeness-check.ts`
25. `src/lib/receipt-scanner.ts`, `insights.ts`, `export-qb.ts`, `download-zip.ts`
26. `src/lib/mode.ts`, `src/lib/db.ts`, `src/lib/supabase.ts`
27. `api/` — Resend, Stripe, reminders, e-sign, cron
28. `supabase/migrations/` — 001–008
29. `tests/` — vitest suite
30. `package.json`, `vercel.json`

### Write as you work (session artifacts — CREATE if missing)
- `SESSION_LOG.md` — append-only: decisions, commits, blockers
- `INTEGRATION_FINKEEL.md` — merge contract (data shapes, invite flow, package export)
- `PROGRESS.md` — phase checklist with ✅/🟡/❌

## Operating mode for multi-hour work
1. **Phase ladder:** complete P0 → P1 → P2 → P3 → P4 in order unless blocked on founder secrets.
2. **One phase = one logical commit** (or small commit series with clear messages).
3. **Architect-first for P2+:** write a short plan in SESSION_LOG.md; if high risk (schema, auth, payments), STOP and ask founder for `build approved` before coding.
4. **Low risk** (copy, tests, docs, checklists, INTEGRATION_FINKEEL.md): proceed.
5. **Never invent** API keys, Stripe prices live, or fake user metrics.
6. **Tests:** `npm run build` and `npx vitest run` must stay green after code changes.
7. **No FinKeel repo edits** in this session.
8. **No multi-vertical** (HOA/estate/equine) work.
9. **No auto-post journal entries** to QBO without human approve design.
10. **Tax advice / PTIN features** stay in graveyard unless LEGAL_GUARDRAILS allows.
11. End with: PROGRESS.md updated + “Blocked on founder” list + next session first command.

## Phase definitions (execute in order)

### P0 — Ground truth (≤45 min)
- [ ] `npm install` if needed; `npm run build`; `npx vitest run`
- [ ] Summarize CURRENT_SPRINT vs reality in PROGRESS.md
- [ ] Confirm demo vs cloud mode (`VITE_MODE`)
- [ ] List broken routes / obvious TODOs from ClientDetail Analysis tab
- Success: green build/tests + PROGRESS.md P0 section

### P1 — Cloud launch readiness (docs + code only; no secret invention)
- [ ] Walk LAUNCH_CHECKLIST.md; produce `FOUNDER_ENV_CHECKLIST.md` with exact env var names
- [ ] Verify api/ routes for Resend/Stripe/reminders exist and fail gracefully without keys
- [ ] Honest LandingPage: **portal + reminders + ZIP**, no “AI closes your books” unless P2 shipped
- [ ] Smoke plan from scripts/CLOUD_SMOKE_TEST.md as checkbox list
- Success: founder can copy-paste env setup; landing is truthful
- **Stop if:** need real Resend/Stripe values — list steps for founder, continue P2 if possible in demo mode

### P2 — AI on DEFAULT path (core product bet) 
Per DATA_FLYWHEEL.md §D.1–D.2 style:
- [ ] On document upload (or first parse): run categorize pipeline automatically where data allows
- [ ] Surface **exceptions only** to bookkeeper (not “open Analysis and click Run”)
- [ ] Capture corrections path (schema if needed — additive migration; document it)
- [ ] Client-facing confirm of low-confidence items if portal allows without new accounts
- [ ] Wire or adapt `workflow-engine.ts` / categorization into upload flow — prefer reuse
- [ ] Tests for completeness + categorization path
- Success: demo or cloud path shows exceptions list after upload without Analysis tab
- **Do NOT** build all 12 Workflow Library executors

### P3 — Month package auto-draft
- [ ] When completeness-check passes (use `completeness-check.ts`), draft bookkeeper package
- [ ] ZIP / export-qb path reused
- [ ] Clear status: “Package ready for review”
- Success: one-click or auto draft after docs complete

### P4 — FinKeel integration contract (required before claiming “merge path”)
Write `INTEGRATION_FINKEEL.md` covering:
- Entities: bookkeeper, client, period, requirement, upload, completeness, package
- Auth: portal_token vs future FinKeel user
- Export format (JSON + ZIP) FinKeel or CPA can import
- Non-goals: shared DB v1, shared Stripe, shared auth day-one
- Open questions for founder
- Success: file committed; no FinKeel code required

### P5 — Optional stretch (only if P0–P4 done and time remains)
- [ ] One Workflow Library entry from `stub` → real executor: prefer `month-end-close-service` only
- [ ] Urgency sort on dashboard (DATA_FLYWHEEL D.5)
- [ ] SESSION_LOG notes on QBO (research only — no full OAuth unless founder approves)

## Goals you may set / execute (structured)

Use sequential goals; do not run all in parallel.

| Goal ID | Name | Done when |
|---|---|---|
| G0 | Green baseline | build + vitest green |
| G1 | Launch docs | FOUNDER_ENV_CHECKLIST.md + honest landing |
| G2 | Default-path AI | upload → exceptions without Analysis tab |
| G3 | Package draft | completeness → package ready |
| G4 | Merge contract | INTEGRATION_FINKEEL.md complete |
| G5 | Stretch close workflow | one live workflow executor OR skip |

If using an internal goal/loop tool:
- `goal: BookDrop G2 default-path AI` with success = G2 table row
- Stop condition: tests red >2 fix attempts → document + continue other phase
- Max scope: do not start G5 before G4

## Agents / subagent roles (if available — use lightly)

| Role | Task |
|---|---|
| **Explore** | Map upload → storage → ClientDetail Analysis wiring |
| **Plan** | P2 architecture (≤1 page in SESSION_LOG) before coding |
| **Coder** | Implement one phase only |
| **Tester** | vitest + build after each phase |
| **Reviewer** | Check for fake AI claims, secrets, Analysis-tab-only regressions |

Do **not** spawn endless parallel fleets. Prefer serial: explore → plan → code → test.

## Automations / workflows in product (what you may touch)

| Asset | Path | Allowed work |
|---|---|---|
| Pipeline engine | `src/lib/workflow-engine.ts` | Wire into default upload path |
| Workflow registry | `src/lib/workflows/registry.ts` | Update status; implement **one** executor max |
| Workflow UI | `WorkflowLibraryPanel.tsx`, `WorkflowResultPanel.tsx` | Honest stub vs live labels |
| Categorize | `categorization-engine.ts`, `auto-categorize-upload.ts` | Default path |
| Parse | `parse-bank-statement.ts` | Default path |
| Reconcile | `reconciliation.ts` | Auto on statement if solid |
| Completeness | `completeness-check.ts` | Dashboard + package gate |
| Reminders | `api/send-reminder.ts`, `api/cron/*` | Only if env-safe |
| E-sign | already shipped | Avoid unless bugfix |
| Stripe/Resend | `api/stripe/*`, `api/_lib/resend.ts` | Checklist only without keys |

## MD files to maintain during session
| File | Purpose |
|---|---|
| `PROGRESS.md` | Phase checklist |
| `SESSION_LOG.md` | Decisions, commands, commits |
| `INTEGRATION_FINKEEL.md` | Merge path |
| `FOUNDER_ENV_CHECKLIST.md` | Secrets/env owner steps |
| `CURRENT_SPRINT.md` | One short “Session 2026-07-11+” section at top |

## MCPs (if founder authorized)
- **Supabase** — BookDrop project only (verify project id in docs; do not use FinKeel project)
- **Vercel** — bookkeeper-portal deploy/env/logs
- **GitHub** — optional PR from worktree branch

## Definition of done for this multi-hour session
Minimum valuable:
- [ ] G0 green
- [ ] G1 founder checklist + honest landing
- [ ] G4 INTEGRATION_FINKEEL.md
- [ ] PROGRESS.md + SESSION_LOG.md

Strong session:
- [ ] G2 default-path AI exceptions
- [ ] G3 package draft

Excellent:
- [ ] G5 one live month-end-close-service executor

## Stop / escalate to founder when
- Need production secrets (Resend, Stripe, Supabase service role)
- Schema migration to production
- Desire to edit FinKeel
- Scope creep into practice management or multi-vertical
- Tests fail for same root cause 3 times

## Start now
1. Confirm cwd and git branch/worktree
2. Read files 1–14 above
3. Create PROGRESS.md + SESSION_LOG.md
4. Execute G0 → G1 → … as far as time allows
5. Final message: achievements, blockers, exact next prompt for follow-up session
```

---

## Founder quick start

```powershell
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal
git worktree add "C:\Users\vtbsj\.gemini\antigravity\scratch\bookdrop-work-$(Get-Date -Format yyyyMMdd)" -b "feat/bookdrop-session-$(Get-Date -Format yyyyMMdd)" master
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookdrop-work-*
# if multiple, cd into the new folder explicitly
npm install
# Copy kickoff if not already there:
Copy-Item "C:\Users\vtbsj\.grok\worktrees\projects-agentnativemoat\2026-07-11-536927a0\docs\handoff\BOOKDROP_SESSION_KICKOFF.md" ".\BOOKDROP_SESSION_KICKOFF.md" -Force
Copy-Item "C:\Users\vtbsj\.grok\worktrees\projects-agentnativemoat\2026-07-11-536927a0\docs\handoff\bookdrop-decision-and-kickoff.md" ".\BOOKDROP_KICKOFF.md" -Force
grok
```

In Grok: open `BOOKDROP_SESSION_KICKOFF.md` and run the fenced **§ KICKOFF PROMPT** (or paste it).

---

*End of session kickoff package.*
