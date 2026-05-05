# BookDrop — Data Flywheel + AI-First Worksheet
Per-project worksheet filling in the universal frameworks at:
- `.claude/rules/ai-first-principles.md` §7
- `.claude/rules/data-flywheel.md` §12

This is the **honest** answer for BookDrop today (2026-05-05). Update as the product evolves; do not let this file go stale.

---

## §A — Define BookDrop's loop (ai-first-principles §7.1)

**One full cycle of user activity:**
A bookkeeper's monthly close cycle for one client.

- **Cycle start:** the period (year/month) opens — typically the 1st of the month
- **Cycle inputs:** client uploads bank statements, credit card statements, receipts, payroll, 1099s, etc.; bookkeeper reviews; categorization runs
- **Cycle work:** bookkeeper reconciles, books journal entries, reviews anomalies, signs off
- **Cycle outcome:** the period is **closed** — books match source documents, AJEs posted, package delivered to client, hours-saved metric captured
- **Cycle calendar time:** ~3-30 days depending on client complexity (1099 contractors with 50 transactions: 30 min; SMB with payroll + multi-state: several days)
- **Cycle output that feeds the next:** categorization corrections, recurring AJE templates, vendor classifications, anomaly thresholds — all stored per-client and per-bookkeeper

**Secondary loop (client side):** the client's monthly upload cycle. Cold-start client doesn't know what to upload; after Loop 2 the system pre-fills the upload checklist based on what they uploaded last month.

---

## §B — 5-Question Audit run (ai-first-principles §2)

Honest verdict for BookDrop V1 as currently shipped:

### Q1 — Removed-AI test
**If you stripped out all AI/LLM/automation tomorrow, does BookDrop still deliver core value?**
**Answer: YES** → AI is bolted on.

The current core flow (client uploads to portal → bookkeeper downloads ZIP → reminders go out on schedule) is fundamentally Dropbox + Calendly + Mailchimp. The 16 intelligence engines (categorization, reconciliation, anomaly detection, etc.) live in an opt-in Analysis tab — bookkeeper never has to click them.

**Verdict:** AI is decoration today. Q1 fails.

### Q2 — Flywheel test
**Does BookDrop get measurably smarter as more bookkeepers use it?**
**Answer: NO** → No flywheel today.

Each bookkeeper's data is fully isolated. Categorization corrections from bookkeeper A don't help bookkeeper B even when both are categorizing "Costco". No cross-bookkeeper benchmarks (yet). No shared vendor library (yet). RLS is correct on `bookkeeper_id = auth.uid()` but there's no anonymized aggregation layer behind it.

**Verdict:** No collective flywheel. Q2 fails.

### Q3 — Hours-replaced test
**Hours saved per cycle = ?**

| Where AI replaces work | Time per cycle | Notes |
|---|---|---|
| Auto-categorization on upload | ~2-4 hr/client/month | If actually wired into the core flow (see §D pivot work). Today it's optional. |
| Reconciliation (bank ↔ ledger ↔ source doc) | ~2-3 hr/client/month | Same caveat. |
| AJE recurring templates (V1.1+) | ~2-4 hr/client/month | Pattern designed; not built yet. |
| Anomaly detection / 1099 threshold flagging | ~1 hr/client/month | Rule-based today, not learned. |
| Total potential | **~7-12 hr/client/month** | Across 30 clients × $200/hr = $42K-72K/year of bookkeeper labor |

**Verdict:** Tier = "**Centered AI**" *if* the pivot work in §D ships. Today's V1 = **Polish AI** (the engines exist but aren't centered in the flow).

### Q4 — Cost-per-session test
**Marginal AI cost per active monthly close cycle = ?**

Best estimate (rough, needs measurement):
- Statement parsing: local heuristics first, Gemini fallback only on parse failure → ~$0.005/statement × 5 statements/cycle = $0.025/cycle
- Categorization: local rules first, LLM only on novel vendors → ~$0.01/cycle
- Reconciliation matching: pure SQL, no LLM → $0
- Recurring AJE diff alert: pure SQL, no LLM → $0
- Bookkeeper-ready package generation (HTML report): no LLM (templated) → $0
- Total: **~$0.04 / monthly close cycle / client**

**Verdict:** Tier = "**Scalable to free tier / sub-$1 paid tier**". The $39/$79 pricing has 1000× margin on AI cost. Q4 passes.

### Q5 — Proprietary advantage test
**What can BookDrop do that someone with the same Gemini/Claude API key cannot?**

Today: **Nothing of consequence.** Anyone could clone V1 in 30 days using off-the-shelf APIs.

The path to real proprietary advantage (not yet built):
- **Cross-bookkeeper categorization corpus** — anonymized vendor → category mappings from N bookkeepers' corrections, surfacing "bookkeepers similar to you classify Costco as: 60% Office Supplies, 30% Cost of Goods, 10% Meals" with source counts
- **Per-industry close patterns** — typical AJE patterns for restaurant clients vs SaaS clients vs construction clients, learned from labeled close cycles
- **Anomaly thresholds tuned to industry** — what's "unusual" for a restaurant's weekly Sysco invoice is normal; for a SaaS company it's a flag
- **Reconciliation pattern library** — common bank-statement formats from N institutions, parser improvements that compound

None of these exist today. Each requires the data flywheel (see §C) to start spinning before there's anything to learn from.

**Verdict:** Q5 currently FAILS. Path to PASS is clear but requires the flywheel.

### Verdict summary

| Q | Result |
|---|---|
| Q1 Removed-AI test | **FAIL** (AI bolted on) |
| Q2 Flywheel test | **FAIL** (no collective learning) |
| Q3 Hours-saved | Centered (potential) / Polish (today) |
| Q4 Cost-per-session | **PASS** |
| Q5 Proprietary advantage | **FAIL** (no moat data) |

**Current verdict: 1/5 PASS, 1/5 hybrid, 3/5 FAIL → Pivot required before V1 ships.**

The pivot is concrete and sequenced in §D below.

---

## §C — Map BookDrop's contribution types to data-flywheel.md §2

| Contribution type | BookDrop entity | Effort | Phase |
|---|---|---|---|
| **Outcomes** | Per-document parsing outcome (correct/wrong category, accuracy %, hours saved on this cycle vs estimate) | Low (auto-captured at sign-off) | A |
| **Ratings** | Per-document or per-cycle 1-5 ("did the auto-categorization save you time?") | Lowest | A |
| **Reviews** | Free-text "what did the AI miss this cycle?" at close-out | Medium | B |
| **Media uploads** | The source documents themselves (already core to product, not extra contribution) | n/a — core flow | n/a |
| **Likes** | Thumbs-up on a specific AJE template recommendation | Lowest | C |
| **Corrections** | Categorization corrections (most important contribution type — these train the classifier) | Medium (in-flow, not separate UX) | A — must be Phase A, not E |
| **Time / context** | Industry / firm size / client complexity tier — auto-captured per client at signup | Auto | A |

**Key adaptation:** for BookDrop, **corrections are not Phase E (later) — they are Phase A (must ship in V1)**. Categorization corrections are the highest-density training signal in the entire product. Without them, no flywheel.

---

## §D — BookDrop pivot to AI-first (the work to do before V1)

The 5-question audit failed 3/5. Pivot is mandatory. Concrete restructure:

### D.1 — Move auto-categorization to the upload moment
**Current:** Bookkeeper opens client → Documents tab shows uploaded files → switches to Analysis tab → clicks "Run categorization" → reviews results.
**Target:** Client uploads document via portal → categorization runs immediately → client sees a friendly "we already classified 23 of 30 transactions; please confirm the 7 we couldn't" → client confirms or corrects → bookkeeper opens the file already labeled.

Schema impact: `document_uploads` gets `auto_categorized_at`, `auto_categorization_confidence`, `client_confirmed_at` columns. Migration 004.

### D.2 — Reconciliation auto-runs when statements arrive
**Current:** Manual "Run reconciliation" button in Analysis tab.
**Target:** Soon as a bank statement arrives via portal upload, reconciliation runs → only unmatched items surface to bookkeeper. Bookkeeper opens client and sees "3 items need your judgment" not "click to start."

### D.3 — Reminders become AI-personalized (not template + tone toggle)
**Current:** Three tones: friendly / professional / firm. Sent on a schedule.
**Target:** System learns each client's behavior (always uploads on the 4th, ignores reminders before the 8th, responds to subject lines mentioning their accountant by name). Reminders adapt per client.

This needs Loop 2+ data per client before it can do anything beyond the current template behavior. Per the Trust Ladder (`ai-first-principles.md` §3), at Loop 0-1 reminders show LOCKED state for personalization with copy: *"After 2 monthly cycles we'll personalize each client's reminder schedule based on their actual upload behavior."*

### D.4 — Bookkeeper-ready package auto-generated
**Current:** Click "Generate Bookkeeper Package" button.
**Target:** Package generated automatically each month-end. Bookkeeper opens email → here's your package → click to review → sign off.

### D.5 — Dashboard "what needs your attention" sort
**Current:** All-clients table sorted by status alphabetically (or whatever default).
**Target:** Sorted by AI-derived urgency score: `(days_since_last_activity × incomplete_required_docs × historical_late_rate × current_period_progress)`. Bookkeeper opens BookDrop, sees the 3 clients most likely to need a nudge today.

### Effort estimate
~2-3 weeks of structural rework. Should happen before V1 launches publicly. Marketing copy that says "AI-powered" cannot be honest until this work is done.

---

## §E — Trust Ladder mapping (ai-first-principles §3)

| Loop count | What's available in BookDrop |
|---|---|
| Loop 0 (cold start, new bookkeeper, no clients yet) | Manual upload portal; reminder schedules with templated copy; ZIP download. Categorization engine exists but in PREVIEW state with copy "we'll learn your firm's category preferences after the first close cycle." Sample data demo mode. |
| Loop 1 (first client added, first cycle started, no completions yet) | Real-time auto-categorization on upload (using base classifier — no firm-specific learning yet); reconciliation engine running but with low confidence; manual reminder schedules. AJE template suggestions: LOCKED with "Unlocks after your first month-end close." |
| Loop 2 (first close cycle completed, 1 client) | Categorization tuned to this firm's category-correction history; cross-cycle "this client always sends bank statement on day 4" hint surfaces with explicit `n=1` disclosure. AJE recurring template: AVAILABLE with PREVIEW state "based on 1 close cycle". |
| Loop 3 (second close started, with first close's outcome captured) | Categorization confidence rises; client-behavior reminder personalization unlocks for that client; firm-level patterns start surfacing for the bookkeeper. |
| Loop 4-5 (a year of close cycles for a client, or a quarter for many clients) | Full self-tuning: anomaly thresholds adapt to client's industry baseline; AJE templates auto-suggest based on historical pattern; bookkeeper sees "based on 4 prior closes for similar clients" hints. Agent in opt-in preview: "Want me to draft the bookkeeper package for review?" |
| Loop 6+ | Full agent mode opt-in: "Auto-generate AJE candidates for the recurring 12 month-end entries." Always opt-in, never default. |

---

## §F — Anti-fabrication checks specific to BookDrop (data-flywheel.md §8)

| Check | Where it applies in BookDrop | Implementation |
|---|---|---|
| Substring validator on LLM output | Categorization explanations ("Why was this Costco transaction categorized as Office Supplies?") must cite an actual prior categorization or vendor rule | Reject any explanation that includes a vendor name or amount not present in the input transaction |
| No fake aggregate counts | Dashboard "X bookkeepers like you classify this vendor as Y" must NEVER appear with `count(distinct bookkeeper_id) < 5` — render LOCKED instead | k=5 default per data-flywheel.md §4 |
| No hardcoded "smart" categorization | Every classification must trace to: (a) a learned rule from this firm's history, (b) the cross-firm corpus (when k≥5), or (c) a generic Gemini call labeled as such | Audit by greps from `.claude/rules/bug-checklist.md` Bugs 1, 4, 5, 8, 11 |
| No fabricated reconciliation matches | Every "matched" claim must point to a specific source row | DB-level constraint: `reconciliation_match.source_id NOT NULL` |
| No "AI thinking…" theater | Categorization runs in <300ms with local heuristics; only show spinner if Gemini fallback actually fires | Timer + branch logic in upload handler |

---

## §G — Cold-start strategy for BookDrop (data-flywheel.md §6)

The flywheel starts empty. Cold-start plan:

### Bootstrap with deliberate seeding
1. **Pre-loaded vendor → category corpus** — start with Plaid's public merchant database categorized into IRS Schedule C categories. Not user-contributed, labeled clearly as "industry baseline" not "from BookDrop users."
2. **Demo mode data** — already exists. Five sample clients with realistic categorization corrections that show the AI working. Honest in-app copy: "this is sample data; your real categorizations will train the system on your actual firm's patterns."
3. **Founder + first 5 alpha CPAs** — capture every categorization correction during alpha. Even if k=5 isn't reached organically for a vendor, "5 CPAs tested this and 4 classified it as X" is honest aggregate.

### Honest copy progression

| State | Copy |
|---|---|
| New bookkeeper, no clients | "Add your first client to start. Categorization learns your firm's preferences after the first close cycle." |
| First client added, no transactions yet | "When your client uploads their first bank statement, we'll categorize using IRS Schedule C baseline. As you correct our suggestions, we'll learn your firm's pattern." |
| 1-49 transactions categorized (firm-level data still sparse) | "Based on your N corrections this month + IRS baseline. As your history grows, suggestions will reflect your firm's patterns more strongly." |
| 50+ transactions categorized for this firm | "Based on N corrections in your firm's history. Confidence: high." |
| Cross-firm aggregates available (k≥5 firms have categorized this vendor) | "Bookkeepers similar to you classify this vendor as: 60% Office Supplies, 30% Cost of Goods. Confidence: high." |

### What we will NOT do
- Show "1000+ bookkeepers trust BookDrop" when we have 12 alpha users
- Generate fake categorization confidence scores to make the UI look smart
- Pretend a generic Gemini call is "AI trained on accounting data" — if it's a vanilla Gemini Flash call, we say so

---

## §H — Sequenced build phases for BookDrop (data-flywheel.md §9)

| Phase | What | When |
|---|---|---|
| **A** | Outcomes + corrections (close-cycle outcomes, every categorization correction). Schema + RLS + capture in core flow. | **V1 launch** — non-negotiable |
| **B** | Text reviews + LLM summarization with substring validator. "What did the AI miss this cycle?" close-out prompt. | V1.1 |
| **C** | Likes (thumbs-up on AJE template recommendations) | V1.1 |
| **D** | Media uploads (already core to product — receipts, statements) | Done in V1 |
| **E** | Corrections workflow (already in Phase A for BookDrop, see §C) | Done in V1 |
| **F** | Cross-cycle pattern AI per-firm (substring-validated) | V1.2 — gated on Loop 4+ data per firm |
| **G** | Cross-firm collective AI ("bookkeepers like you") | V2 — gated on >50 firms with 6+ close cycles each (much higher threshold than the framework default because CPA accuracy bar is high) |

---

## §I — Cost realism for BookDrop

| Item | Free-tier accommodates | Paid-tier ceiling |
|---|---|---|
| Postgres rows | Supabase free 500MB ≈ ~3M typical rows. Each cycle = ~100 rows. 5 alpha bookkeepers × 30 clients × 12 months = 18K cycles = ~1.8M rows. **Free tier handles years 1-2.** | Pro $25/mo handles 1000 bookkeepers × 30 clients × 36 months ≈ 100M rows |
| Storage (uploaded docs) | Supabase 1GB ≈ ~1K documents. Realistic: 5 bookkeepers × 30 clients × 5 docs/month × 12 = 9K docs. **Need R2 from launch.** | R2: $0.015/GB after 10GB free, 9K docs ≈ ~9GB → $0/mo for first year |
| LLM categorization | Local heuristics first. Gemini Flash fallback for ~5% of novel transactions. 9K docs × 50 transactions × 5% × $0.0001 = $2.25/year for 5 bookkeepers | At 100 bookkeepers: ~$50/year LLM cost, ~$5K/mo revenue → 1% of revenue |
| Moderation API | Not needed for V1 (no public reviews yet) | Phase B onward: Cloud Vision SafeSearch on review media: ~$0.001/item |
| Aggregate refresh | Trivial CPU; nightly via Supabase Cron | n/a |

**Realistic spend at first 100 bookkeepers: ~$25-50/mo** (Supabase Pro + R2 + minimal LLM).

---

## §J — Decision rules for new BookDrop AI features

Apply to every proposed AI feature before building:

1. Run the 5-question audit (`ai-first-principles.md` §2). If Q1+Q2 fail, redesign.
2. Locate the feature on the Trust Ladder (`ai-first-principles.md` §3). What loop count does it require?
3. Pick its initial gating state: HIDDEN / LOCKED / PREVIEW / AVAILABLE / RECOMMENDED.
4. Pressure-test against anti-fabrication rules (`ai-first-principles.md` §5).
5. Write the LOCKED-state copy first (data-flywheel.md §4 + ai-first-principles.md §6). If you can't write it honestly, the feature is premature.

If the proposed feature can't pass all 5 checks, **don't ship it.** Park it as a future unlock with an honest "not yet" reason.

---

## §K — Update cadence

This worksheet is **alive**. Re-run each section quarterly or whenever:
- A new feature requires data the framework doesn't yet cover
- An audit verdict changes (a FAIL becomes a PARTIAL or PASS)
- A loop threshold is reached for the first time (sticky milestone — log the date)
- The cost-per-session changes by ≥2× from current estimate

Last updated: 2026-05-05.
