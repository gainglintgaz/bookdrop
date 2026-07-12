# BookDrop — Second-Employee Path Plan (truth-first, customizable, co-work)

> **Status:** PHASES 0–2 APPROVED TO BUILD (Victor 2026-07-11).  
> **Detail design:** `BOOKDROP_PHASE_0_2_DESIGN.md`  
> **Date:** 2026-07-11  
> **Worktree:** `bookdrop-work-20260711` / `feat/bookdrop-session-20260711`  
> **Authority:** Aligns with `DATA_FLYWHEEL.md` §D, `ai-first-principles`, `LEGAL_GUARDRAILS`, kickoff thin-portal + close-PREP (not TaxDome clone).

### Decisions locked (Victor)

| # | Decision | Locked choice |
|---|---|---|
| D2 | Client confirm identity | Magic-link only; full client accounts = **later separate phase** |
| D3 | Line storage | **Real table** `document_line_items` |
| D4 | Playbooks | After Phase 2 (Phase 4) |
| Audit | Everything | Append-only events + FinKeel-style `source_kind` / citations; provable confirm_at + token fingerprint |

---

## 0. Founder constraints (non-negotiable)

| Rule | Meaning in BookDrop |
|---|---|
| **Nothing fake** | No mock agents, no fake “I closed your books,” no invented confidence, no stub labeled Live, no hardcoded “16 engines” marketing |
| **Grounded** | Every number/action traces to uploads, requirements, completeness, corrections, reminder_log, or user-edited config |
| **No one-size-fits-all** | Defaults exist; every bookkeeper and every client can override (docs, schedule, workflow steps, sort/filter, categories) |
| **Co-work** | Bookkeeper ↔ client ↔ system share one period workspace; AI proposes; humans confirm/edit |
| **Editable system** | Add / edit / delete / reorder / create-own for requirements, exception rules, workflow steps, views — not static screens |
| **Legal** | Level 1–2 only: track, categorize, flag, package. **No** tax/filing advice (LEGAL Level 3) |

**Honest product name for this path:**  
*Collaborative month-close workspace with automations that earn trust — not a fully autonomous employee.*

---

## 1. Truth baseline (today)

### What is real
- Portal upload by `portal_token` (clients never log in)
- Per-client `document_requirements` with `sort_order` (already DB-backed, customizable at add/edit client)
- Auto-categorize on bank/CC upload + summary fields (migration 004)
- Bookkeeper Documents: exception strip + **summary-based** correction queue
- Completeness → package ready banner; ZIP/HTML package tools
- Dashboard urgency sort (local formula)
- **One** live workflow: `month-end-close-service` (needs **parsed statements** in session)
- Demo mode for sales; cloud needs founder env (`VICTOR_LAUNCH_ORDER.md`)

### What is **not** real (do not claim)
| Claim | Gap |
|---|---|
| Full agentic second employee | No multi-step agent loop with tools, memory, overnight jobs that *act* without human design |
| Client co-worker | Client sees classification receipt; **cannot** confirm/correct line items on portal |
| Full transaction memory | Upload row stores **summaries**, not full txn list → corrections often summary placeholders |
| 12 live workflows | Registry mostly stub/planned — honesty requires LOCKED/planned UI only |
| Self-learning firm brain | Corrections stored; **not** applied as strong per-client classifier loop yet |
| Personalized chase | Reminder tone exists; **not** behavior-learned per client (needs Loop 2+ + honest LOCKED) |
| QBO auto-post | Explicit non-goal without human approve |
| Cloud live | Resend/Stripe/`VITE_MODE=cloud`/R2 still founder |

### Gap that causes “everything feels unfinished”
**Default path is incomplete relative to §D:**  
Upload → summarize → bookkeeper sees counts → **client doesn’t finish the loop** → full txn text often missing → workflow needs re-parse in Analysis → stubs oversell automation.

---

## 2. Target architecture (roles)

```
                    ┌─────────────────────────────────────┐
                    │  Period workspace (client + month)   │
                    │  source of truth = docs + actions   │
                    └───────────────┬─────────────────────┘
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
    Client (portal)          Automations              Bookkeeper (app)
    upload / confirm         (pipelines, not          review exceptions
    required docs            freeform agents)         approve package
    optional notes           only on real data        customize rules
```

### Define “AI / agent / workflow” honestly

| Term | BookDrop meaning | Forbidden meaning |
|---|---|---|
| **Automation** | Deterministic or gated pipeline on **real** files/rows | “AI thinking…” with no work |
| **Workflow** | Ordered steps (parse → categorize → recon → package); **user-editable checklist** | 12 fake live buttons |
| **Agent (V1)** | *Optional later:* single-purpose job that proposes actions into a **review queue** | Unsupervised money/tax action |
| **Second employee** | Work arrives pre-sorted; exceptions only; package draft ready; humans approve | Silent GL post, fake hours saved |

**V1 principle:** *Hybrid by default; agent mode only when data density + human approve exist.*

---

## 3. Customization model (no one-size-fits-all)

### 3.1 Already partially true
- `document_requirements` per client: labels, doc_type, required, sort_order  
- Reminder schedules per client (schema)  
- Plan/tone on bookkeeper  

### 3.2 Must add (config tables — schema-first)

All **additive** migrations; never force one global checklist.

| Config entity | Scope | User can |
|---|---|---|
| **Requirement templates** | Bookkeeper library | CRUD + reorder; apply to new clients |
| **Client requirements** | Per client | Add/edit/delete/reorder (exists; polish UX) |
| **Category map** | Bookkeeper (+ optional client overrides) | Rename map, disable categories, add firm categories |
| **Exception rules** | Bookkeeper | Thresholds: e.g. flag if amount > X (user-set, not hardcoded $500 only) |
| **Workflow definitions** | Bookkeeper | Enable/disable steps; reorder; save “my close pack”; cannot invent illegal Level-3 steps |
| **Saved views** | Bookkeeper | Sort/filter dashboard (urgency, missing, package-ready); persist per user |
| **Portal confirm policy** | Per client | Require client confirm low-conf? optional vs required |
| **Reminder policy** | Per client | Days of month, tone; personalization LOCKED until Loop 2+ **with honest copy** |

**Anti-pattern ban:** hardcoded “everyone gets bank+CC+$50 receipts” as the only path without template override.

**Default ≠ prison:** ship good defaults from `tenant.config` / templates; every default is overridable.

---

## 4. Three build tracks (approved direction)

These are the high-leverage tracks (from prior message), expanded to meet co-work + customize rules.

---

### Track A — Client confirm loop (portal co-work)

**Job:** Client and bookkeeper share the same period truth; client helps only where AI is weak.

| Item | Spec |
|---|---|
| **Trigger** | After bank/CC auto-categorize succeeds with `lowConfidence > 0` **or** policy “always show confirm” |
| **Data truth** | Must store **line-level** parse results (not only summary) — see §5 schema |
| **Client UI** | Portal: “Confirm N items” — each line: merchant (truncated), amount, suggested category, **Accept / Change** |
| **Write** | `client_confirmed_at` on upload when all required confirms done; each change → `categorization_corrections` with `source: client_portal` |
| **Bookkeeper UI** | Documents: “Client confirmed 5/7 · 2 still open”; cannot invent confirms |
| **Customization** | Per-client: confirm required? optional? skip for receipt-only clients |
| **Empty/honest** | If parse failed: “We couldn’t read this file — upload a clearer PDF/CSV” — **no fake lines** |
| **Out of scope** | Client cannot post books, change other clients, see private notes |

**Success:** Client can complete confirm without an account; bookkeeper opens already-labeled period; zero fabricated categories.

---

### Track B — Judgment queue (bookkeeper default path)

**Job:** Bookkeeper opens app → **only human judgment**, not “click Run in Analysis.”

| Surface | Content (all real) |
|---|---|
| **Dashboard** | Urgency (exists) + filters: Missing docs / Client confirms pending / Low-conf open / Package ready / Unmatched recon |
| **Client Documents** | Unified **Work queue** tabs: Docs · Exceptions · (optional) Unmatched |
| **Exceptions** | Line-level from stored parse (after Track A data), not synthetic summary placeholders only |
| **Unmatched** | Only if recon ran on **real** statements + receipts; empty = “no recon yet” not “0 unmatched fabricated” |
| **Package** | Status from completeness (exists); draft when ready |

| Customization |
|---|
| Saved view: sort field, filters, pinned clients |
| Hide engines user doesn’t use (workflow steps off) |
| Exception threshold per firm (user-set) |

**Success:** Primary bookkeeper path never requires Analysis for routine close-prep; Analysis remains power-user.

---

### Track C — Workflows as editable playbooks (not theater)

**Job:** Automations are **real steps on real data**, user can shape them.

| Layer | Spec |
|---|---|
| **Registry honesty** | `live` only if executor runs and tests pass; else `planned`/`locked` with unlock copy |
| **Live V1 set** | Keep **one** (month-end service) until Track A data model solid; then optional 2nd only if grounded |
| **Playbook model** | `workflow_playbooks` (bookkeeper-owned): ordered `step_ids` from allowlist |
| **Allowlist steps** | parse_bank, categorize, completeness, package_draft, recon_unmatched, export_zip_meta — **no** “file 941”, “deduct this” |
| **Run** | Produces `workflow_runs` audit: steps, timestamps, `prompt_version` if any LLM, inputs = upload ids |
| **Create own** | User composes from allowlist; cannot free-type illegal actions |
| **Rearrange** | Drag order in UI; persisted sort_order |
| **Delete** | Soft-delete playbook; runs retained for audit |

**Success:** User never sees “Run” on a stub; custom playbook is composition of proven steps only.

---

## 5. Data model (required for truth + learning)

### 5.1 Persist line items (critical)

Today: summary only → corrections are weak.

**New (or expand JSON on upload with hard size limits):**

```text
document_line_items (or jsonb lines[] on document_uploads with max N)
  id, upload_id, line_index
  txn_date, description_raw, description_display (PII-truncated for AI)
  amount_cents (BIGINT)
  suggested_category, confidence
  final_category (null until confirm)
  confirmed_by: null | 'client' | 'bookkeeper'
  confirmed_at
  content/import hash for dedup
```

**Rules:** money = cents; never float; AI APIs get truncated merchant only (privacy).

### 5.2 Config / customization tables

```text
requirement_templates (bookkeeper_id, label, doc_type, required, sort_order)
workflow_playbooks (bookkeeper_id, name, steps jsonb, is_default)
dashboard_views (bookkeeper_id, name, filters jsonb, sort jsonb)
exception_policies (bookkeeper_id, amount_threshold_cents nullable, require_client_confirm bool)
```

### 5.3 Learning

- Every confirm/correct → `categorization_corrections` (exists)
- Apply **per bookkeeper + per client** learned map before global defaults (no silent global overwrite)
- Cross-firm aggregates: **k≥5**, never show below floor (existing aggregate rules)

---

## 6. Co-work flows (end-to-end)

### Flow 1 — Monthly collection + confirm
1. Bookkeeper sets/customizes requirements (or applies template)  
2. Client uploads via link  
3. System parses → writes **line items** + summary  
4. Client confirms low-conf (if policy on)  
5. Bookkeeper sees queue: remaining exceptions only  
6. Completeness pass → package ready  
7. Bookkeeper downloads ZIP/package — **approves** (human)

### Flow 2 — Bookkeeper customization
1. Edit template library  
2. Reorder client requirements  
3. Adjust exception policy  
4. Build playbook from allowlist steps  
5. Save dashboard view “Tax season chase”

### Flow 3 — What neither side gets (on purpose)
- Auto post to QBO  
- Tax “you should deduct”  
- Fake agent chat that invents balances  

---

## 7. Phased delivery (approve gate)

### Phase 0 — Honesty & foundation (≤1–2 sessions)
- [ ] Stub workflows: cannot “Run” if not live (UI already partial; enforce)  
- [ ] Docs: product claims = only live paths  
- [ ] Schema design locked for line_items + playbooks + views  
- [ ] **Victor: approve schema**

### Phase 1 — Line-level truth (Track A data)
- [ ] Migration: line items + indexes + RLS  
- [ ] Upload path writes lines (fail → empty lines + honest message)  
- [ ] Bookkeeper ExceptionsQueue reads **lines**, not synthetic summary-only  
- [ ] Tests: parse → lines → correction round-trip  
- [ ] **No client UI yet** until write path proven

### Phase 2 — Client confirm (Track A UX)
- [ ] Portal confirm UI (mobile-first)  
- [ ] Per-client policy: required/optional/off  
- [ ] Bookkeeper visibility of confirm progress  
- [ ] Tests + demo data with real line shapes  

### Phase 3 — Judgment hub (Track B)
- [ ] Dashboard filters + saved views  
- [ ] Documents work queue unified  
- [ ] Recon unmatched only when recon inputs real  
- [ ] Package status already largely done — wire to line completeness  

### Phase 4 — Editable playbooks (Track C)
- [ ] Playbook CRUD from allowlist  
- [ ] Runs audit table  
- [ ] Second live step only if Phase 1–2 green  

### Phase 5 — Earned intelligence (later)
- [ ] Reminder personalization LOCKED until Loop 2+ per client  
- [ ] Per-client category memory applied on next upload  
- [ ] Cross-firm only above k floors  

**Do not start Phase 4 before Phase 1.** Customizing fake steps is worse than no customization.

---

## 8. Definition of Done (per phase)

- [ ] `tsc` + vitest green  
- [ ] No new `// Simulated` or demo path pretending to be cloud  
- [ ] Every AI/automation output has provenance or data basis  
- [ ] Empty states honest  
- [ ] RLS on new tables  
- [ ] Dedup on imports  
- [ ] Customization: at least one user override path tested  
- [ ] LEGAL: no Level 3 copy  
- [ ] Session log + PROGRESS updated  

---

## 9. Effort reality (calendar)

| Phase | Rough effort | Depends on founder |
|---|---|---|
| 0 Honesty | 0.5–1 day | Approve |
| 1 Line items | 3–5 days | Dev only |
| 2 Client confirm | 3–5 days | Dev + demo UX review |
| 3 Judgment hub | 2–4 days | Dev |
| 4 Playbooks | 3–5 days | Dev |
| Cloud launch | parallel | **Victor** keys |

**Full “collaborative second employee” honest V1:** on order of **2–4 weeks** of focused build + your launch ops — not one session.

---

## 10. Explicit non-goals (this plan)

- Multi-vertical HOA/estate expansion  
- Full TaxDome practice OS  
- Multi-agent fleets, unattended multi-day goals  
- Auto-post JE / QBO OAuth (research only until approved)  
- Fabricating a general chat “CFO agent”  
- One static workflow for all industries without playbooks  

---

## 11. Decision checklist for Victor (approve before code)

1. **Approve Phase 0–2 first?** (truth + client confirm) — recommended  
2. **Client login:** stay magic-link only for confirm? (recommended yes)  
3. **Line storage:** separate table vs jsonb on upload? (recommend **table** for query/RLS/corrections)  
4. **Playbooks in V1 or after confirm loop?** (recommend **after** Phase 2)  
5. **Marketing:** freeze “AI second employee” until Phase 2–3 ship? (recommended)  

Reply with:  
`approve phases 0-2` | `approve all phases` | changes to decisions 2–4  

Implementation starts only after that.

---

## 12. One-sentence strategy

**Make the period workspace the product:** real documents → real lines → client and bookkeeper both edit truth → automations only on that truth → every firm customizes requirements, queues, and playbooks — never a one-size-fits-all theater app.**
