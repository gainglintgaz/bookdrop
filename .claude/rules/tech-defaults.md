# Tech Defaults for New Projects

> **Authority:** Auto-loaded global rule. Default stack choices that optimize for Victor's build speed.
> **Last updated:** 2026-05-13 (split from mcp-tools.md)
> **Companion:** `mcp-servers.md` (which MCPs are connected) + `stack-optimizer.md` (Phase 1.5 validation against project requirements) + `model-router.json` (data-driven per-task model selection).
> **These are starting points, not gospel.** For each new project, the Stack Optimizer validates these against actual requirements.

---

## §1 — Default Stack (web app, V1)

| Layer | Default | Rationale |
|---|---|---|
| Frontend | Vite + React + TypeScript + Tailwind + shadcn/ui | Build speed; AI agents have most context for this stack |
| Database | Supabase Postgres (snake_case, RLS on every table) | Edge Functions + RLS + auth in one. See `data-protection.md` §2 |
| State | Zustand with encrypted localStorage persist | Lower ceremony than Redux; persist is critical for FinKeel-class apps |
| Auth | Supabase Auth (email + OAuth + optional 2FA) | Step-up requires 2FA enrollment + enforcement together (see lessons #33) |
| AI calls | Server-side only via Edge Functions | NEVER `dangerouslyAllowBrowser: true`; never `VITE_` prefix on secret keys |
| Deploy | Cloudflare Pages (FinKeel-class) or Vercel (Next.js / next-forge) | See deploy decision tree below |
| Email | Resend (transactional) + Proton Mail (business) | Resend has React Email; Proton for compliance posture |
| Payments | Stripe (test + live; never live before LLC + attorney review) | |
| CAPTCHA | Cloudflare Turnstile | Free, privacy-respecting, no Google dependency |
| Edge / serverless | Supabase Edge Functions (Deno) | All AI calls + webhooks; never browser-side |
| Vector / RAG | pgvector in Supabase Pro | Free, single-vendor; Gemini `text-embedding-004` for embeddings |
| Cache | `llm_response_cache` Supabase table (BIGINT prompt_hash + TTL) | Per 2026-04-29 plan; 30-50% cost reduction on repeat queries |

---

## §2 — Per-Task Model Selection (data-driven)

**Models are NOT hardcoded in rule files anymore.** All model selection is driven by `.claude/model-router.json` which the tech-radar agent refreshes weekly.

Task categories in the router:
- `architecture` — multi-file planning, complex reasoning
- `code_build` — standard build / editing / feature work
- `quick_edit` — single-file edits, formatting, small fixes
- `vision_ocr` — receipts, paystubs, W-2s, invoices
- `x_data` — real-time X/social research, trend analysis
- `research` — competitive research, market sizing
- `data_qa` — Q&A on user transaction data
- `marketing_copy` — anti-slop content drafting
- `agent_dispatch` — autonomous agent runs

**Hard caps:** $5/task, $30/session (enforced in router).

**Per-project override:** add a `user_preferred` field in `projects/<name>/BRIEF.md` for task categories where the project's privacy/cost/quality posture diverges from the default.

**Tripwire:** any prompt that hardcodes a model name in a rule file or skill should reference `model-router.json` instead. Tech-radar agent (Monday 7am cron, when wired) refreshes preferred lists when new models ship.

---

## §3 — Deploy Decision Tree

```
Is the project a Next.js / next-forge / fullstack-React app?
├── YES → Vercel (zero-config + AI Gateway + native marketplace)
└── NO  → Cloudflare Pages (SPA-only, lower cost, integrated with Workers)

Does it need long-running workflows / durable execution?
├── YES → Vercel Workflow DevKit (WDK)
└── NO  → standard serverless

Does it need agentic AI / pause-resume / crash-safe orchestration?
├── YES → Vercel WDK + AI SDK + Vercel Sandbox
└── NO  → Supabase Edge Functions

Two-environment minimum (dev + prod):
- Both deployments wired from day 1
- Migrations applied dev → tested → promoted to prod via PR
- AI agents work on dev by default
```

---

## §4 — Anti-defaults (do NOT pick these unless explicitly justified)

| Don't | Use instead | Why |
|---|---|---|
| Firebase Auth on a new Victor project | Supabase Auth | Single-vendor benefit; FinKeel patterns reuse |
| MongoDB | Supabase Postgres | Relational data + RLS + Edge Functions in one |
| Heroku / Railway for new projects | Cloudflare Pages or Vercel | Blast-radius lessons from PocketOS / Railway 2026-04 |
| `dotenv` loaded in browser | Server-side env vars only | Secret leakage risk |
| OpenAI SDK with `dangerouslyAllowBrowser: true` | Edge Function proxy | VIBE Rule 8 + Rule 23 |
| Express on a fresh project | Hono on Cloudflare Workers, or Edge Functions | Edge-first compute is the 2026 default |
| Self-hosted Postgres on a $5 VPS | Supabase or Neon | Backup + PITR + advisor scans included |
| Local Ollama for production agents | Cloud Claude / Gemini via router | Maintenance burden + cost-of-coupling; revisit only if privacy compliance requires |

---

## §5 — Per-project override pattern

Every project's `projects/<name>/BRIEF.md` has a "Tech Stack Rationale" section produced by the Stack Optimizer (Phase 1.5 of execution.md workflow). Project-level choices documented there override these globals.

When a project diverges (e.g., FinKeel Local uses Tauri + Svelte + local Ollama for privacy-first desktop), the BRIEF.md decision table is the source of truth.

---

*Defaults are validated against project requirements by the Stack Optimizer per `stack-optimizer.md` Phase 1.5 of the build workflow. Override at project level when actual requirements diverge.*
