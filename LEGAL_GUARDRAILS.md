# Legal Guardrails — VictorForge Products

## Applies To: BookDrop, FinKeel, and all future VictorForge products
## Last Updated: 2026-04-10
## Status: ACTIVE — Every Claude session must read this before building features

---

## Philosophy

**Show data. Never tell users what to do with it.**

A calculator is not an advisor. Categorization is not preparation.
Tracking is not filing. Observation is not recommendation.

Apps like NerdWallet, Bankrate, SmartAsset, Mint, Wave, Expensify, and QuickBooks
operate in the same space legally. The line is clear and well-tested.

**Better safe than sorry** — but "safe" doesn't mean "remove everything."
It means frame it right, disclaim it right, and never cross into advice territory.

---

## The Three Tiers

### Tier 1: LEGAL — Apps Do This Every Day (No License Needed)

| Activity | What's Required | Examples |
|----------|----------------|---------|
| Track tips/income | Nothing special | Every payroll app, Casio calculator |
| Expense categorization | Nothing | QuickBooks, Wave, Expensify |
| Tax estimation calculators | Disclaimers | NerdWallet, Bankrate, SmartAsset, TurboTax estimator |
| "You spent $X this month" | Nothing — it's a fact | Every finance app |
| Anonymized benchmarks | Privacy policy | "Businesses your size spend 12% on marketing" |
| Purchase recommendations (unpaid) | Nothing | "Eggs are cheaper at Aldi" |
| Price comparison | Nothing | GasBuddy, Basket, Flipp |
| Showing public tax rules/caps | Nothing — it's educational | "OBBBA cap is $25K/yr" |
| Ad targeting from user data | Privacy policy + opt-out | Google, Amazon, every retailer |
| Selling anonymized/aggregated data | Privacy policy, no user_id attached | Plaid, Square, Toast |
| Export data as CSV/PDF | Nothing | Every SaaS tool |

### Tier 2: REQUIRES REGISTRATION — But It's Easy/Cheap

| Activity | Registration | Cost | Notes |
|----------|-------------|------|-------|
| Data broker (selling identified user data) | State registrations (CA, VT, TX, OR, etc.) | ~$100-500/yr per state | Easy paperwork, just forms |
| Affiliate/endorsement (paid product recs) | FTC disclosure only | Free | Just say "sponsored" or "affiliate" |

### Tier 3: REQUIRES LICENSING — Hard Lines, Never Cross

| Activity | License Needed | Difficulty | Our Status |
|----------|---------------|------------|------------|
| Preparing tax returns for others | IRS PTIN + state reqs | Medium ($30.75 for PTIN) | NOT doing this — tracking ≠ preparing |
| Personalized investment advice for compensation | SEC/state RIA registration | Hard ($150K+ compliance) | NOT doing this |
| Money transmission (moving user funds) | State-by-state MSB licenses | Very hard ($500K+ bonds) | BANNED in all projects |
| Insurance advice | State insurance license | Medium | Not applicable |
| Filing taxes on behalf of users | PTIN + ERO credentials | Medium | NOT doing this |

---

## The Feature Safety Spectrum

Use this to evaluate any new feature before building:

### Level 1: ALWAYS FINE (build freely)
- Track/log/record data the user inputs
- Show totals, averages, sums, counts
- Categorize transactions by type/vendor
- Show public information (tax brackets, rate tables, cap amounts)
- Export user's own data in any format
- Compare user data to anonymized benchmarks

### Level 2: FINE WITH DISCLAIMERS (build with disclaimer)
- Estimate calculations based on public formulas
  - "Estimated deduction: ~$18,400 (based on public OBBBA formula)"
  - "Estimated quarterly tax: ~$X (based on standard self-employment rate)"
- Flag potential issues for review
  - "This vendor has received $600+ — may require 1099 review"
  - "This expense category has unusual activity"
- Show what-if scenarios
  - "If your income stays at this rate, your annual total would be ~$X"

**Required disclaimer for Level 2 features:**
```
This is an estimate for informational purposes only. It is not tax, legal, or
financial advice. Consult a qualified tax professional before making tax decisions.
```

### Level 3: NEVER BUILD (requires licensing)
- "You should deduct $X on Line 24b of Schedule 1"
- "Adjust your W-4 withholding"
- "Consider S-Corp election for tax savings"
- "File Form [X] to claim this"
- "You owe $X in taxes" (as a definitive statement)
- "Invest in [X]"
- "You should/must/need to [action]" (prescriptive financial action)
- Moving, holding, or transmitting user money

---

## Language Rules

### Banned Phrases (NEVER use in any product)
- "You should..." (financial/tax context)
- "We recommend..." (financial/tax context)
- "Deduct this on..."
- "File Form..."
- "Adjust your..."
- "Consider [financial action]..."
- "Tax advice" (never claim to provide it)
- "Financial advisor" (never claim to be one)
- "Guaranteed savings"
- "Immediate action recommended" (financial context)

### Safe Alternatives
| Instead of | Use |
|-----------|-----|
| "You should deduct this" | "Categorized as: Office Expense" |
| "We recommend filing..." | "1099 filing threshold reached for this vendor" |
| "Adjust your W-4" | "Your estimated withholding vs estimated liability" |
| "Tax savings: $X" | "Estimated deductible amount: ~$X (consult your tax professional)" |
| "You owe $X" | "Estimated liability based on inputs: ~$X" |
| "Immediate action recommended" | "Review with your accountant" |
| "Insights & Advice" | "Observations" or "Analysis" |
| "Consider S-Corp election" | (don't say it at all) |

---

## Per-Product Application

### BookDrop (Document Collection Portal)

**SAFE features (keep/build):**
- Client document upload tracking
- Auto-categorization of expenses
- Statement parsing and reconciliation
- Cash flow tracking and forecasting (observational)
- Vendor analysis and benchmarking
- Duplicate/anomaly detection
- Meeting agenda generation (with neutral language)
- Finance prep packages (organized data, not advice)
- 1099 vendor threshold tracking (flag, don't advise)
- Year-end summaries (data, not tax prep)

**ARCHIVED features (restore later with proper framing):**
- Tax estimation calculator — CAN be restored with Level 2 disclaimers
- Deduction categorization — CAN be restored as categorization only (not "you should deduct")
- Tax intelligence panel — Needs rewrite to remove prescriptive language before restoring

**BANNED features (never build without licensing):**
- "File this form" instructions
- Specific line-item tax filing guidance
- Tax return preparation
- Investment recommendations

### FinKeel (Personal Finance)

**Same rules apply.** Additionally:
- Receipt scanner: SAFE (it's OCR + categorization)
- Spending insights: SAFE (observational data)
- Budget tracking: SAFE
- "AI financial advisor" positioning: DANGEROUS — reframe as "AI financial tracker"
- Tax projections: SAFE with disclaimers
- Investment advice: NEVER (SEC territory)

---

## Data Monetization Rules

### Phase 1: Free (do now)
- Anonymized aggregate benchmarks shown to users
- Ad-supported free tier with privacy policy

### Phase 2: Easy Registration (when ready)
- Data broker registration if selling identified data ($100-500/yr per state)
- FTC disclosure for affiliate/endorsement deals

### Phase 3: Never Without Licensing
- Selling personalized financial/tax advice
- Acting as an intermediary for financial transactions

---

## Disclaimer Templates

### Calculator/Estimator Disclaimer (use on every estimation feature)
```
For informational purposes only. This is not tax, legal, or financial advice.
Results are estimates based on the information you provided and publicly available
formulas. Consult a qualified professional before making financial decisions.
```

### Data/Tracking Disclaimer (use on tracking features)
```
[Product Name] helps you organize and track your financial data.
It does not prepare tax returns or provide personalized tax advice.
```

### Export Disclaimer (include in exported files)
```
Generated by [Product Name] for organizational purposes.
This is not a tax document. Verify all figures with your tax professional.
```

---

## Enforcement: How Claude Sessions Must Use This

1. **Before building any feature** that touches money, taxes, categories, or recommendations:
   - Check this document
   - Determine the Level (1, 2, or 3)
   - If Level 2: add disclaimer
   - If Level 3: refuse to build, explain why

2. **Before writing any user-facing string** in financial context:
   - Check the Banned Phrases list
   - Use Safe Alternatives

3. **Before shipping any feature:**
   - Run the Language Audit: `grep -rn "should\|recommend\|advise\|deduct this\|file form\|adjust your" src/`
   - Any matches in user-facing strings must be rewritten

4. **For new product ideas:**
   - Map every feature to a Level
   - Document the mapping in the product's CLAUDE.md
   - Flag any Level 3 features immediately

---

## The OBBBA Example (How to Think About This)

| Level | Feature | Legal? |
|-------|---------|--------|
| Track tips — "Your YTD tips: $18,400" | Always fine | Level 1 |
| Show public caps — "OBBBA cap is $25K/yr" | Educational content | Level 1 |
| Estimate deduction — "Estimated: ~$18,400 (public formula)" | Fine with disclaimers | Level 2 |
| Tell user to deduct — "Deduct $18,400 on Line 24b" | Tax preparation | Level 3 (PTIN needed) |
| File for them — Submit to IRS | Tax return preparation | Level 3 (PTIN + ERO) |

**BookDrop/FinKeel can build up to Level 2. Level 3 requires licensing first.**

---

## Future: If Victor Gets a PTIN ($30.75)
A PTIN (Preparer Tax Identification Number) would unlock Level 3 for tax preparation.
The archived tax features on `archive/tax-features` branch can be restored.
But this is a business decision, not a code decision. Don't build Level 3 features
speculatively — wait for the license, then restore and adapt.

---

## Revision History
- 2026-04-10: Initial version. Created after legal audit of BookDrop and FinKeel.
