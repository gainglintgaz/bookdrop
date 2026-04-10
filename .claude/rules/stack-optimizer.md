# Stack Optimizer Protocol

Intelligent tech stack evaluation that prevents blind reuse of defaults. Every project gets fresh eyes.

## When to Use
- **Phase 1.5** of the Build Workflow (after Blueprint, before Hostile Critique)
- When Victor says **"Optimize stack for [project]"**
- During **client intake** (after CLIENT_INTAKE_FORM.md, before proposal)
- When **onboarding an existing project** (evaluate what they already have)
- When a **new paid service** is about to be added to any project

## The Fresh Eyes Principle
Do NOT start from the Tech Defaults in mcp-tools.md and rationalize them.
Start from the project's actual requirements and work FORWARD to a stack.

The defaults exist for speed. They are a starting point, not a conclusion.
Ask: "If I were building this from scratch today, would I pick the same tools?"

## The 6 Evaluation Axes
For every tool/service in the stack, score 1-5 (5 = best):

| Axis | What It Measures | Weight |
|------|-----------------|--------|
| **Cost** | Monthly $ at projected scale (include hidden costs) | High |
| **Privacy/Control** | Who owns the data? Where does it live? Can you export? | Medium |
| **Maintenance Burden** | Hours/month to keep it running (updates, patches, monitoring) | High |
| **Vendor Lock-in** | How hard to migrate away? Proprietary APIs? Data portability? | Medium |
| **Reliability** | Uptime, community health, bus factor, support quality | High |
| **Time-to-Ship** | How fast can Victor get V1 out the door with this tool? | High for V1 |

---

## The 6 Phases

### Phase 1: Inventory
List every service/tool the project uses or plans to use:

| Service | Category | Current Monthly Cost | What It Does |
|---------|----------|---------------------|-------------|
| [name] | [db/auth/deploy/ai/payments/email/etc] | [$X] | [one line] |

Include: database, auth, hosting, AI APIs, payments, email, storage, CDN, monitoring, CAPTCHAs, domain registrar.

### Phase 2: Requirements Extraction
From the project brief, extract:
- **Data volume**: How much data? How fast does it grow?
- **User count**: Now and 12-month projection
- **Privacy/compliance**: Any regulations (HIPAA, SOC2, GDPR)?
- **Offline needs**: Must it work without internet?
- **Who maintains after V1**: Victor, client dev team, nobody?
- **Client handoff tolerance**: Can they handle Docker? Or must it be click-to-deploy?
- **Budget ceiling**: What's the max monthly ops cost?

### Phase 3: Fresh Eyes Research
For EACH item in the inventory, research 2-3 alternatives:

1. **Managed alternative** -- another SaaS that's cheaper/better
2. **Self-hosted/open-source** -- can we run this ourselves?
3. **Elimination** -- do we even need this service?

**Discovery tools:**
- Use `search_mcp_registry` MCP tool to find new MCP servers and integrations
- Use `suggest_connectors` MCP tool for integration alternatives
- Web search for "[service] alternatives 2026" and "[service] self-hosted"
- Check: Hetzner, Fly.io, Railway, Coolify, Dokku for self-hosting platforms

**Research each alternative for:** current pricing, migration effort, community size, last release date.

### Phase 4: Decision Table
Output one row per service:

| Service | Category | Current (Cost/Score) | Alt 1 (Cost/Score) | Alt 2 (Cost/Score) | Recommendation |
|---------|----------|---------------------|--------------------|--------------------|----------------|
| [name] | [cat] | [$X/mo, avg 4.2] | [option, $Y/mo, avg 3.8] | [option, $Z/mo, avg 4.5] | KEEP / SWITCH / SELF-HOST / HYBRID |

**Score** = average of the 6 axes (1-5). Don't just pick highest score -- weight by project context.

Recommendation options:
- **KEEP** -- current tool is best fit. State why.
- **SWITCH** -- better option exists. State what and why.
- **SELF-HOST** -- self-hosted version saves money at this scale. Include hosting cost.
- **HYBRID** -- use managed for prod, self-hosted for dev/staging.

### Phase 5: Migration Plan
For any SWITCH or SELF-HOST recommendation:

| Change | Effort (hours) | Risk | Rollback Plan | Dependencies |
|--------|---------------|------|---------------|-------------|
| [what changes] | [N] | LOW/MED/HIGH | [how to undo] | [what must happen first] |

### Phase 6: Time Cost Calculation
Victor's consulting rate = $150/hr. Apply this to every recommendation:

```
Monthly savings from change: $X
Setup effort: N hours x $150 = $Y
Monthly maintenance: M hours x $150 = $Z
Breakeven: Y / (X - Z) = N months
```

**Rules:**
- If breakeven > 12 months: probably not worth it (unless strategic)
- If monthly maintenance > monthly savings: definitely not worth it
- If setup > 20 hours: needs strong justification
- For clients: add 50% risk premium to all effort estimates

---

## Context-Specific Rules

### For Victor's Own Projects
- Optimize for lowest total cost (dollars + time)
- Self-hosting OK if it's a learning investment Victor explicitly wants
- Open-source preferred when quality is equal
- Local-first preferred for privacy-sensitive data (financial, personal)
- Acceptable to experiment with new tools if rollback is easy

### For Consulting -- Tier 1 (Hand-off Build)
- Optimize for **lowest maintenance by the client's team**
- Managed services strongly preferred (client has no ops team)
- Vendor lock-in matters less than "will it work in 6 months with zero updates"
- Document every service and its cost in HANDOFF_PACKET
- Client must be able to understand the monthly bill

### For Consulting -- Tier 2 (Retainer)
- Optimize like Victor's own projects (Victor maintains it)
- But consider: if client leaves retainer, can they still run it?
- Prefer tools with good documentation and community

---

## Skip Conditions
Do NOT run full optimizer for:
- Weekend side projects under 100 LOC
- Prototypes explicitly marked as throwaway
- When Victor says "use defaults" or "skip optimizer"
- When reusing exact same stack as a previous project that was already optimized

Instead, note in CLAUDE.md: "Stack Optimizer skipped. Using defaults. Reason: [why]."

---

## Output Location
- Decision table goes into the project's CLAUDE.md under "## Tech Stack Rationale"
- For consulting projects, also goes into PROPOSAL_TEMPLATE.md "Tech Stack Assessment"
- If a SWITCH/SELF-HOST is recommended, add migration tasks to CURRENT_SPRINT.md

## Learning Loop
After project ships:
- Did any stack choice cause problems? Log to errors-fixed.json with tag `[stack-choice]`
- Did a non-default choice work great? Log to golden-paths.md
- If a stack choice failed twice across projects: propose updating Tech Defaults in mcp-tools.md
