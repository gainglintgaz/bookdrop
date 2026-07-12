# BookDrop — AI-Native “Second Employee” Next Plan

> **Date:** 2026-07-12  
> **After:** PR #16 merged (phases 0–5.1) · production redeploy  
> **Philosophy:** One app. One period workspace. AI does the prep; humans approve. Nothing fake. No Level-3 tax advice.  
> **Not competing with:** TaxDome practice management, full Digits GL replacement, Botkeeper human BPO.

---

## 0. What we just shipped (foundation)

| Capability | Status |
|---|---|
| Portal collect + reminders + ZIP | ✅ real |
| Line-level truth + client confirm | ✅ real |
| Exceptions queue + per-client memory | ✅ real |
| Judgment hub filters | ✅ real |
| Editable playbooks (allowlist) | ✅ real |
| Multi-period loop gates | ✅ real |
| Cloud flip / Resend / Stripe / R2 | ❌ founder |

**Honest product today:** collaborative close-**PREP** workspace with automations that earn trust.  
**Not yet:** unsupervised second employee posting books.

---

## 1. Market map (what to borrow vs refuse)

Sources: Digits, Dext, Hubdoc, Botkeeper, Booke AI, Puzzle, Numeric, FloQast (2025–2026 positioning).

| Competitor pattern | What they do | Borrow for BookDrop? | How (honest) |
|---|---|---|---|
| **Dext / Hubdoc capture** | Client photos/email → OCR → publish to QBO/Xero | **Yes (core moat path)** | Receipt/invoice OCR into **same** line table + period workspace — not a second app |
| **Digits “Agentic Close”** | Always-on categorize + recon + close autopilot | **Partial** | Nightly **prep** agent: run playbook → queue only exceptions. **No** silent GL post |
| **Botkeeper hybrid** | AI + human service | **Product shape** | BookDrop = software that makes *your* bookkeeper the human layer; not white-label BPO |
| **Booke RPA into QBO** | Robot clicks QBO screens | **Later / careful** | Prefer official APIs over RPA; V2 “export/approve to QBO” with human click |
| **Numeric / FloQast close agents** | Flux, recon checklist, auditable agents | **Yes (checklist + audit)** | Period checklist agent + flux *flags* (observation only), `prompt_version` on every LLM step |
| **ClickUp-style close super-agent** | Auto checklist per period | **Yes** | On period open: instantiate playbook run + tasks from requirements — pure orchestration |

### What we refuse (legal + trust)
- “You should deduct / file Form / invest” (Level 3)
- Fake “books closed” without package approve
- Cross-firm category tips below k≥5
- Agent that moves money or posts JE without explicit bookkeeper approve

---

## 2. Target: one app = second-employee **desk**

```
┌──────────────────────────────────────────────────────────────┐
│  PERIOD DESK (client × month) — single home screen            │
│  Collect → Confirm → Exceptions → Recon → Package → Approve  │
└──────────────────────────────────────────────────────────────┘
         │              │              │
    Portal agent   Prep agent     Memory agent
    (chase docs)   (playbook)     (learn fixes)
```

**Second employee definition (BookDrop):**  
Every morning the bookkeeper opens **one desk** and sees only: incomplete clients, unconfirmed lines, unmatched bank lines, package ready to download — work already pre-run by automations overnight.

**Not:** a chat bot that claims to be an employee.  
**Not:** five tabs + Analysis scavenger hunt.

---

## 3. AI-first re-audit target (from DATA_FLYWHEEL 1/5 → ≥3/5)

| Question | Today | Target after Next Wave |
|---|---|---|
| Q1 Removed-AI | YES (portal still works) | **NO** for close-prep path: without auto-lines/confirm/playbook, product is just Dropbox |
| Q2 Flywheel | NO | **YES** personal flywheel (per-client memory); collective later at k≥5 |
| Q3 Hours | polish if unused | **30 min–hours** per client when desk is default path |
| Q4 Cost | ~$0.04 | keep &lt;$0.50/session |
| Q5 Moat | weak | corrections + confirm events + playbook runs = proprietary behavior data |

**Mechanical test:** strip AI/automation from default Documents + Upload path → product must feel broken (not optional Analysis).

---

## 4. Architecture for “agentic” without theater

### 4.1 Agent = tool-using job with audit trail

```typescript
// Conceptual — implement as Edge Function + workflow_runs
type ClosePrepAgentRun = {
  clientId: string
  period: { year: number; month: number }
  playbookId: string
  tools: Array<'parse' | 'categorize' | 'memory_apply' | 'completeness' | 'package' | 'exception_queue'>
  status: 'queued' | 'running' | 'awaiting_human' | 'complete' | 'failed'
  steps: WorkflowStep[]  // existing
  humanGate: 'required'  // always for package approve
}
```

### 4.2 Three agents (V1 names honest)

| Agent | Trigger | Actions | Human gate |
|---|---|---|---|
| **Collect Agent** | Day-of-month / manual | Completeness check; draft reminder (tone default until Loop 2) | Send reminder (or auto if paid + opt-in) |
| **Prep Agent** | Upload complete OR nightly | Run client default playbook; write lines; build exception queue | Review exceptions |
| **Memory Agent** | On correction | Update per-client map; re-score open low-confidence lines | None (deterministic) |

No free-form multi-tool LLM loop in V1 unless every tool is allowlisted and every output is validated.

### 4.3 Model routing (latest tech, practical)

| Task | Default | Why |
|---|---|---|
| OCR / vision statements | Gemini Flash (server) | Cheap vision; already in FinKeel patterns |
| Novel vendor classify | Local rules first → LLM fallback | Cost sentinel |
| Exception narrative (“why flagged”) | Small LLM, substring-validate | Trust |
| Chat “what’s blocking close?” | RAG over **this client’s** period rows only | No hallucinated balances |
| Cross-firm tips | SQL aggregates only, k≥5 | No LLM needed |

**Provider abstraction:** keep Edge Function interface; no `VITE_` secrets; log `prompt_version`.

---

## 5. Next build wave (ordered)

### Wave A — **Period Desk** (UX unification) — highest leverage
**Job:** Stop multi-app / multi-tab feeling.

1. **Client Period Desk** route: one page with stages  
   `Collect | Confirm | Exceptions | Recon | Package | History`  
2. Default land here from dashboard urgency row click  
3. Hide Analysis engines behind “Power tools” unless desk needs them  
4. Empty states teach the loop  

**Success:** stranger understands product in 5 seconds on Desk; no need for Analysis to close-prep.

### Wave B — **Overnight Prep Agent** (real agentic)
1. Edge Function `run-close-prep` (service role + cron secret)  
2. Dispatcher: clients with new uploads OR period day ≥ N  
3. Execute default playbook server-side when statements in storage (not only browser parse)  
4. Write `workflow_runs` + notify bookkeeper “3 clients ready for exceptions”  
5. **Always** leave package at `ready_for_review` not auto-sent  

**Success:** bookkeeper opens app → work already done overnight.

### Wave C — **Capture expansion** (Dext-class inside same desk)
1. Receipt OCR → line items (same `document_line_items`)  
2. Email-forward inbox (later)  
3. Dedup hash on content  

**Success:** bank + receipt live in one exceptions queue.

### Wave D — **Firm brain (flywheel)**
1. Anonymized vendor→category aggregates k≥5  
2. Optional “firms like yours” on exceptions (observation only)  
3. Nightly aggregate-rebuilder pattern (from FinKeel)

### Wave E — **Approve → export** (not RPA yet)
1. QBO/Xero CSV/IIF export from package  
2. Later: OAuth post with explicit “Approve & push”  

---

## 6. Recommended sequence (next 2–4 sessions)

| Priority | Work | Type | Owner |
|---|---|---|---|
| **P0** | Founder: Resend + Stripe + `VITE_MODE=cloud` | Launch | Victor |
| **P1** | **Period Desk UI** (Wave A) | Design → code | Agent |
| **P2** | Server-side playbook on upload complete (half of Wave B) | Code | Agent |
| **P3** | Cron prep agent + inbox notification | Code | Agent |
| **P4** | Receipt → same line spine | Code | Agent |
| **P5** | Firm aggregate k≥5 (only after cloud users) | Code | Agent |

**Do not start:** free-chat agent that invents numbers; 12 new stub workflows; QBO RPA.

---

## 7. Definition of Done for “AI-native enough”

- [ ] Default path = Period Desk (not Analysis scavenger hunt)  
- [ ] Upload → lines → confirm → exceptions without leaving Desk  
- [ ] ≥1 overnight/cron agent run that produces **real** `workflow_runs`  
- [ ] AI-first audit ≥3/5 PASS with written answers in DATA_FLYWHEEL  
- [ ] Every LLM call: server-side, PII scrubbed, `prompt_version`  
- [ ] Package still human-approved  

---

## 8. One-sentence roadmap

**Turn BookDrop from “portal + engines” into a single Period Desk where Collect / Prep / Memory agents pre-work the month, and the bookkeeper only judges exceptions and approves the package — borrowing Dext’s capture unity, Digits’ agentic close *prep*, and FloQast’s auditable checklist — without becoming a fake full GL employee.**

---

## 9. Immediate next coding kickoff (when approved)

**Session goal:** Wave A scaffold — `ClientPeriodDesk` page  
- Wire existing Documents + Exceptions + Confirm strip + Package banner into stages  
- Dashboard → Desk deep link with `?year=&month=`  
- No new LLM yet  

Then Wave B design spike: storage → server parse feasibility for bank PDFs.
