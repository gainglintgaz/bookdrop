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

## v4.3.5 -- Passive Listening Layer (added 2026-05-13)

**Replaces manual end-of-session "anything frustrate you?" prompts entirely.**

The UserPromptSubmit hook now runs `signal-classifier-tier1.ps1` on EVERY user prompt,
capturing real-time signals as Victor speaks -- zero recall bias, zero user effort.

### Signal capture flow

```
User types prompt
       |
       v
UserPromptSubmit hook (non-blocking, always exits 0)
       |
       v
signal-classifier-tier1.ps1 -- Tier-1 regex/keyword classifier (1-5ms, $0)
  - Matches against 12 signal types in .claude/signal-taxonomy.json
  - 0 matches: logs metadata-only entry (no signal type)
  - 1+ matches: appends to <project>/.claude/signal-log.jsonl
  - CRITICAL (REPEAT, SECURITY, RULE_VIOLATION): emits real-time note
  - PII scrubber + secret detector run on excerpt before any storage
       |
       v
Session end: Stop hook fires signal-batch-analyzer.ps1
  - Reads signal-log.jsonl entries from this session
  - Aggregates signal counts + identifies patterns
  - Proposes PENDING_APPROVALS entries for actionable patterns
       |
       v
Weekly (Sunday 8am): Synthesizer agent runs
  - Cross-references signals from all 6 known project paths (past 7 days)
  - Detects: REPEAT cross-project, REWORK density, SECURITY, FRUSTRATION>5
  - Appends findings to WEEKLY_INSIGHTS.md + PENDING_APPROVALS.md
```

### Signal log location
`<project_path>\.claude\signal-log.jsonl` -- append-only JSONL, 90-day TTL

### The 12 signal types (full taxonomy: `.claude/signal-taxonomy.json`)

| Signal | Example triggers | Priority |
|---|---|---|
| REPEAT | "again?", "I already told you", "you keep doing" | CRITICAL |
| SECURITY | "breach", "exposed", "leaked", credential words | CRITICAL |
| RULE_VIOLATION | Named VIBE rule citations | CRITICAL |
| REWORK | "redesign", "rewrite", "rebuild", "start over" | HIGH |
| CORRECTION | "no", "wrong", "that's not right", "incorrect" | HIGH |
| BUG | "doesn't work", "broken", error codes, TypeErrors | HIGH |
| MISSING | "you missed", "you forgot", "where's the" | MEDIUM |
| FRUSTRATION | "ugh", "why", caps lock, excessive punctuation | MEDIUM |
| CLARIFY_NEEDED | Re-explaining same concept across 3+ turns | MEDIUM |
| CONFUSION | "I don't understand", "huh?", "explain this" | MEDIUM |
| APPROVAL | "great", "perfect", "exactly", "nailed it" | POSITIVE |
| PIVOT_STRATEGIC | "let's pivot", "different direction", "kill this" | PROJECT |

### DEPRECATED: end-of-session frustration prompts

Do NOT ask: "Did anything frustrate you this session?"
Do NOT prompt: "Any pain points I should know about?"

These produced recall-biased, compressed signals captured after the moment of pain had passed.
The UserPromptSubmit hook captures the real signal at the exact moment it occurs.
Victor's job: review PENDING_APPROVALS.md weekly and approve or reject proposals.

### Related skills
- `/half-baked-scan [project_path]` -- stuck-project detector using signal density + sprint status
- `/preempt-project [project_path] [vertical]` -- pre-inject lessons at scaffold time using cross-project signal history

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

### UserPromptSubmit Hook (real-time -- automatic, every prompt)
`scripts/signal-classifier-tier1.ps1` fires on every user prompt via the `UserPromptSubmit`
hook in `.claude/settings.json`. Non-blocking (always exits 0). Appends classified signals to:
`<current_project>\.claude\signal-log.jsonl`

### Stop Hook -- signal batch analyzer (session-end -- automatic)
`scripts/signal-batch-analyzer.ps1` fires at session end alongside `post-session-enforcer.ps1`.
Reads signal-log.jsonl entries from the current session, detects session-level patterns,
and proposes actionable items to PENDING_APPROVALS.md.

### Post-Session Hook -- session debrief (session-end -- automatic)
`post-session-enforcer.ps1` generates SESSION_DEBRIEF.md.
Claude reads SESSION_DEBRIEF.md AND checks if any CRITICAL signals (REPEAT, SECURITY,
RULE_VIOLATION) were logged this session before presenting the final self-reflection output.
If CRITICAL signals fired: surface them explicitly in the Self-Reflection Report.

### Synthesizer Agent (weekly -- Sunday 8am scheduled)
`.claude/agents/synthesizer.md` reads signal-log.jsonl from all 6 known project paths
(past 7 days), detects cross-project patterns (REPEAT in 2+ projects, REWORK density >=3,
SECURITY anywhere, FRUSTRATION >5, APPROVAL in 3+ projects), and appends proposals to
WEEKLY_INSIGHTS.md and PENDING_APPROVALS.md.

### Weekly Deep Sweep (Sunday 8am -- scheduled)
The Sunday sweep should include a "Rule Health Check":
- Count how many lessons were added in the last 7 days
- Check if any new lessons overlap with or contradict existing ones
- Flag any rule file not updated in 30+ days (may be stale)
- Check if ForgeDesk's rules_text table is in sync with .claude/rules/
- Check signal-log.jsonl: any project with >10 FRUSTRATION signals in the past 7 days?

### Daily Status
The 8am daily report should include one line:
"Self-Reflection: [N] signals captured last session (REPEAT:[n] REWORK:[n] APPROVAL:[n]), [N] rule updates pending approval"

---

## What Victor Sees

Victor should never have to ask "did you learn anything?"

Instead, at the end of every substantive session, Victor automatically sees:
1. What was built/reviewed
2. What gaps the system found in its own rules
3. Proposed fixes (ready for approve/reject)
4. Updated lesson count

**Victor's only job: approve or reject.** The system does the thinking.
