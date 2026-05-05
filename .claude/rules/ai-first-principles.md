# AI-First Principles (VictorForge rule)

Universal architectural principles for AI/LLM/automation in any product. Drop-in for any new or existing project. Auto-loaded via the `.claude/rules/` factory pattern.

**Apply this when:** designing a new project, evaluating whether to add an AI feature, deciding whether to pivot, or auditing a project quarterly.

---

## 1. The philosophy in one paragraph

We build AI-first products: AI does real work that compounds with use, not theater that decorates a manual product. But we earn the user's trust before taking over — features unlock as we accumulate enough real data to support them honestly. **Hybrid by default; full agent mode by earned right.** No mocks, no hardcoded "smart" answers, no hallucinated claims, no fabricated numbers. If we don't have enough signal yet, we say so plainly and invite the user to keep going.

---

## 2. The 5-question audit

Apply this to every project, every quarter, every major feature.

### Q1 — Removed-AI test
> *If you stripped out all AI/LLM/automation tomorrow, does the product still deliver core value?*

- **YES** → AI is bolted on. Might be useful, but it's not the moat.
- **NO** → AI is structurally centered. The product fundamentally couldn't exist without it.

### Q2 — Flywheel test
> *Does the product get measurably smarter as more people use it?*

- **NO** → No flywheel. You're a feature; competitors with API access can clone you.
- **YES** → Flywheel exists. Every user contributes to a moat that compounds.

### Q3 — Hours-replaced test
> *What human work hours does AI replace per session?*

| Time saved | Tier |
|---|---|
| < 5 min | Polish AI — useful, not category-defining |
| 30 min – several hours | Centered AI |
| Replaces a hire | Category-defining AI |

### Q4 — Cost-per-session test
> *What's the marginal AI cost per active user session?*

| Cost | Implication |
|---|---|
| < $0.01 | Scalable to free tier |
| $0.05 – $0.50 | Must monetize ($10+/mo subscription minimum) |
| > $1.00 | Enterprise pricing only, narrow vertical |

### Q5 — Proprietary advantage test
> *What can YOU do that someone with the same OpenAI/Gemini/Anthropic API key cannot?*

- **Nothing** — anyone could clone this in a weekend. **No moat.**
- **You have user behavior + outcomes nobody else captures.** **Real moat.**
- **Vertical-specific dataset others can't ethically obtain.** **Strongest moat.**

A product passing the audit answers: **NO, YES, hours saved, scalable cost, proprietary data.** If a feature can't pass Q1+Q2, ask honestly: are we building real AI here, or are we decorating?

---

## 3. The Trust Ladder — loops earn unlocks

The hardest mistake in AI-first products: **giving the AI too much agency too early.** With zero data, the AI is guessing. Guesses presented as confidence destroy trust permanently. So features unlock as users complete real interaction loops.

### Definition: a "loop"
A complete cycle of user input → outcome → feedback. Examples (illustrative):
- Trip planning: plan trip → take trip → record what happened → next plan uses it
- Bookkeeping: upload month's transactions → categorize → close → next month uses learning
- Recruiting: define candidate criteria → review surfaced candidates → hire/miss → next pull is smarter
- Support tickets: incoming ticket → resolution → user satisfaction → next similar ticket suggestion is better

**Define your project's loop explicitly before applying this framework.** Without a defined loop, "AI gets smarter with use" is a vibe, not an architecture.

### The Trust Ladder by loop count

| Loop count | Available capability | Locked capability |
|---|---|---|
| **Loop 0** (cold start) | All manual tools fully functional. Pre-built data visible. | Personalization. Agents. Confidence-tagged AI claims. |
| **Loop 1** (first cycle started) | Real-data summaries (computed stats, verbatim quotes from real reviews). Honest "we'll learn as you go" copy. | "We notice…" suggestions. Pattern claims. Auto-drafted plans. |
| **Loop 2** (first cycle complete + outcome captured) | Hedged personalization with sample-size disclosure ("based on 1 cycle"). | Confident pattern claims. Cross-cycle aggregation. |
| **Loop 3** (second cycle started, with prior outcome) | Cross-loop pattern hints ("your last cycle showed X — want to try Y?"). | Auto-execution. Full agent mode. |
| **Loop 4–5** | Confident self-tuning suggestions ("you tend to prefer X"). Agent in opt-in preview. | Default-on agent. |
| **Loop 6+** | Full agent mode available as an explicit option ("want me to do this for you?"). Self-tuning thresholds. | Default-on agent (always opt-in). |

**Locked, not hidden.** Hidden features make the product feel less than it is. Locked features with honest copy ("Unlocks after your second cycle — here's what we'll learn") tell the user the system is *capable* but *honest*.

---

## 4. Feature gating states

Every AI feature is in exactly one of these states. The state is determined by available signal, never by hardcoded rules pretending to be smart.

| State | When | UX |
|---|---|---|
| **HIDDEN** | Feature isn't built or shouldn't be visible to anyone yet | Not in DOM. Not mentioned. |
| **LOCKED** | Built, but user hasn't earned access via loops | Visible as a card with title + "Unlocks after [N] [cycles]" + clear what feeds it |
| **PREVIEW** | Built, user is mid-loop and we have partial signal | Renders with sample-size disclosure: *"Based on 1 cycle — confidence is low until you've completed 2-3"* |
| **AVAILABLE** | User has crossed the loop threshold | Renders cleanly, no apologies, with a "why this fits" explanation tied to real data |
| **RECOMMENDED** | High-confidence signal supports a proactive action | Surfaces in-context with reasoning + an undo escape hatch |

**Anti-pattern to avoid:** `if(noData) { show fake claim }`. Never.

**Correct pattern:** `if(noData) { show LOCKED state with honest "what would unlock this" copy }`.

---

## 5. Anti-fabrication rules

Non-negotiable. These keep the AI-native promise from becoming AI-native theater.

1. **No fabricated claims.** Every number, name, or quote the AI outputs must be verifiable against real data. Use validators (e.g., substring-validators that reject any LLM-output snippet that isn't a verbatim substring of the input source).
2. **No theatrical "AI thinking…" spinners** when nothing is happening. If the AI is computing, fine. If you're stalling, that's a lie.
3. **No hardcoded "AI suggestion"** that's actually a static rule. If it's rule-based, label it as such or rewrite to use real signal.
4. **No agent saying "I learned from your last cycle"** before there's a last cycle. The trust ladder + feature gating prevent this structurally.
5. **No vendor lock-in to one AI provider.** All LLM-using code uses an interface that can swap (Gemini → Claude → GPT → local model). Specific implementations live behind that interface.
6. **No silent failure.** If the LLM errors, surface a real placeholder ("Coming with the next data pass" / "Couldn't generate — try again"), not a fabricated fallback.
7. **No PII in event logs.** Filter before storage. Email, name, phone, address, SSN, DOB, password — never logged.
8. **No claims of accuracy we haven't measured.** If you say "97% accurate" you have a benchmark. Otherwise, no number.

---

## 6. The Data Threshold pattern

Features that depend on data should be **locked behind a clear data threshold**, with an honest unlock message that *encourages* the user to feed the loop.

### Pattern

```
[Locked feature card]
🔒 [Feature name]

[One-line description of what it does]

We need [specific input] to unlock this:
  ✓ Done: [completed input count]
  ○ [Required input still missing] (X of Y)

[CTA: action that progresses the lock]
```

### Why this pattern works

1. **Proves the feature exists** — no vaporware feel
2. **Tells user exactly what unlocks it** — no mystery box gating
3. **Invites the next step** — turns a wall into a runway
4. **Codifies honesty** — the user always knows where the system stands

### Per-project examples (placeholders to fill)

```
[Your project — feature name]
🔒 [What it does for the user]
Need [N] [your data type] to learn.
Done: [current count] / [N].
[CTA: the action that adds more data]
```

The locked-state copy should be written **before** the unlock logic. If the locked-state copy is dishonest or vague, the feature isn't ready to ship.

---

## 7. How to apply this to your project — the worksheet

For any new or existing project, fill in:

### 7.1 Define your loop
- One full cycle of user activity = ?
- How long does one cycle take in calendar time?
- What does the user input at the start? What outcome captures the result?

### 7.2 Run the 5-question audit
- Q1 (Removed-AI test): YES or NO?
- Q2 (Flywheel test): YES or NO?
- Q3 (Hours saved per session): polish / centered / category-defining?
- Q4 (Cost per session): scalable / monetize / enterprise-only?
- Q5 (Proprietary advantage): none / behavior data / vertical dataset?

### 7.3 Map features to the trust ladder
- What works at Loop 0 (no data)?
- What unlocks at Loop 1, 2, 3, 4-5, 6+?
- Which AI features are explicitly **locked** until later loops?

### 7.4 Specify data thresholds
For each AI feature, write the LOCKED-state copy **before** writing the unlock logic. If you can't write it honestly, the feature is premature.

### 7.5 Apply anti-fabrication rules
- What validator rejects fabricated AI output?
- Where is the substring/citation check?
- How does silent failure show up to the user?

### 7.6 Define the gating state per AI feature

| Feature | Today's state (HIDDEN / LOCKED / PREVIEW / AVAILABLE / RECOMMENDED) | Trigger to advance |
|---|---|---|
| | | |

---

## 8. Decision rule for new AI features

When considering adding a new AI feature:

1. **Audit it with the 5 questions.** If it doesn't pass Q1+Q2, ask whether you're building real AI or decoration.
2. **Locate it on the trust ladder.** What loop count does this feature require?
3. **Pick its gating state.** Where does it live before it's earned?
4. **Pressure-test against the anti-fabrication rules.** Is anything hardcoded that you'd be embarrassed for users to discover?
5. **Apply the data threshold pattern.** Write the LOCKED-state copy first.

If the feature can't pass all 5 checks, **don't ship it.** Park it as a future unlock with an honest "not yet" reason.

---

## 9. The contrarian footnotes

What this framework intentionally does NOT optimize for:

- **Speed-to-market against an AI-shaped competitor.** If "ship fast and iterate" is the strategic answer, you may compromise the trust ladder. Be conscious about it.
- **Investor demos.** AI-first principles are about long-term defensibility, not pitch theater. A demo faking Loop 6 capability on a Loop 0 dataset is dishonest, even if it raises money.
- **Pure AI labs research.** We're building products with real users. Some research-grade techniques don't survive the substring-validation rule. That's acceptable.
- **Pivots driven by trend cycles.** If "agent" becomes uncool in 2027, this framework still applies. Real work + flywheel + honesty doesn't go out of fashion.

---

## 10. Cross-reference

This rule pairs with `data-flywheel.md` (the operational counterpart):

- `ai-first-principles.md` (this file) — *how to think about AI*: when it's centered, when it unlocks, what it can claim
- `data-flywheel.md` — *what data to collect*: schemas, contribution types, privacy rules, moderation, the substring-validation pattern in depth

Use both together. Without principles, the data flywheel becomes surveillance. Without the flywheel, principles become theater.

---

*This file is part of the VictorForge factory ruleset. Auto-loaded into every project that has `.claude/rules/`. Update via PR; changes propagate to all projects on next session.*
