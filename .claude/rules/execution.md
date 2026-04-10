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
