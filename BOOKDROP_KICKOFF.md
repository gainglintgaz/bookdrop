# BookDrop — Full Decision, Analysis, and New-Session Kickoff

> **Last updated:** 2026-07-11 (session complete)  
> **Repo:** `C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal`  
> **Demo:** https://bookkeeper-portal.vercel.app (`VITE_MODE=demo`)  
> **Copy into BookDrop as:** `BOOKDROP_KICKOFF.md` (for Grok Build workspace)

This file is the **single handoff** for any new session. Chat history is not required if this file is read.

---

## 0. Where it stands (current)

| Item | Status |
|---|---|
| **Product company vs TaxDome/Double/FC** | **Not recommended** as full competitor |
| **Default if idle** | Park / no unattended fleets |
| **Founder direction (2026-07-11)** | **May build** with intent to **integrate into FinKeel later** |
| **Allowed build mode** | **Thin portal + close-PREP**, integration-first, phase-gated |
| **Not allowed without explicit re-approve** | Firm OS war, multi-vertical, auto-post JE, 12 workflows at once, multi-day autonomous loops |
| **FinKeel** | Remains **flagship**; BookDrop must not steal all WIP forever |
| **Code completeness** | Portal/e-sign/engines largely coded; **AI not default path**; cloud launch incomplete (~May 2026 sprint) |
| **AI-first audit (own docs)** | **1/5 PASS** — pivot required for honest “AI-powered” marketing (`DATA_FLYWHEEL.md`) |

---

## 1. What was analyzed (this research)

### 1.1 Product identity
- **Paying user:** solo bookkeeper  
- **Client:** magic-link upload (no client account)  
- **Core loop:** requirements → upload → status → reminders → ZIP/export  
- **Also in repo:** Analysis-tab engines, workflow-engine pipeline, Workflow Library (12 entries mostly stub/planned), e-sign, dual mode (bookkeeper / business-owner prep), white-label tenant.config  
- **Pricing (docs):** Free / $39 Starter / $79 Pro  

### 1.2 Build state
- SPA + dist present; tests ~94; Supabase migrations 001–008 applied (per CURRENT_SPRINT May 2026)  
- **Blocking launch:** Resend, Stripe, Vercel env, `VITE_MODE=cloud`, R2 backups, browser smoke  
- **Stale:** last sprint notes ~2026-05 — project was abandoned mid-launch  

### 1.3 AI-native / second-employee assessment

**Designed:** engines (parse, categorize, reconcile, OCR, insights, completeness, workflow pipeline) + Workflow Library with Trust Ladder.

**Experienced today:** Dropbox + reminders + **opt-in Analysis tab**. AI is **bolted on** (Removed-AI test FAIL).

| Role | Readiness |
|---|---|
| Collection employee (chase docs) | ~50–60% code; needs cloud email |
| Close-prep employee (exceptions only) | ~20–30% — not default path |
| Client co-worker (confirm 7 lines) | ~20–30% — D.1 pivot not done |
| Overall “second employee” live | **~3/10** |
| If §D pivot + launch | **~6/10** still without QBO |

**Vs FinKeel:** FinKeel has stronger agentic spine (`ai_action_queue`, producers, apply/undo). BookDrop has more analysis tools but weaker “work comes to you” spine.

### 1.4 Competitors (2026)
- **Practice/portal:** Financial Cents, TaxDome, Canopy, Karbon, Liscio, SmartVault  
- **Close on QBO:** Double (ex-Keeper), Xenett  
- **AI into books:** Botkeeper, Docyt, similar  

**Lock-in:** firms already on QBO + one practice tool rarely switch. Beachhead only: **new solos / email+Drive**. Fighting locked-in firms feature-for-feature is a bad solo bet.

### 1.5 Paths considered

| Path | Meaning | Status |
|---|---|---|
| A PARK | Stop product investment | Default if no sessions |
| B Minimal portal V0 | Honest collection only, 30-day kill | Optional |
| C Fold into FinKeel | Portal/package as FinKeel feature | **Preferred end state** |
| D Full AI firm employee | Pivot + QBO + workflows | **Do not start full D now** |
| **Build thin + merge** | Founder choice: build now, design for FinKeel | **Active strategy if building** |

---

## 2. What to plan / build / test in a **new session**

### Phase map (use one phase per goal/session)

| Phase | Goal | Success criteria | Out of scope |
|---|---|---|---|
| **P0** | Ground truth | `npm run build` + vitest green; CURRENT_SPRINT note updated; honest landing if needed | AI pivot, QBO |
| **P1** | Cloud launch prep | Env checklist complete; smoke plan; blocked only on Victor’s keys (Resend/Stripe) | New features |
| **P2** | AI default path (core bet) | Upload → categorize; bookkeeper sees exception list; corrections capturable | All 12 workflows, QBO |
| **P3** | Month package | Completeness pass → package draft ready | Auto-post JE |
| **P4** | FinKeel integration contract | `INTEGRATION_FINKEEL.md` (data shapes, invite bookkeeper, package export) — **no FinKeel code unless dual-repo session** | Full merge |
| **P5+** | Only after real bookkeepers | One live workflow executor; QBO later | Firm OS |

### AI-first pivot reference (from DATA_FLYWHEEL.md §D) — for P2+
1. Categorize at upload + client confirm  
2. Reconcile on statement arrival → unmatched only  
3. Personalized reminders after Loop 2+ (honest LOCKED before)  
4. Package auto-draft at month-end  
5. Dashboard sorted by urgency  

### Explicit non-goals (new session must not freestyle)
- Multi-vertical (HOA, estate, equine…)  
- Full practice management  
- Auto-post to QBO without human approve  
- Tax advice features  
- Unattended multi-day “build everything” goals  

---

## 3. How to open a new Grok Build session

```powershell
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal
grok
```

Optional copy of this handoff into the BookDrop repo:

```powershell
Copy-Item `
  "C:\Users\vtbsj\.grok\worktrees\projects-agentnativemoat\2026-07-11-536927a0\docs\handoff\bookdrop-decision-and-kickoff.md" `
  "C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal\BOOKDROP_KICKOFF.md" -Force
```

### Kickoff prompt (paste first message)

```markdown
# BookDrop — thin build + FinKeel merge path

Read BOOKDROP_KICKOFF.md (or bookdrop-decision-and-kickoff.md) FIRST.
Also: CLAUDE.md, CURRENT_SPRINT.md, DATA_FLYWHEEL.md, LAUNCH_CHECKLIST.md.

## Strategy
- FinKeel = flagship money OS.
- BookDrop = thin bookkeeper portal + close-PREP, designed to MERGE into FinKeel later (or stay thin).
- NOT competing feature-for-feature with TaxDome / Financial Cents / Double / Botkeeper.

## This session phase only
Phase: [P0 | P1 | P2 | P3 | P4]   ← founder fills one

## Rules
- One phase only; stop when success criteria in BOOKDROP_KICKOFF.md met.
- No multi-vertical, no auto-post JE, no 12 workflow executors, no FinKeel repo edits unless I say dual-project.
- Architect-first for P2+: short plan → wait for "build approved" → code.
- Tests green; no fake AI marketing claims.

Start by confirming which phase and listing files you will touch.
```

### Goals / agents / loops
- **Yes:** one phase-scoped goal per session  
- **No:** open-ended multi-day autonomous build fleets  
- **MCPs if building cloud:** Supabase (BookDrop project), Vercel (bookkeeper-portal), optional GitHub  

---

## 4. What is saved where

| Content | Location |
|---|---|
| **This full handoff** | `docs/handoff/bookdrop-decision-and-kickoff.md` (AgentNativeMoat worktree) |
| FinKeel doc-extraction handoff (related, older) | `docs/handoff/finkeel-financial-doc-extraction.md` |
| AgentNativeMoat park of ANRA etc. | `docs/strategy/09-CONTROLLING-DECISION-park-2026-07-11.md` |
| BookDrop in-repo product docs | `CLAUDE.md`, `DATA_FLYWHEEL.md`, `CURRENT_SPRINT.md`, `V1_FEATURE_BACKLOG.md` |
| Chat-only (if not re-read this file) | Second-employee deep dive + competitor lock-in narrative — **now summarized in §1–2 above** |

**Gap fixed 2026-07-11:** earlier handoff was PARK-only; this revision includes build+merge strategy and full analysis summary.

---

## 5. Portfolio reminder

```text
1. FinKeel — primary ship/sell
2. BookDrop — optional thin build; merge-ready; phase-gated sessions
3. Do not run both at full intensity indefinitely without a WIP rule
```

---

*Update this file when a phase completes or strategy changes (park vs merge vs kill).*
