# Lessons Learned — 40+ Battle-Tested Rules from Real Projects
Merged from 30+ FinKeel sessions, 22 memory files, and consulting engagements. Updated via Post-Mortem Protocol.

## Execution Discipline
1. **"Temporary" doesn't exist.** Every placeholder ships. Build real or don't build it.
2. **Build passing is table stakes.** Working = build + tests + browser + DB round-trip. All four.
3. **One abstraction, one responsibility.** Receipt parser for receipts. W-2 reviewer for W-2s. Never stretch.
4. **Diagnose before touching code.** Read the console error. Trace the data. THEN write the fix.
5. **Trace the full pipeline before fixing any stage.** Log every stage, run once, find ALL breaks, fix all at once.
6. **Look upstream when a loop processes too few items.** The bug is in the input, not the loop body.
7. **The second time a bug reappears, the original fix was wrong.** Stop and find the real root cause.
8. **Max 3 tasks per session.** 3 done completely > 7 half-done.

## AI Agent Management
9. **AI agents claim success — verify independently.** Click the button yourself. Don't trust commit messages.
10. **"Not found in code" != "doesn't exist."** Bugs live at system boundaries: MCP tools, Edge Functions, env config.
11. **AI searches comfortable layers, skips uncomfortable ones.** Direct it explicitly to MCP tools, sidecar services, env config.
12. **Classification is the highest-leverage point.** One wrong token cascades through the entire pipeline.
13. **Static search is necessary but not sufficient.** Runtime tracing reveals what grep cannot.
14. **3-Prompt Revert Rule.** If the AI fails to fix a bug twice, git stash, clear chat, fresh session.
15. **Context pruning — less is more.** Tell the AI which 2-3 files to read. Don't dump the whole codebase.
16. **External audits from stale context are dangerous.** Always verify claims against live codebase before acting.
17. **Context drift kills long projects.** After 20+ sessions, AI references stale state. Persistent files are the only cure.
18. **Session prompts are contracts, not suggestions.** Follow them exactly.
19. **Separate Thinker from Typist.** Desktop Claude plans, PowerShell Claude executes. Never code from Desktop.

## Architecture & Data
20. **Money = BIGINT cents in DB, / 100 for display.** Never float.
21. **Two insert paths = double audit.** Multiple write paths? Audit ALL on schema changes.
22. **23505 = already saved.** UNIQUE violation means skip. NEVER retry with new ID.
23. **Migrations are stale.** Always verify live DB schema via SQL audit before changes.
24. **Every save must be DB-verified.** Toast without DB write is a lie. 30+ fakes shipped because audits only checked rendering.
25. **Dead buttons destroy trust faster than missing features.** Empty state > fake state.
26. **Compute placement matters.** Heavy math (rolling averages, anomaly detection) on backend, never in browser.

## Design & UX
27. **Design system from Session 1.** Define font scale, spacing, card variants, colors BEFORE writing features.
28. **Design sessions must be DESIGN-ONLY.** Never mix design cleanup with feature builds.
29. **Every user-visible string must be honest.** No hardcoded dollar amounts. No fake counts. No decorative percentages.
30. **Bank reconciliation requires date-level grouping.** Month -> Date -> Receipt hierarchy with collapsible daily totals.
31. **Progressive discovery > overwhelming dashboards.** Features unlock as user accumulates data.
32. **Enforce design via hooks, not docs.** design-lint.sh blocks banned patterns. Advisory files alone don't work.

## Security & Compliance
33. **2FA enrollment without login step-up is security theater.** Build enrollment + enforcement together.
34. **MCP-first rule.** Try the automated tool before saying "manual action needed."
35. **MCP Edge Functions: inline shared code.** Relative imports fail when deploying via MCP tool.
36. **Pre-commit hooks block patterns in ALL files including docs.** Write key rotation as prose, not bash examples.
37. **Image compression before upload is a launch blocker.** 12MB phone photo = 10s upload = user thinks app broke.
38. **NEVER use VITE_ prefix for secret API keys.** VITE_ bundles into browser JS. Only for PUBLIC config.
39. **ALL AI API calls through server-side functions.** Never import AI SDKs in frontend code.

## Consulting Delivery
40. **Demo only real features.** Never show placeholder UI to a client.
41. **Client testing is your QA gate.** Verify yourself first, then let client find the rest.
42. **AI speed increases margin, not scope.** Finish a 4-week project in 4 days for the same price.
43. **FinKeel is NOT a budget app.** It's a self-learning AI financial advisor. Positioning matters.

## Product & Marketing
44. **Every promise must be genuine.** Don't say "AI-powered" if the AI doesn't do anything yet.
45. **Smart features are optional.** Let users discover gradually — progressive revelation, not overwhelming dashboards.
46. **Collective intelligence is the moat.** Anonymized aggregate data that no competitor can replicate from day one.
47. **Free hook drives adoption.** Receipt scanner with 10 free scans/month — then paid for full intelligence.

## Data Completeness & Smart Features (from FinKeel V1 testing — real pain)
48. **Incomplete data produces wrong answers. Wrong answers destroy trust permanently.** A user who sees "$9,922 tax liability" based on one paystub will never trust the app again. An empty state asking for more data beats a confident wrong number every single time.
49. **Every smart feature has prerequisites. Define them BEFORE writing any code.** Tax projection needs: W-2s for the correct tax year, all paystubs YTD, filing status, dependents. If any are missing, the feature is LOCKED — not degraded, not approximated. Locked with a "here's exactly what's missing" message.
50. **Document date ≠ upload date. Ever.** A W-2 for tax year 2025 uploaded in April 2026 must be stored and attributed to tax year 2025. Financial documents belong to the period they cover, never to when the user uploaded them. This one bug makes every downstream tax calculation wrong.
51. **Tax year scope must be explicit on every single screen.** "Tax Center" is not a feature name — it's a navigation drawer. "2025 Tax Return" and "2026 YTD Projection" are two completely different products with different data, different logic, different outputs. Never mix them. Label every number with its exact time period.
52. **Show completeness score, not just results.** "3 of 5 required documents uploaded. Upload W-2 and final paystub to unlock accurate projections." This is a feature, not a limitation. Users respect honesty about what the app knows vs. doesn't know.
53. **Partial data silently extrapolated = silent lie.** One paystub extrapolated to 12 months looks like a real annual projection. The user cannot tell it's based on 8% of the data. Always show the data basis: "Based on 1 of ~24 expected paystubs."
54. **Export relevance must match context.** Tax export = tax items only. A Costco receipt in a Schedule C export is noise that makes the whole export look wrong. Filter at export time, labeled clearly.
55. **OAuth flows must be tested in a fresh browser tab, never from an error page or iframe.** Chrome silently blocks OAuth redirects from chrome-error:// frames. The app appears broken when it isn't. Always test auth by navigating directly to the app URL first.
56. **Every destructive action button must be wired before shipping.** Account deletion, data wipe, unsubscribe — if the button exists and does nothing, it's a trust bomb. Build it or remove it. No dead UI.

## Build Velocity Philosophy (the 4-hour vs 10-hour rule)
57. **4 hours of questioning + planning beats 2 hours building + 10 hours fixing.** The goal is not to start coding fast. The goal is to ship something users trust. Slow the plan, speed the ship.
58. **"Build me X" is not a spec. Ask before you build.** "Build a tax center" contains dozens of unstated assumptions: which year? what data is required? what's the completeness gate? what's the empty state? what happens with partial data? Asking 5 probing questions upfront saves 8 hours of rework.
59. **Think 10 steps ahead for anything touching money, taxes, or user trust.** These features cannot be iterated on publicly. Getting them wrong loses users permanently. Plan completely before writing line one.
60. **Probing questions are not delays — they are the build.** When Claude asks clarifying questions before coding, it is preventing the exact pain described in lessons 48-56. This is not friction. This is the correct process.
