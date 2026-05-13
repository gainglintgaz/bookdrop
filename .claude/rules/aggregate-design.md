# aggregate-design.md — Cohort + Benchmark Design Rules

> **Authority:** Auto-loaded global rule. Applies to every VictorForge project that emits cross-user aggregate data.
> **Last updated:** 2026-04-27
> **Source:** Founder pre-mortem, FinKeel Sprint K8b (2026-04-27). A single global cohort floor produces meaningless or harmful benchmarks. This file is the contract for how aggregate insights are designed.

---

## §1 — The threat model (what bad cohort design produces)

1. **National-cohort grocery comparison** — "median Costco eggs $0.34" computed across 50 users in CA/NY/SC. Tells nobody the truth (CA price is different from SC price by ~30%).
2. **Single-tier global floor (50 users)** — 50 users in a CA city = meaningful for that city. 50 users spread across 30 cities = noise.
3. **Median rent without sub-metro axis** — "median NYC 1BR rent" smushes Manhattan SoHo + Queens Far Rockaway. Misleads both groups.
4. **Dining out without lifestyle bracket** — fast-food user vs business-traveler user same income bracket = totally different ticket sizes.
5. **Receipt prices without unit normalization** — "eggs $4.10" means nothing without quantity (per dozen? per 18-pack?).
6. **Cluster ignored** — bimodal distributions (e.g., regional pricing differences) get medianed into nonsense.
7. **Benchmark renders before enough time has passed** — 30 days of one user's grocery receipts isn't a cohort; it's a single household's habits.

This rule prevents all seven.

---

## §2 — Cohort axes (declare these per metric)

```typescript
type CohortAxes = {
  geo:    'metro_area' | 'sub_metro' | 'state' | 'national' | 'online_only'
  income: 'bracket'                  // 5 buckets: <30k, 30-60k, 60-100k, 100-150k, 150k+
  mode:   'personal' | 'business'
  segment: 'household_size' | 'industry_archetype' | 'lifestyle_bracket' | null
}
```

**`geo`** is the most important axis and is REQUIRED for almost every metric:

| Metric category | geo_required |
|---|---|
| Local goods (groceries, gas) | `metro_area` (CBSA — Census Core-Based Statistical Area) |
| Hyper-local (rent, dining, services) | `sub_metro` (neighborhood — when supported) |
| State-level (utilities, taxes) | `state` |
| Online-only (Amazon, subscriptions, AI tools) | `online_only` |
| Cross-region outcomes (debt strategy, goal completion) | `state` or `national` |
| Hybrid (freelance — could be local or remote) | `metro_or_online` |

**Rule:** if you can't declare a `geo_required` value with confidence, the metric isn't ready for benchmarks.

---

## §3 — Per-metric tiered floors (NOT a universal 50/100)

Every metric declares its own:

| Metric type | geo_required | min_users | min_obs | agreement_band | min_days |
|---|---|---|---|---|---|
| Groceries (per-unit) | metro | 30 | 100 | ±15% | 30 |
| Gas/fuel (per gallon) | metro | 30 | 100 | ±10% | 30 |
| Utilities | state | 30 | 100 | ±30% | 60 |
| Online purchases | national | 50 | 200 | ±10% | 30 |
| Subscriptions | national | 50 | 100 | ±5% | 30 |
| Freelance rates | metro_or_online | 20 | 75 | ±20% | 60 |
| Debt payoff outcomes | state | 50 | 150 | ±20% | 90 |
| Goal completion rates | national | 50 | 100 | ±20% | 60 |

**Definitions:**
- `min_users` — distinct users contributing to the cohort. Privacy floor.
- `min_obs` — total observation rows backing the metric. Statistical floor.
- `agreement_band` — % of median that observations must cluster within (data agreement threshold).
- `min_days` — time-of-cohort accumulation before the metric is allowed to render.

**All four gates fire AND.** If any one fails, refuse to emit benchmark.

---

## §4 — Metrics EXPLICITLY EXCLUDED from V1 cohort emission

These have lifestyle/sub-metro/cluster issues that single-axis cohorts cannot resolve. Render NOTHING for these in V1, possibly never:

| Metric | Why excluded |
|---|---|
| **Dining out** | 3+ different markets (fast-food / casual / fine dining); income drives lifestyle drives ticket size; privacy-sensitive |
| **Rent** | 6+ axes deep (sub-metro × unit type × class × stabilization × sq ft × lease vintage); needs 10K+ users per metro |
| **Alcohol / cocktails** | Pricing varies by venue type (bar vs liquor store vs grocery); social signaling; privacy-sensitive |
| **Entertainment / vacation / travel** | Income + lifestyle determine entirely different markets |
| **Gifts / charitable giving** | Personal value system; cohort comparison is borderline harmful |
| **Healthcare / medical** | Insurance variance dominates pricing; shouldn't compare across plans |

When ready (V3+ for any of these), require ALL of:
- Opt-in setting ("Show comparison benchmarks for sensitive categories")
- Lifestyle/bracket axis added to cohort key
- Range presentation, not point estimate ("households like yours dine out 2-8 times/month")
- Frame as observation, never judgement

---

## §5 — Unit normalization (mandatory for product-price benchmarks)

Receipt OCR currently extracts `{merchant, items, total, date}`. For benchmark eligibility, must extract:

```typescript
type LineItemNormalized = {
  raw_line: string                  // "EGGS LRG 18CT"
  product_normalized: string        // "eggs_large" — canonical key
  quantity: number                  // 18
  unit: 'count' | 'oz' | 'lb' | 'gallon' | 'qt' | 'pt' | 'pack' | 'roll' | ...
  raw_price_cents: number           // 599
  price_per_unit_cents: number      // 33.3   ← 599 / 18
  canonical_unit: 'egg' | 'pound' | 'gallon' | ...
}
```

### §5.1 Canonical units (required for V1)

| Product | Canonical unit | Conversion |
|---|---|---|
| Eggs | per egg | dozen → 12, 18ct → 18 |
| Milk | per gallon | qt → 0.25, half-gal → 0.5 |
| Gas | per gallon | (already standard) |
| Meat | per pound | oz → 0.0625 |
| Bread | per loaf | (count) |
| Coffee beans | per pound | oz → 0.0625 |
| Toilet paper | per roll | (count) |

### §5.2 Skip per-unit benchmarks for

- Anything with serving-size variability (cereal: 12oz vs 18oz boxes don't compare)
- Anything with branding effects (organic vs not, generic vs name-brand) — too biased
- Restaurant tickets (no unit at all; use range bracket if anything)
- Subscriptions ("Netflix $15.99" is fine as-is — the price IS the unit)

### §5.3 Without unit, no benchmark

Empty state for product-price benchmarks: "Add N receipts with quantities to unlock price comparisons."

---

## §6 — Cluster detection (data-agreement gate)

```
1. Collect all per-unit prices for (metric, cohort)
   e.g., 30 grocery receipts for "eggs_large" in Greenville-MSA
2. Compute median price_per_unit_cents
3. Count observations within ±agreement_band of median
4. agreement_score = within_band / total_observations
5. If agreement_score < threshold (0.50 default, 0.70 for some metrics) → bimodal
   → either:
     a) split cohort by another axis (e.g., merchant, sub-metro)
     b) refuse to emit benchmark; log "split required" for human review
```

### §6.1 Real example

Cohort: "Greenville-MSA Personal" — 30 receipts of "eggs_large at Costco":

```
Distribution: $0.32, $0.33, $0.34, ..., $0.35 → median $0.34
Within ±15% of $0.34: 28 of 30 receipts
agreement_score = 0.93
Result: PASSES → emit benchmark
```

vs. cluster-fail example:

```
Distribution: 15 receipts at $0.32-$0.36, 15 receipts at $0.62-$0.68 → median $0.50
Within ±15% of $0.50: 0 receipts
agreement_score = 0.00
Result: FAIL → refuse to emit; human review
Likely cause: two different store IDs were merged; split by store, retry
```

---

## §7 — Aggregator architecture (server-side only)

Per-project: a nightly Edge Function `aggregate-rebuilder` that:

```
1. Read decision_log + transactions/receipts (with user_id) from prod
2. For each metric in BRAIN_METRICS_V1 whitelist:
   a. Group by (decision_type, cohort_key)
   b. Apply gates: minUsers, minObs, minDays
   c. Apply unit normalization (skip if not normalized)
   d. Compute median + agreement_score per cluster
   e. Suppress cohorts/metrics that fail any gate
3. Strip user_id; insert anonymized rows into decision_outcomes_anonymous
4. Compute percentile_25/50/75 per (metric, cohort_key)
5. Truncate stale benchmarks_v1 rows; reinsert only `render_threshold_met = true`
6. Log run summary
```

### §7.1 Privacy hardening (mandatory)

- Cohort key NEVER computed in browser. Only server-side aggregator.
- `decision_outcomes_anonymous`: NO user_id, NO household_id, day-precision DATE only.
- Aggregator strips user_id BEFORE insert. Refuses to emit cohorts below floor.
- Run inside service-role context; never accessible to authenticated users.

### §7.2 Frontend gates

Frontend benchmark consumers MUST:

```typescript
// READ
const { data } = await supabase
  .from('benchmarks_v1')
  .select('*')
  .eq('metric_name', 'eggs_per_egg')
  .eq('geo_required', 'metro')
  .eq('metro_area', userMetroArea)
  .eq('render_threshold_met', true)         // ← MANDATORY
  .single()

if (!data) return <EmptyState />            // honest empty state
return <BenchmarkCard data={data} />        // safe to render
```

**Tripwire:** any frontend read of `benchmarks_v1` without `render_threshold_met = true` filter = merge-block.

**Concrete reference implementation:** FinKeel's `src/components/dashboard/BenchmarkPeerCard.tsx` (Sprint M6, commit `2c614b52`). Demonstrates the gate pattern with three layers of defense:

1. **SELECT filter** — `.eq('render_threshold_met', true)` at the query level
2. **Row-shape predicate** — `(r): r is BenchmarkRow => r != null && r.render_threshold_met === true` in the .filter() chain
3. **Render-time gate** — empty state if no row matches all three layers

All three are co-located in the only consumer. New consumers should mirror this pattern; do not create a "thin reader" that bypasses any layer for performance — at FinKeel's scale the cost is zero, and the privacy + accuracy floor is non-negotiable.

**Empty state copy** (also from M6): "Comparison data unlocks as more households like yours join. We won't show numbers until the data is reliable." Honest, doesn't apologize, doesn't promise dates.

---

## §8 — Definition of Done (every aggregate feature)

Before merging an aggregate/benchmark feature:

- [ ] Cohort axes declared in `BRAIN_THRESHOLDS` per-metric table
- [ ] geo_required is metro/sub-metro/state/national/online (declared)
- [ ] All four gates wired: min_users, min_obs, agreement_band, min_days
- [ ] Unit normalization implemented (if product-price metric)
- [ ] Cluster detection in aggregator (split or refuse)
- [ ] Frontend renders empty state when `render_threshold_met = false`
- [ ] Privacy: cohort_key not computed client-side; aggregator strips user_id
- [ ] Test: run aggregator on staging dataset; verify expected cohorts emit, expected ones suppress
- [ ] Documentation: data-flow.md §5 entry for the new metric
- [ ] Compliance: not in EXCLUDED list (§4); if borderline, add opt-in setting

---

## §9 — Add a new benchmark metric (procedure)

When proposing a new aggregate:

```
Q1. What metric? (e.g., "median monthly grocery spend")
Q2. What is geo_required? (e.g., metro_area)
Q3. What is the unit, if any? (e.g., dollars/month — non-product, no normalization needed)
Q4. What's the agreement_band threshold? (variance tolerance)
Q5. What's the min_users / min_obs / min_days? (justify per-metric)
Q6. Is this metric in §4 EXCLUDED list? If yes, stop.
Q7. What does the empty state say if cohort floor isn't met?
Q8. What's the privacy posture: any PII risk?
```

If all 8 are answered → propose `BRAIN_THRESHOLDS` entry → user approval → ship.

If any answer is "I'm not sure" → ask Victor before coding.

---

## §10 — Cross-project shared learnings

**Founder rule (Victor, 2026-04-27):**
> "I'd rather have it show zero, not available, or locked than give false insight or advice. An honest 'not enough data yet' is better than an incorrect number."

This applies to:
- FinKeel — receipt prices, debt outcomes, goal completion
- HuntHive — purchase research aggregates
- BookDrop — workflow benchmarks across bookkeeping clients
- Any future project with cross-user data

**Universal rule:** never render an aggregate that could mislead even one user. Floor design favors truth over feature density.

---

*This rule supersedes any single-tier cohort design. Project-level aggregate-design.md may add stricter floors but never relax these.*
