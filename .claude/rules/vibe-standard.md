# The VIBE Standard v5.3 — 54 Mandatory Rules
These rules are absolute. Do not deviate.

## I. Execution & Discipline (1-6)
1. **Atomic Tasks:** ONE problem at a time. Max 1-2 file changes per iteration.
2. **Think Before Coding:** Explain plan, list affected files, identify risks FIRST.
3. **Self-Review:** After each change, critique edge cases, duplication, consistency.
4. **Verification Required:** List exactly what to test. Do not proceed until verified.
5. **Zero Silent Failures:** Fix all console errors, TS warnings, UI glitches immediately.
6. **Consistency Over Creativity:** Follow existing patterns. Never introduce new styles.

## II. UI & UX (7-11)
7. **No All-Caps/Italic Headers:** Title Case + font-semibold + tracking-tight only.
8. **Primary Color:** Use the project's design system tokens. No ad-hoc hex colors.
9. **Clean Spacing:** 8/16/24/32/40/48/64/80px increments. Card padding ~p-6.
10. **Simple UX:** App must feel self-explanatory. Add micro helper text where needed.
11. **Honest Strings:** Every metric, percentage, and label must reflect REAL data. No fake numbers.

## III. State & Data (12-14)
12. **State Persists:** Critical state uses Zustand persist + localStorage.
13. **Fresh Data:** Never rely on stale state. Fetch fresh data when needed.
14. **Money & Math:** ALWAYS stored as BIGINT cents in DB. / 100 for display. NEVER floating-point.

## IV. Architecture (15-22)
15. **Learning System:** Before building: check golden-paths + errors-fixed.json. After: update both.
16. **Reuse Before Build:** Search codebase first. Don't reinvent.
17. **Do Not Overbuild:** Simplest working solution first.
18. **Mode Safety (Identity Firewall):** Always confirm currentMode. Never mix data across modes. Clear ALL arrays on mode switch.
19. **Scope Lock:** Only work on CURRENT TASK from CURRENT_SPRINT.md.
20. **Fail Fast:** If something breaks, stop, find root cause, revert if needed.
21. **Rule Evolution:** After milestones, suggest rule updates.
22. **Compute Placement:** UI is for display. Heavy computations on backend (Edge Functions/RPCs).

## V. AI Boundaries (23-26)
23. **PII Scrubbing:** NEVER send raw SSNs, EINs, bank numbers, full names to any AI API. Truncate merchants to 20 chars.
24. **Invisible Ledger:** AI output NEVER written raw to DB. Always safeParseJson() + mapping layer.
25. **API Cost Sentinel:** Default to local computation. Rate-limit external AI calls.
26. **Golden Path First:** Prove the happy path works before coding edge cases.

## VI. Git Hygiene (27-33)
27. **Session Start:** Run `git worktree list` + `git branch -a` before any changes.
28. **Correct Branch:** Never start work without confirming you're on the right branch.
29. **Worktree Check:** If multiple worktrees exist, identify latest and merge/rebase first.
30. **Cleanup:** After merge, delete stale worktrees.
31. **Missing Feature Check:** Check other branches FIRST before reimplementing.
32. **Authoritative Branch:** `main` is canonical. All work rebases onto main.
33. **Never Commit Secrets:** .env files go in .env.local (git-ignored). Pre-commit hook blocks secrets.

## VII. Universal Rules (34-43)
34. **"Temporary" Doesn't Exist.** Every placeholder ships. Build it real or don't build it.
35. **Build Passing != Working.** Must verify: build + tests + browser + DB round-trip.
36. **Two Insert Paths = Double Audit.** Multiple write paths? Audit ALL on schema changes.
37. **23505 = Already Saved.** UNIQUE violation = skip silently. NEVER retry with new ID.
38. **Migrations Are STALE.** Always verify live DB schema via SQL audit before changes.
39. **System Boundary Bugs.** "Not found in code" != "doesn't exist." Bugs live at RLS, Edge Functions, env config.
40. **Context Drift = Death.** Persistent tracking files (CURRENT_SPRINT.md, V1_FEATURE_BACKLOG.md) are mandatory.
41. **Track Features Immediately.** Add to backlog as DISCUSSED the moment a feature is mentioned.
42. **Session Prompts Are Contracts.** Not suggestions. Follow them exactly.
43. **Dashboard Intelligence Early.** Must visibly show intelligence within first 3 items.

## VIII. Data Completeness & Smart Feature Gates (44-51)
44. **Data Completeness Gate:** Smart features (projections, tax reports, AI insights, advice, reconciliation) MUST NOT render with incomplete data. Show a locked state with a checklist of exactly what's missing. Incomplete > Inaccurate.
45. **Temporal Integrity:** Financial documents are stored and attributed to the tax year they cover, NOT the upload date. A 2025 W-2 uploaded in 2026 is a 2025 document. This must be enforced at the DB insert layer.
46. **Year Scope Label:** Every financial report, projection, and calculation must explicitly state the time period it covers on-screen. "Tax Center" is not a label. "2025 Federal Tax Return" and "2026 YTD Projection" are labels.
47. **Prerequisite Checklist:** Every smart feature defines its required inputs before it is built. These are rendered as a visible checklist to the user. The feature is locked until prerequisites are met. No silent degradation.
48. **Data Basis Disclosure:** Any calculation or projection must show what data it's based on. "Projection based on 1 of ~24 expected paystubs" is mandatory when extrapolating. Never let a partial calculation look like a complete one.
49. **Export Relevance:** Exports must match their stated context. Tax exports contain only tax-relevant items. Transactional exports are separate. Never mix them and never include irrelevant data in a contextual export.
50. **Probing Before Building (Money/Trust Features):** For any feature touching financial calculations, tax, AI advice, or user-trust decisions — Claude MUST ask at minimum: (1) what data is required, (2) what's the completeness gate, (3) what does the empty/incomplete state look like, (4) what time period does it cover, (5) what breaks downstream if one input is wrong. Do not write code until these are answered.
51. **No Dead UI:** Every button, link, and action visible to a user must work. A delete account button that does nothing is worse than no button. A tax projection button that routes to the dashboard destroys trust instantly. Wire it or remove it.

## IX. Code Quality & Backend Hygiene (52-56)
52. **No Silent Catch Blocks:** Every catch block must do one of three things: (a) re-throw the error, (b) log with context — what was being attempted + the error itself, or (c) render a user-visible error state. `catch(e) {}` is forbidden. `catch(e) { console.error('[featureName] failed:', e); throw e; }` is the minimum acceptable pattern.
53. **N+1 Prevention:** Never fetch a list then loop to fetch related items individually. Use a JOIN, a `.in()` query, or an RPC that returns everything in one round trip. Any data fetch inside a `.map()` or `.forEach()` is a mandatory review stop — it almost always means N+1. Flag it, fix it, or document why it's intentional.
54. **Schema-First for New Tables:** Before writing any INSERT or SELECT, define the full schema: primary key, foreign keys with explicit ON DELETE behavior, indexes on every column used in WHERE/ORDER BY/JOIN, and the DOWN migration. No table gets created without all four decided and written down first.
55. **Hard Token Budgets (added 2026-05-12 from Karpathy 12-rule template):** Per-task ceiling: ~4,000 tokens of agent context. Per-session ceiling: ~30,000 tokens. If a task is approaching the budget, summarize what's done + what's left, then start fresh. Never silently overrun — surfacing the breach matters more than pushing through. Symptom this prevents: a debugging session that runs 90 minutes iterating on the same 8KB error message while gradually losing track of what's already been tried.
56. **Tests Verify Intent, Not Just Behavior (added 2026-05-12):** Every test must encode WHY the behavior matters, not just WHAT it does. `expect(getUserName()).toBe('John')` is worthless if the function returns a hardcoded ID. If you can't write a test that would fail when business logic changes, the function under test is wrong. Apply specifically to: reconciliation correctness, categorization classification, signature audit-trail completeness, k=N aggregate suppression. "Tests pass" is not the goal — "tests prove the right thing happens for the right reason" is.

## Definition of Done
- Zero build errors/warnings, zero console errors
- UI clean and consistent with design system
- Feature works as expected in browser
- Data persists to DB (verified with SELECT query)
- Data reads back correctly (correct types, amounts, IDs)
- Learning files updated (errors-fixed.json, golden-paths.md, CURRENT_SPRINT.md)
- One commit per task with descriptive message

**For smart features (projections, AI advice, reports, tax, financial calculations) — also:**
- [ ] All 4 DMG levels implemented (Ghost / Cold / Warm / Mature) — see data-integrity.md
- [ ] Manual entry capped at Level 2. Verified source required for Level 3.
- [ ] Speculative Mode watermark visible on every number, not just header
- [ ] Zero-data state tested — Ghost state shows, not broken or empty UI
- [ ] Account delete resets all maturity scores to 0
- [ ] Export disabled below Level 3 (no downloads of speculative projections)
