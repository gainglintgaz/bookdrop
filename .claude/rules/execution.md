# Execution Protocol + Rollback + Self-Improvement

## The Build Workflow
When initialized with a project brief, execute in this strict sequence:

### Phase 0: Probing Questions (MANDATORY — do not skip)
Before writing any code, before the blueprint, ask these questions if the answers aren't already explicit.

**Always ask:**
1. Who is the user and what's the single job they're trying to get done?
2. What data does this feature need to work correctly? List every input.
3. What happens when that data is missing, partial, or wrong?
4. What time period or scope does this cover? Is that visible to the user?
5. What does "done" look like — what can the user do that they couldn't before?

**For features touching money, taxes, AI advice, projections, or user trust — also ask:**
6. What is the completeness gate? What's the minimum data required before the feature renders results?
7. What does the locked/incomplete state look like in the UI?
8. What breaks downstream if one input is wrong or belongs to the wrong year?
9. Are there regulatory or accuracy implications if this is wrong? (Tax estimates, financial advice, etc.)
10. Has this data model been validated against a real example? (e.g. actual W-2, real transaction history)

**For any feature requiring new DB tables, writes, or auth-protected routes — also ask:**
11. What auth is required at every layer? List every route, RPC call, and Edge Function that will be created, and state the required auth level for each. What RLS policy covers each table? Define schema first: primary key, foreign keys with ON DELETE behavior, and indexes on every WHERE/ORDER BY column — before writing any INSERT or SELECT.

**The rule:** If Victor hasn't answered these, ASK before building. Do not assume. Do not default.
A 30-minute conversation here prevents 8 hours of testing and rework.
Probing is not blocking — it IS the build phase.

### Phase 1: Blueprint
Fill out PROJECT_BRIEF_TEMPLATE.md:
- What it does (one sentence)
- What data it needs (tables, APIs, files)
- What it looks like (wireframe or description)
- What success means (measurable criteria)

### Phase 1.5: Stack Optimization
Run stack-optimizer.md against the blueprint:
- Inventory planned tech stack from the brief
- Research alternatives with fresh eyes (don't just validate defaults)
- Output decision table: KEEP / SWITCH / SELF-HOST / HYBRID per service
- Calculate Victor's time cost for any recommended changes
- Skip if Victor says "use defaults" or project is a throwaway prototype
- Decision table goes into the project's CLAUDE.md under "Tech Stack Rationale"

### Phase 2: Hostile Critique
Run hostile-architect.md against the blueprint (now stress-tests the CHOSEN stack, not just defaults):
- Document all findings with severity ratings
- Address ALL CRITICAL items before writing any code
- HIGH items get mitigations planned, not necessarily built in V1

### Phase 3: Step 1
The smallest possible working increment:
- One file, one function, one route
- Must work end-to-end: UI -> DB -> UI
- Verify before expanding

### Phase 4: Incremental Build
- One task per commit
- Build check after every change
- Test after every change
- CURRENT_SPRINT.md updated after each task
- DB round-trip verified for every save feature

### Phase 5: Verification
Not just "does it render?" — ALL of these:
- [ ] Data persists to DB (run SELECT query)
- [ ] Data reads back correctly
- [ ] Edge cases handled (empty, max, wrong mode)
- [ ] No console errors
- [ ] No fake data visible (honest strings check)
- [ ] Error boundary catches failures gracefully

### Phase 6: Learning Loop
The post-session-enforcer.ps1 fires automatically via Claude Code Stop hook.
If it didn't fire, run manually: `powershell -File scripts/post-session-enforcer.ps1`

Review SESSION_DEBRIEF.md and suggest updates to:
- errors-fixed.json if bugs were found
- golden-paths.md if new patterns emerged
- Propose VIBE rule updates if warranted
- Update CURRENT_SPRINT.md with task statuses

All suggestions require Victor's approval before committing.

### Phase 7: Ship Decision
- [ ] Security audit (no hardcoded keys, RLS on all tables)
- [ ] Mock data audit (zero fakes/placeholders)
- [ ] Test coverage for critical paths
- [ ] Bundle size acceptable
- [ ] Known issues ranked by severity
- [ ] Launch Verification Checklist passed

## Standard Prompt Anatomy
Every prompt MUST contain these 4 blocks:
1. **Context** (Who/Where): Phase of CURRENT_SPRINT.md. Under 300 words.
2. **Intent** (What): The exact atomic task.
3. **Constraints** (How): Which VIBE rules apply specifically.
4. **Verification** (Done): What MUST happen for this to be complete.

## The 3-Prompt Revert Rule
If the AI writes a bug, you ask it to fix it, and it fails twice — STOP.
`git stash`, clear chat, start fresh. Context is poisoned after 3 failed attempts.

---

## Rollback Protocol

### Level 1: Undo Last Change (Safest)
```bash
git diff                    # See what changed
git checkout -- <file>      # Revert specific file
git stash                   # Stash all changes (recoverable)
```

### Level 2: Revert Last Commit
```bash
git log --oneline -5        # Identify bad commit
git revert <hash>           # Creates undo commit (SAFE)
```
**NEVER use `git reset --hard` without Victor's permission.**

### Level 3: Corrupted Zustand State
```javascript
// Browser console:
localStorage.removeItem('budget_app_data')
location.reload()
```

### Level 4: Database Rollback
- Supabase point-in-time recovery (Pro plan)
- Keep DOWN migration for every UP
- Never DELETE without backup query first
- Edge Functions: redeploy previous version

### Level 5: Full Session Reset
1. `git stash` all changes
2. `git checkout main`
3. Build check — confirm clean
4. Tests — confirm passing
5. Start fresh from CURRENT_SPRINT.md

### Rules
- NEVER `git reset --hard` without explicit permission
- NEVER `git push --force` to main
- ALWAYS `git stash` before destructive ops
- ALWAYS verify build after any rollback

---

## Self-Improvement Protocol (Automatic)

### After Every Session
Claude should automatically check:
1. **New patterns discovered?** -> Suggest additions to lessons.md
2. **Bugs encountered?** -> Add to project's errors-fixed.json with root cause + golden rule
3. **New golden paths?** -> Suggest additions to project's golden-paths.md
4. **Rules violated?** -> Flag which VIBE rules were broken and why

### Post-Mortem Protocol (5-Minute Friday Rule)
At end of every sprint or client handoff:
1. Review recent errors-fixed.json entries
2. Draft 1 new VIBE rule if a bug pattern recurred
3. Distill 3 bullet lessons for lessons.md
4. **Rule of thumb:** Bug once = fix it. Bug twice = becomes a VIBE Rule.

### Context Drift Prevention
- CURRENT_SPRINT.md and V1_FEATURE_BACKLOG.md are mandatory persistent files for every project
- First line of every session: read tracking files
- After every session: update feature statuses
- Never trust AI's memory of project state — verify against live codebase
- External audit claims MUST be verified against live code/DB before acting

### Feature Tracking Discipline
- Features go into backlog IMMEDIATELY when mentioned (status: DISCUSSED)
- Verbal discussion alone loses features — persistent files are the only cure
- Status flow: DISCUSSED -> IN PROGRESS -> DONE -> VERIFIED

---

## Appendix A — Build Discipline (promoted 2026-05-13, PENDING_APPROVALS #19, EaseAway harvest)

Patterns derived from data-pipeline / external-API project work. Applies to any project with scheduled jobs, Python scripts, or third-party API integration.

### A.1 — Design-only sessions are design-only

When the planned session is "design cleanup" / "UI polish" / "refactor pass" — no feature additions. Mixing design + feature work means neither gets a clean review. If a feature is critical mid-session, end the design session cleanly first (commit + checkpoint) before starting the feature work as a separate task.

### A.2 — Python script discipline

For factory + project Python scripts:
- **Never `sys.argv` magic** — use `argparse` or `click` with explicit named args. Surprises kill scripts in cron.
- **Always test with fixtures** before invoking live APIs. A 50-line script that runs against a recorded fixture in 200ms is the right development loop; a script that runs against live API for every edit burns budget + rate limits.
- **Idempotent re-run** — every script should be safe to invoke twice. Use idempotency keys / UPSERT / dedup hashes.
- **Cents-spent log** — every external-API-calling script writes spend to a usage log (per-tenant if SaaS).

### A.3 — X API cost guard (and analogue for other paid APIs)

- **Always keyword-filter BEFORE streaming.** Never `xClient.filteredStream.start()` without `rules` configured.
- **Cap `max_results`** on every search call (≤ 100 default).
- **Wrapper enforces** ≥1 domain-keyword + ≥1 sentiment-keyword (for sentiment use cases) or equivalent gating per use case.
- **Refuse-to-call** if month-to-date spend exceeds `x_api_budget_cents` for the tenant / user.

### A.4 — Edge Function / cron deployment verification (lessons.md #88, bookkeeping Bug 13)

Static check is necessary but NOT sufficient. After every deploy:
1. `supabase functions list` confirms every function in `supabase/functions/*` appears in the list
2. `curl -X POST <function-url> -H "Authorization: Bearer $SERVICE_ROLE_KEY"` returns 200
3. After scheduling cron: wait 24h, check logs for ≥1 successful run

Without #1+#2+#3 a "shipped" Edge Function can silently no-op for weeks. Treat undeployed function as a CRITICAL bug, not a deferred TODO.

### A.5 — Five-gate Definition of Done (VIBE Rule 35 reminder)

For every feature, in order, each blocks the next:
1. `npx tsc --noEmit` passes (catches what Vite/Turbopack skip)
2. `npm run lint` passes
3. Browser click-through with DevTools open — primary flows render zero console errors
4. DB SELECT round-trip — for data-write features, verify row exists with correct columns
5. Column-drift grep — `.from("table").select("col")` strings audited against live `information_schema.columns`

Cannot mark a feature, phase, or sprint "done" with even one gate missing.
