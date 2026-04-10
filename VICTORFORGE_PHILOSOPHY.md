# VICTORFORGE_PHILOSOPHY.md
## The principles that govern how we build at VictorForge

---

## The Core Bet

We are not building CRUD apps. We are building **structural moats** — products where
the value compounds over time and is hard to replicate because it lives in the data,
the workflow, or the network effect, not the code.

Every feature decision runs through one question:
**Does this make the product harder to leave or harder to copy?**

---

## How We Build

### Speed is a feature
- V1 ships in days. V2 takes weeks. V3 takes months.
- A working product in users' hands beats a perfect product in planning.
- Every day without a shipped product is a day without learning.

### Outcomes over output
- Lines of code are not progress. Working user flows are progress.
- "I built the API" is not done. "A user completed the flow end-to-end" is done.
- The Definition of Done is in CLAUDE_AUTONOMY_PROTOCOL.md — use it.

### Data integrity is non-negotiable
- A wrong number is worse than no number.
- Show what's missing. Lock the feature. Incomplete > Inaccurate.
- Every save is verified with a SELECT. Toast ≠ saved.

### Trust is the product
- For financial products: never show a number you can't source.
- For document products: never lose a file a user trusted you with.
- Privacy rules (no SSN, EIN, bank numbers to AI APIs) are permanent, not optional.

---

## The Vertical Chassis Model

Every VictorForge product is a vertical deployment of a universal chassis:

```
Universal Chassis (never touches vertical logic)
  ├── Auth (Supabase)
  ├── File storage (Supabase Storage)
  ├── Email (Resend)
  ├── Payments (Stripe)
  ├── Tenant config (tenant.config.ts)
  └── Core UI components

Vertical Config (tenant.config.ts)
  ├── productName, branding, colors
  ├── clientLabel, practitionerLabel
  ├── defaultDocumentTypes
  ├── featureFlags
  └── planLimits

Vertical-specific components (if needed)
  └── src/components/[vertical]/
```

This means:
- The same codebase serves bookkeepers, estate sale companies, HOAs, equine facilities
- Switching verticals = changing `.env` + `tenant.config.ts`
- No business logic lives in component copy — only in config

---

## The Anti-Commodity Checklist

Before shipping any feature, ask:
1. Does a competitor already do this exactly? (If yes — how do we do it better, not just different?)
2. What would make a user choose us over a spreadsheet? (If the answer isn't obvious, the feature isn't done.)
3. What does this product know after 3 months that it didn't know on day 1? (Value must compound.)
4. If we removed this feature, would a user leave? (Ship features users would miss.)

---

## The Session Rhythm

```
Start:   Read CLAUDE_AUTONOMY_PROTOCOL.md → CLAUDE.md → CURRENT_SPRINT.md → errors-fixed.json
Build:   One task at a time. Diagnose before touching code. Plan before touching 3+ files.
End:     Update CURRENT_SPRINT.md → Update SESSION_DEBRIEF.md → Suggest errors-fixed.json entries
```

No session ends without CURRENT_SPRINT.md updated. That's the contract.

---

## What "Done" Looks Like

A feature is done when:
- Build passes clean, zero console errors
- Data persists to DB (verified with SELECT — not just a toast)
- No fake/placeholder strings visible anywhere in the UI
- Loading state exists
- Error state exists
- Empty state exists
- CURRENT_SPRINT.md updated
- For anything touching numbers users act on: all data sources are real or clearly labeled as estimates
