# CLAUDE_AUTONOMY_PROTOCOL.md
## How Claude Code Operates for VictorForge Projects
## Read this at the start of EVERY session. No exceptions.

---

## SESSION START SEQUENCE (always, every time)

```
1. Read this file completely
2. Read VICTORFORGE_PHILOSOPHY.md
3. Read the project's CLAUDE.md
4. Read the project's CURRENT_SPRINT.md
5. Read errors-fixed.json (last 10 entries)
6. Run: git status && git branch
7. State in one sentence what you're building this session
8. Begin — no asking for permission on things already decided
```

---

## THE AUTONOMY RULES

### What Claude Code does WITHOUT asking Victor first:
- Writes all code for features that are fully specced in CLAUDE.md or CURRENT_SPRINT.md
- Fixes any bug it discovers while working, even if not the current task
- Adds proper TypeScript types to everything it touches
- Adds error boundaries and try/catch where missing
- Writes the test for every function it creates
- Logs every bug fix to errors-fixed.json immediately
- Logs every reusable pattern to golden-paths.md immediately
- Commits to git after every meaningful chunk of work
- Improves code quality (naming, structure, comments) without being asked
- Checks for and fixes common VictorForge anti-patterns it finds
- Goes beyond the minimum — if building a dashboard, makes it actually useful
- Surprises Victor with thoughtful additions that are clearly in the spirit of the spec

### What Claude Code asks Victor about BEFORE doing:
- Anything that changes the database schema in a breaking way
- Anything that changes the pricing or billing logic
- Anything that adds a new external API or service not already in the stack
- Any architectural decision that affects multiple other components
- Anything that could delete or overwrite data

### What Claude Code NEVER does:
- Asks "what would you like me to do next?" — checks CURRENT_SPRINT.md instead
- Uses `as` TypeScript casting to avoid a real type error — fixes the root cause
- Leaves console.log statements in committed code
- Creates placeholder/dummy components — builds real ones
- Uses generic variable names (data, result, temp, obj) — uses descriptive names
- Adds a feature without testing it works
- Considers a task done without updating CURRENT_SPRINT.md

---

## THE CODE QUALITY STANDARD

Every file Victor ships must meet this bar:

### TypeScript
- Strict mode on. No `any`. No `as` casting unless there is no alternative and it is documented why.
- Every function has explicit parameter types and return type
- Every Supabase response is typed with the generated database types
- Errors are typed — never `catch (e: any)`

### React Components
- Every component has a clear single responsibility
- Props are typed with an explicit interface, not inline
- No bare useStore() — always use selectors
- Loading states handled — no blank flashes
- Error states handled — no silent failures
- Empty states handled — no blank lists with no explanation

### Supabase
- RLS policy exists on every table before any data is written
- Monetary values stored as BIGINT cents — never floats
- Timestamps always TIMESTAMPTZ
- CASCADE deletes set correctly
- .maybeSingle() for queries that might return null
- Every query checks for error before using data

---

## THE BUG FIX PROTOCOL

When a bug is found:
1. Reproduce it — confirm you understand exactly what is happening
2. Identify root cause — not just the symptom
3. Fix the root cause — not a workaround
4. Write a test that would have caught this bug
5. Log to errors-fixed.json immediately
6. Log to golden-paths.md if it is a recurring pattern
7. Commit: "fix: [description] — root cause was [cause]"
8. Continue working — do not stop unless fix required architecture change

---

## THE UNIVERSAL CUSTOMIZATION SYSTEM

Every VictorForge product uses tenant.config.ts at src/lib/tenant.config.ts.
This makes the same codebase serve bookkeepers, estate sale companies,
equine boarding facilities, or any other vertical by changing config only.

Fields that change per vertical:
- productName, verticalLabel, clientLabel, documentSetLabel
- primaryColor (entire UI theme)
- logoUrl
- features flags (aiPricingSuggestion, voiceEntry, offlineMode, etc.)
- documentTypes (what documents are required)
- reminderSchedule defaults

The core upload, storage, reminder, billing, and dashboard logic
is identical across all verticals. Vertical-specific behavior
lives in src/components/[vertical]/ and is conditionally loaded
from tenant.config.ts.

---

## ANTI-PATTERNS — NEVER REPEAT THESE

| Anti-pattern | Fix |
|-------------|-----|
| mode 'Personal' vs 'personal' casing mismatch | Normalize at DB boundary always |
| bare useStore() with no selector | useStore(state => state.field) always |
| setIndex(fn) when number expected | Pass value directly |
| Side effects before batch complete | Defer until entire batch succeeds |
| amount * 100 inline | Use toCents() utility function |
| Hardcoded env vars | import.meta.env.VITE_* always |
| .single() that throws on null | .maybeSingle() then null check |
