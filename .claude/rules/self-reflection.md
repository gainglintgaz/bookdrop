# Self-Reflection Protocol — Autonomous Rule Improvement

## Why This Exists
Victor should never have to say "did you learn anything from that?" The system must catch its own gaps, draft its own fixes, and present them for approval. Victor's job is to approve or reject — not to notice the gap in the first place.

## The Three Triggers

### Trigger 1: End of Every Session (Automatic)
Before generating SESSION_DEBRIEF.md, Claude MUST run the Self-Audit Checklist below.
This is not optional. This is not "if you have time." This runs every session.

### Trigger 2: After Every Architecture Review or Feature Build
When Claude reviews a design, builds a feature, or stress-tests a plan, immediately after completing it, run the Rule Gap Scanner below.

### Trigger 3: Cross-Session Relay
Whenever Victor relays findings, questions, or designs from another Claude session (PowerShell Claude, Gemini, Grok, ForgeDesk), the receiving Claude must automatically ask: "Do my current rules cover what the other session missed? If not, what's the gap?"

---

## Self-Audit Checklist (runs every session)

After completing the main work but before session end, ask yourself these 7 questions. Write honest answers. If any answer is "yes," draft a rule update and present it to Victor.

### 1. Did I follow a rule that produced a bad outcome?
"I followed Rule X, but it led to Y problem."
→ Draft a rule modification with the fix.

### 2. Did I skip a rule that would have caught a problem?
"Rule X exists and would have prevented this, but I didn't apply it."
→ Flag the rule as under-enforced. Suggest strengthening its trigger conditions.

### 3. Did I ask a question but not enforce the answer?
"Hostile Architect asked 'what prevents duplicates?' but no schema change resulted."
→ This is the #1 failure mode. Every question must produce a concrete artifact (column, constraint, table, config) or the question was decoration.

### 4. Did another Claude session miss something my rules should have caught?
"PowerShell Claude designed 24 tables without dedup hashes. My rules mention dedup as a question but not as a requirement."
→ Upgrade the rule from question to enforcement.

### 5. Did I build something that a future session will struggle to understand?
"I made an architecture decision but didn't document WHY."
→ Add the reasoning to the project's CLAUDE.md or decision log.

### 6. Did I use a pattern that worked well and isn't in golden-paths.md?
"This approach solved the problem cleanly and could be reused."
→ Draft a golden-paths.md entry.

### 7. Did any rule feel outdated, irrelevant, or contradicted by what I just built?
"Rule X says to do Y, but in practice Z works better."
→ Draft a rule update with evidence from this session.

---

## Rule Gap Scanner (runs after reviews/builds)

For every architecture review, Hostile Architect pass, or feature build, run this scan:

### A. Enforcement Check
For every question the Hostile Architect asked:
- Did the answer produce a **specific schema change** (column, constraint, index, table)?
- Did the answer produce a **specific code change** (function, guard, validation)?
- If neither: the question was a suggestion, not enforcement. **Draft an enforcement upgrade.**

### B. Coverage Check
For every file generated or significantly modified this session:
- Does the Definition of Done checklist cover what was built?
- If not: **draft new checklist items.**

### C. Cross-Rule Consistency Check
Did any rule contradict another rule during this session?
- Example: "Schema-First says define everything before INSERT" vs. "Build the smallest working increment first"
- If yes: **draft a clarification** that resolves the tension.

### D. Lesson Extraction
Did anything happen this session that matches an existing lesson?
- If it matches but the lesson didn't prevent it: **the lesson needs teeth** (upgrade from wisdom to enforcement).
- If it's new: **draft a new lesson.**

### E. Completeness Check
For every table designed, API endpoint created, or feature shipped:
- Does it have dedup protection? (import_hash, UNIQUE constraint, idempotency key)
- Does it have an audit trail? (prompt_version, created_at, source tracking)
- Does it have an empty/error state designed?
- Does it have a "second time" scenario handled?
- If any answer is "no": **flag it before the session ends.**

---

## Output Format

When the Self-Audit or Rule Gap Scanner finds issues, output a **SELF-REFLECTION REPORT** in this format:

```markdown
## Self-Reflection Report — [Date]

### Gaps Found
1. [Gap description — what was missed and why]
   - **Current rule:** [which rule file, which section]
   - **What it says:** [current wording]
   - **What it should say:** [proposed new wording]
   - **Why:** [what happened this session that proves the gap]

### Proposed Rule Updates
- [ ] [File]: [specific edit] — Victor to approve
- [ ] [File]: [specific edit] — Victor to approve

### New Lessons Drafted
- [Number]. **[Lesson title].** [Lesson body]

### No Action Needed
- [List anything checked that was fine — proves the audit ran]
```

Present this to Victor. Do NOT auto-commit any changes. Victor approves all rule modifications.

---

## The Meta-Rule

**VictorForge must be its own harshest critic.**

The goal is not "did the code work?" — that's table stakes. The goal is:
- Did the RULES work?
- Did the rules PREVENT problems or just DOCUMENT them?
- Did every stress-test question produce a concrete change?
- Would a brand new Claude session, reading only the rules, make the same mistake?

If the answer to that last question is "yes, a fresh Claude would still miss this" — then the rules have a gap. Find it. Fix it. Present it for approval.

---

## Integration Points

### Post-Session Hook
The `post-session-enforcer.ps1` fires SESSION_DEBRIEF.md.
Claude should read SESSION_DEBRIEF.md AND run Self-Audit before presenting final output.

### Weekly Deep Sweep
The Sunday 8am sweep should include a "Rule Health Check":
- Count how many lessons were added in the last 7 days
- Check if any new lessons overlap with or contradict existing ones
- Flag any rule file not updated in 30+ days (may be stale)
- Check if ForgeDesk's rules_text table is in sync with .claude/rules/

### Daily Status
The 8am daily report should include one line:
"Self-Reflection: [N] gaps found last session, [N] rule updates pending Victor's approval"

---

## What Victor Sees

Victor should never have to ask "did you learn anything?"

Instead, at the end of every substantive session, Victor automatically sees:
1. What was built/reviewed
2. What gaps the system found in its own rules
3. Proposed fixes (ready for approve/reject)
4. Updated lesson count

**Victor's only job: approve or reject.** The system does the thinking.
