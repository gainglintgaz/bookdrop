# Connected MCP Servers — How to Use Them

> **Authority:** Auto-loaded global rule. Catalogs MCP servers connected to Victor's factory and platform agents.
> **Last updated:** 2026-05-13 (split from mcp-tools.md)
> **Companion:** `tech-defaults.md` (default stack choices per project) + `model-router.json` (data-driven model selection per task).
> **Project IDs:** stored per-project in `projects/<name>/BRIEF.md`, never in this global rule.

---

## Standing Rule — MCP-First

Never tell Victor "you need to do this manually" without first checking if an MCP tool can do it. Try the tool. If it fails, report why. Only escalate to manual as a last resort. Companion rule: VIBE Rule #24 (MCP/Skill First — search MCP Registry + Anthropic Skills marketplace before writing utility code). Use the `check-marketplace` skill before scaffolding new tooling.

---

## §1 — Discovery (check these BEFORE writing custom integrations)

| Tool | When to use |
|---|---|
| `check-marketplace` skill | First stop for ANY new utility — searches MCP Registry + Anthropic Skills + Vercel Marketplace + factory-installed agents/skills |
| `mcp__mcp-registry__search_mcp_registry` | Find new MCP servers by keyword |
| `mcp__mcp-registry__suggest_connectors` | Get suggestions for a specific integration need |
| `mcp__mcp-registry__list_connectors` | List installed connectors and their status |
| Anthropic Skills marketplace (`npx skills add ...`) | Find Anthropic-stewarded skills (xlsx, docx, pdf, pptx, finance-*, design-*, data-*, etc.) — see active skill list in session bootstrap |

---

## §2 — Data & Backend

### Supabase
- `execute_sql` — Run any SQL query. Use for schema audits, data checks, RLS verification
- `deploy_edge_function` — Deploy serverless functions. **Inline shared code; relative imports fail when deploying via MCP**
- `apply_migration` — Run DDL migrations. **Follow §5 in `data-protection.md`**: dev project by default, prod requires explicit user flag, run `get_advisors` after every migration
- `list_tables`, `list_migrations`, `list_extensions` — Discovery
- `get_logs` — Tail function logs for debugging
- `get_advisors` — Security + performance advisor scan (mandatory after every `apply_migration`)
- `get_project`, `get_project_url`, `get_publishable_keys` — Project metadata
- **Project IDs:** see each project's `BRIEF.md` under "Supabase project:" — never hardcode here

### Cloudflare
- Workers, KV namespaces, R2 buckets, D1 databases, Hyperdrive configs
- `search_cloudflare_documentation` — Look up docs without leaving the session

### Firebase (plugin)
- Available but not primary. Use when a client project already uses Firebase Auth / Firestore.

---

## §3 — Project Management

| Server | Use for |
|---|---|
| Asana | Client-work task tracking |
| Linear | Internal issue tracking + VictorForge factory work |
| GitHub | Repo management, PRs, branches, releases, secret scanning |
| Google Drive | Client documents, sheets, stored assets |

---

## §4 — Communication

| Server | Use for |
|---|---|
| Gmail | Search threads, draft replies, manage labels |
| Google Calendar | Read/create events, find meeting times |

---

## §5 — Deploy & Platform

| Server | Use for |
|---|---|
| Vercel | Deployments, env vars, build logs, domain config, runtime logs |
| Cloudflare | Workers/KV/R2/D1 (covered §2) |

---

## §6 — AI & Research APIs (external, not MCP)

These are HTTP APIs Victor uses via Edge Functions or scheduled tasks, not MCP servers — but listed here so the factory knows what's wired.

### X / Twitter API (api.x.com)
- **Auth:** Bearer Token via `X_BEARER_TOKEN` env var — NEVER hardcode
- **Endpoints used:** recent search, user lookup, user timeline, trends by WOEID, filtered stream
- **Pricing:** pay-per-use, no monthly tiers. 20% back in xAI credits on X API spend
- **SDKs:** Python `pip install xdk`, TypeScript `npm install @xdevplatform/xdk`
- **Use for:** destination sentiment (EaseAway), market research, lead discovery, weekly synthesis input
- **Don't use for:** anything requiring user OAuth unless your app handles auth
- **Cost control:** always filter with keywords BEFORE making API calls; never stream without tight rules
- **Docs:** https://docs.x.com, LLM index at https://docs.x.com/llms.txt

### Grok / xAI API (api.x.ai)
- **Advantage:** has real-time X context in training — can answer "what are people saying about X" without separate API calls
- **Model version:** see `model-router.json` (`x_data` task category) for current preferred model
- **Use for:** weekly industry synthesis, trend analysis where you'd otherwise read 200 posts
- **Don't use for:** per-signal classification (Tier-1 regex classifier handles that)
- **Cost:** ~$0.01-0.03/call. Sparingly — weekly summaries, not per-signal

### Perplexity API
- **Use for:** competitive research, market sizing, surfacing recent citations
- **Model version:** see `model-router.json` (`research` task category)
- **Don't use for:** internal Q&A on Victor's own data (use Gemini + RAG)

### Anthropic / OpenAI / Gemini
- **All routed through `model-router.json`** — per-task preferred lists. Hard caps: $5/task, $30/session.
- **Per-project override** via `user_preferred` field in project BRIEF.md.
- **Never `dangerouslyAllowBrowser: true`** — all AI calls server-side per VIBE Rule 23 + Rule 8.

---

## §7 — Computer / Browser Control

| Server | When |
|---|---|
| `computer-use` | Native desktop apps (Maps, Notes, Finder, Photos, System Settings, financial apps for categorization-only — never trades or transfers) |
| `Claude in Chrome` | Any web app without a dedicated MCP. DOM-aware, much faster than computer-use for browser work |
| `Claude Preview` | Live browser preview of dev servers — screenshots, console logs, network inspection |
| `Claude Desktop Projects` | Shared knowledge base across Claude Desktop chats (uses `PERPLEXITY_SPACE_INSTRUCTIONS.md` as the condensed factory rules) |

**Tier rules** (see computer-use server instructions in session bootstrap):
- Browsers → "read" tier (visible only; use claude-in-chrome MCP for clicks)
- Terminals/IDEs → "click" tier (left-click only; use Bash tool for shell commands)
- Everything else → "full" tier

---

## §8 — When the right tool doesn't exist

Order of escalation:
1. `check-marketplace` skill — search MCP Registry + Anthropic Skills + Vercel Marketplace + factory agents/skills
2. If something credible exists (Anthropic-official, >100 GitHub stars, or already wired): use it. Justify in commit body if you choose NOT to.
3. Build custom ONLY if nothing fits OR cost-of-coupling outweighs benefit
4. Mandatory tripwire: any new utility in `src/lib/`, `lib/`, or new agent/skill needs a one-line `Justified: <reason>` in commit body per VIBE Rule 24

---

*See `tech-defaults.md` for default stack choices per project type. See `model-router.json` for per-task model selection.*
