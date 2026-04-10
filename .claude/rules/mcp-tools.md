# Connected MCP Tools & How to Use Them

## Standing Rule
NEVER tell Victor "you need to do this manually" without first checking if an MCP tool can do it. Try the tool. If it fails, report why. Only escalate to manual as a last resort.

## Available MCP Servers

### Supabase (Primary DB/Backend)
- `execute_sql` — Run any SQL query. Use for schema audits, data checks, RLS verification
- `deploy_edge_function` — Deploy serverless functions. IMPORTANT: inline shared code, relative imports fail
- `apply_migration` — Run DDL migrations
- `list_tables`, `list_migrations`, `list_extensions` — Discovery
- `get_logs` — Tail function logs for debugging
- `get_project`, `get_project_url` — Project info
- FinKeel project_id: `trcrzkeeceocfsrmfxfm`

### Gmail
- `gmail_search_messages` — Find emails by query
- `gmail_read_message`, `gmail_read_thread` — Read email content
- `gmail_create_draft` — Draft responses
- `gmail_list_labels` — Organize

### Cloudflare
- Workers, KV, R2, D1 — Full Cloudflare stack
- `search_cloudflare_documentation` — Look up docs

### Vercel
- Deployments, env vars, build logs, domains

### Asana
- Project/task management for client work

### Firebase
- Available but not primary

### Linear
- Issue tracking

### X / Twitter API (api.x.com)
- **Bearer Token auth** — set as `X_BEARER_TOKEN` env var, NEVER hardcode
- **Search recent posts** — `GET /2/tweets/search/recent?query=...` (last 7 days)
- **User lookup** — `GET /2/users/by/username/:username`
- **User timeline** — `GET /2/users/:id/tweets`
- **Trends by location** — `GET /2/trends/by/woeid/:id` (US = 23424977)
- **Filtered Stream** — persistent HTTP connection for real-time post delivery
- **Pay-per-use pricing** — no monthly tiers, only pay for what you use
- **20% back in xAI credits** on X API spend
- **Official SDKs:** Python (`pip install xdk`), TypeScript (`npm install @xdevplatform/xdk`)
- **Use for:** destination sentiment (EaseAway), market research, lead discovery
- **Don't use for:** anything requiring user OAuth unless user authenticates your app
- **Cost control:** always filter with keywords BEFORE making API calls. Never stream without tight rules.
- **Docs:** https://docs.x.com, index at https://docs.x.com/llms.txt

### Grok / xAI API (api.x.ai)
- **Model:** grok-3-latest
- **Advantage over Claude for X data:** has real-time X context in its training — can answer "what are people saying about [topic] on X" without separate API calls
- **Use for:** weekly industry synthesis, trend analysis where you'd otherwise read 200 posts
- **Cost:** ~$0.01-0.03/call. Use sparingly — weekly summaries, not per-signal

## Tech Defaults for New Projects (Starting Point, Not Gospel)
- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn/ui
- **Database:** Supabase PostgreSQL (snake_case, RLS on ALL tables)
- **State:** Zustand with encrypted localStorage
- **Auth:** Supabase Auth (email + OAuth + optional 2FA)
- **AI:** Gemini (vision/OCR), Claude (strategy), local heuristics (free tier)
- **Deploy:** Vercel (zero-config)
- **Email:** Resend (transactional) + Proton Mail (business)
- **Payments:** Stripe
- **CAPTCHA:** Cloudflare Turnstile

> These defaults optimize for Victor's build speed. For each new project, the Stack Optimizer (Phase 1.5) validates these choices against actual requirements. The optimizer may recommend alternatives based on cost, privacy, client needs, or project scale.
