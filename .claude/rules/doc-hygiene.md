# Doc Hygiene — keep markdown lean, token-efficient, AI-readable

**Why:** every MD file Claude/Codex/Cursor loads costs tokens. Bloated docs
hurt every session. Cap sizes; archive history; rewrite for AI consumption.

## Hard caps

| File type | Soft cap | Hard cap | Action if over |
|---|---|---|---|
| `.claude/rules/*.md` | 200 lines | 280 lines | Compact + split |
| `CURRENT_SPRINT.md` | 80 lines | 150 lines | Archive history to `CURRENT_SPRINT_ARCHIVE.md` |
| `V1_FEATURE_BACKLOG.md` | 120 lines | 200 lines | Archive DONE rows |
| Other project root MD | 150 lines | 250 lines | Compact, split, or kill |
| `*-CHECKLIST.md`, runbooks | 200 lines | 300 lines | OK if dense + scannable |
| Auto-generated mirrors (`AGENTS.md`, `GEMINI.md`) | n/a | n/a | Fix the source rules instead |

Project total target: **< 5,000 lines of MD** for everything Claude loads at session start.

## Writing rules (in priority order)

1. **State, don't narrate.** "Rule: cap rules at 200 lines" beats "We learned the hard way that rules over 200 lines become hard to enforce."
2. **One sentence per rule.** If a rule needs 3 sentences, it's two rules.
3. **Tables > prose** for any enumeration. Claude scans tables faster than paragraphs.
4. **No examples longer than 5 lines** unless the example IS the rule.
5. **No history.** Past decisions belong in `*_ARCHIVE.md`, not the live rule.
6. **No motivation paragraphs.** "Why this matters" comes after the rule, in one line, when needed.
7. **No "we" or "you" voice.** Imperative. "Run X." Not "You should run X."

## Rot detection (the things that signal a rewrite)

- **Duplicate content across files.** Same rule stated in 2+ files = consolidate.
- **Last-updated > 60 days + sprint moved past it.** Stale: rewrite or kill.
- **Decisions log > 10 rows.** Archive the oldest 5.
- **File > soft cap with low information density.** Rewrite shorter.
- **"FAQ" / "Notes" / "Tips" sections that grew unbounded.** Refactor as rules.

## Cadence

Run `scripts/audit-docs.ps1` weekly (or on every push via CI advisory job).
The script:

1. Flags any MD over its hard cap.
2. Flags any MD over its soft cap with > 30% similarity to another MD (duplication).
3. Flags any MD whose `Last updated:` is > 60 days old when the project has shipped commits since.
4. Outputs a prioritized compaction queue.

## When in doubt

If you're writing a doc and ask "is this useful to a future Claude session that
loads it?" and the answer is "probably some of it," **delete the 'some.'**
Sharp + short beats long + complete in this medium.
