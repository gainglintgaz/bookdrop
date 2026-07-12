# BookDrop Phase 5.1 — Multi-period cycles + ship gate

> **Status:** Implemented + tests green (2026-07-12)  
> **Depends on:** Phase 5 (per-client memory + reminder lock stub)  
> **Not in scope:** Resend/Stripe keys, VITE_MODE=cloud flip, new workflows, tax advice

---

## 1. Problem (user-facing)

Today the client detail “Earned intelligence” strip only counts **the month you’re looking at**.

- If April is complete → Loop = 1  
- Even if Jan–Mar were also complete in the DB → we still show Loop = 1  
- Reminder personalization never unlocks honestly from real history  

**What the bookkeeper should experience:**  
“This client has finished **3** month packages. Personalized reminder timing is unlocked. Median completion day so far: **4** (based on 3 months).”

If they only have 0–1 complete months: honest locked copy, no invented day.

---

## 2. Definition of a cycle (locked)

| Term | Rule |
|---|---|
| **Period** | `(period_year, period_month)` |
| **Required docs** | Count of `document_requirements` where `required = true` **for this client today** |
| **Uploaded required** | Distinct required `requirement_id`s that have ≥1 upload row for that period |
| **Complete cycle** | `requiredDocs > 0` AND `uploadedRequiredDocs >= requiredDocs` |
| **Completion day** | Day-of-month (1–31) of the **latest** `uploaded_at` among required uploads for that period when complete; else null |
| **Loop count** | Count of complete cycles in lookback (not calendar span) |

**Assumption (disclosed):** requirement list is treated as stable across history. If the firm adds a new required bank mid-year, older months may under-count completeness. UI data basis: *“Using current requirement list against past uploads.”*

**Lookback:** last **12** months from “now” (or from selected period end), inclusive. Older periods ignored for V1 gate.

**What does NOT count as a cycle:** months with 0 required docs; months never touched; incomplete months.

---

## 3. Architecture

```
document_requirements (client) + document_uploads (client, all periods in lookback)
        │
        ▼
 buildPeriodSnapshots()     ← pure, unit-tested
        │
        ▼
 countCompletedCycles() + submissionDays[]
        │
        ▼
 getReminderPersonalizationState(loopCount)
 inferPreferredSubmissionDay({ loopCount, submissionDays })
        │
        ▼
 ClientDetail “Earned intelligence” strip
```

| Layer | File | Responsibility |
|---|---|---|
| Pure math | `client-cycles.ts` | snapshots, counts, gates, median day |
| Data load | `db.ts` (+ demo helper) | fetch uploads for client (light columns); demo multi-period seed |
| UI | `ClientDetailPage.tsx` | load history once; show loop + locked/unlocked honestly |
| Ship gate | this session | tests, greps, PR note, no cloud secret inventing |

**No new tables.** Read path only on existing uploads/requirements.

---

## 4. Demo honesty

Demo today only has **current** period uploads → Loop 0 or 1.

**Change:** seed **client-001 (Riverside)** with **two prior complete months** (real-shaped upload rows) so demo can show Loop ≥ 2 unlock path without faking a number.

Other clients stay sparse (partial / 0) to prove locked state still works.

---

## 5. Empty / wrong data states

| State | UX |
|---|---|
| 0 complete cycles | Locked copy; category memory still works |
| 1 complete cycle | Locked; “1 / 2” progress |
| 2+ complete, &lt;2 completion days | Unlocked timing gate; preferred day still null (“need more completion dates”) |
| 2+ days | Show median day + data basis string |
| Cloud fetch fails | Keep current-period-only fallback; surface small amber note “History unavailable — showing this month only” |

---

## 6. Ship-gate checklist (this session)

- [ ] Design (this file)  
- [ ] `buildPeriodSnapshots` + tests  
- [ ] Cloud + demo load path  
- [ ] Wire ClientDetail strip  
- [ ] Demo seed for Riverside multi-period  
- [ ] `tsc` + full vitest  
- [ ] Tripwires: no Level-3 tax copy; no fabricated loop counts  
- [ ] Commit + push to PR #16  
- [ ] Optional: fix known API TS noise (sign-document rate limit narrowing) if cheap  

**Out of scope for 5.1:** flipping VITE_MODE, Resend live email, Stripe checkout, R2 backup drill (founder).

---

## 7. Success criteria

1. Bookkeeper opens Riverside (demo) → strip shows **≥2 complete months** and unlocked personalization *or* preferred day with basis.  
2. Bookkeeper opens incomplete client → strip stays **locked** with honest denominator.  
3. Unit tests prove snapshot math + no cross-client bleed (memory already Phase 5).  
4. CI still green on PR branch.

---

## 8. Implementation order

1. Extend `client-cycles.ts` (pure)  
2. Tests first for snapshots  
3. `fetchClientUploadHistory` + demo multi-period  
4. ClientDetail load + UI  
5. Full verify + commit  
