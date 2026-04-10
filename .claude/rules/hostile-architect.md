# Hostile Architect Protocol

A devil's advocate pass that tries to break every plan before code is written. Not about being negative — about finding the gaps that become bugs in session 15.

## When to Use
- After completing a project brief or feature spec, BEFORE writing any code
- After any major architecture decision
- Before every client proposal delivery
- When Victor says "Hostile Architect [feature]"

## The 8 Phases

### Phase 0: Tool Audit & Monthly Cost Estimate
Before reviewing architecture, inventory every paid tool/service the project uses or plans to use.

**For each service, log:**
| Service | Category | Free Tier? | Monthly Cost at V1 | Monthly Cost at 1K Users | Annual Total |
|---------|----------|-----------|--------------------|--------------------------|----|
| [name] | [db/auth/hosting/ai/payments/email/etc] | [yes/no + limits] | [$X] | [$Y] | [$Z] |

**Rules:**
- Include EVERYTHING: domain, hosting, database, auth, AI APIs, email, payments processor fees, monitoring, CAPTCHA, CDN
- Use real pricing pages, not estimates. Link the pricing URL.
- Calculate at TWO scales: V1 launch (0-100 users) and growth (1,000 users)
- Flag any service with no free tier or where free tier won't survive V1
- Flag any service that costs >$50/mo at 1K users
- Total monthly burn goes at the bottom

**Output:** Save to `project-costs.json` in the project root:
```json
{
  "project": "ProjectName",
  "lastUpdated": "2026-04-05",
  "monthlyBurnV1": 5.00,
  "monthlyBurn1K": 47.00,
  "services": [
    {
      "name": "Supabase",
      "category": "database",
      "freeTier": true,
      "freeTierLimits": "500MB, 50K auth users",
      "costV1": 0,
      "cost1K": 25,
      "pricingUrl": "https://supabase.com/pricing",
      "notes": "Pro plan needed at ~500 active users"
    }
  ]
}
```

**For client proposals:** Include the cost table in PROPOSAL_TEMPLATE.md so clients see real monthly costs upfront. This builds trust and differentiates from competitors who hide costs.

### Phase 1: Boundary Attack
What happens at the edges?
- **Empty state:** 0 items — helpful message or crash?
- **Max data:** 10,000 items — paginate or freeze?
- **Wrong mode:** Switch Personal/Business mid-save?
- **No network:** Degrade gracefully or white-screen?
- **Stale cache:** localStorage from previous schema version?
- **Concurrent writes:** Two tabs save simultaneously?

### Phase 2: Persistence Audit
Does data ACTUALLY reach the database?
- Trace: UI action -> state change -> API call -> DB write -> SELECT query -> UI display
- If ANY link is broken, the feature is FAKE
- **Lesson:** FinKeel shipped 30+ fake features because audits checked rendering, not DB persistence
- **Document date integrity:** Financial documents must be stored with the tax year they cover, NOT the upload date. Verify: does a 2025 W-2 uploaded today get attributed to 2025 or 2026?
- **Temporal query integrity:** Does every query that retrieves financial data filter by the correct tax year, not by created_at?

### Phase 3: Cascade Analysis
If this fails, what else breaks?
- Map every dependency
- **Example:** Bad category token -> wrong Schedule C line -> wrong tax estimate -> wrong annual summary
- One classification error ruins EVERYTHING downstream

### Phase 4: Honest Strings Check
Is every number, percentage, and label showing REAL data?
- Trend percentages, dashboard metrics, chart data, progress indicators
- **Example:** FinKeel Dashboard had "+1.2%" and "8%" hardcoded as trends — shipped to production
- **Data basis disclosure:** Does every projection or calculation show what data it's based on? "Based on 1 of ~24 expected paystubs" must appear when data is partial.
- **Completeness gate check:** Does every smart feature refuse to show results when required data is missing? Or does it silently show wrong numbers?
- **Year scope label:** Does every financial screen explicitly state which tax year or time period it covers?

### Phase 5: System Boundary Probe
Where does your code end and someone else's begin?
- Supabase RLS policies (can the user actually read/write?)
- Edge Function cold starts (will it timeout?)
- AI API response format changes (safeParseJson handling malformed responses?)
- External API rate limits (IFTTT: 25/hour on Pro)

### Phase 6: Moat Check
What data network effect exists?
- How does usage make the app smarter?
- If someone clones the repo tomorrow, what do they NOT have?
- Is there a HITL feedback loop that compounds?
- Does the free tier work without external API calls?

### Phase 7: Revenue Reality
Is someone paying for this? How? When?
- Revenue model identified and specific?
- First-dollar path clear?
- Unit economics viable? (CAC < LTV)

## Output Format
For each finding:
| Severity | Phase | What Breaks | Test to Run | Mitigation |
|----------|-------|------------|-------------|------------|
| CRITICAL/HIGH/MEDIUM/LOW | Which phase | User-facing consequence | Exact steps to verify | How to fix |

## Example: Financial News Pipeline
| Severity | Phase | What Breaks | Test | Mitigation |
|----------|-------|------------|------|------------|
| CRITICAL | Persistence | RSS items in memory only, lost on crash | Check raw_articles table after fetch | Write to DB before processing |
| CRITICAL | Cascade | Gemini misclassifies pump-and-dump | Review generated posts | HITL approval mandatory |
| CRITICAL | Boundary | 5 feeds + Gemini > 60s timeout | Time the function | Decouple into separate functions |
| HIGH | Boundary | IFTTT: 30 runs > 25/hour limit | Count webhooks | Stagger over 2 hours |
| HIGH | Cascade | IFTTT fails silently, Victor thinks posted | Check IFTTT logs | Confirmation webhook |
| MEDIUM | Boundary | All RSS feeds down | Block all feeds | Retry with backoff + cached fallback |

**Rule:** Address ALL CRITICALs before writing code. HIGH items get mitigations planned.

## QA Testing Matrix (Pre-Launch)
Run ALL before every launch or client handoff:

1. **Offline Test** — Disconnect internet, click all buttons. ErrorBoundary or white-screen?
2. **Chaos Test** — Double-click every submit. UNIQUE constraints prevent dupes? Loading states block re-submit?
3. **Fresh Account Test** — Purge localStorage, new user. Onboarding triggers? Empty states work?
4. **Bad AI Test** — Hardcode malformed JSON into parser. safeParseJson catches it? User can retry?
5. **Mode Switch Test** — Toggle Personal/Business. Identity Firewall clears all arrays? No cross-contamination?
6. **Honest Strings Audit** — Every % from real calculation? Every $ from DB? Zero placeholders?
7. **DB Round-Trip Test** — Save in UI -> SELECT query -> row exists -> reload -> still displays?
8. **Security Sweep** — grep for hardcoded keys, verify RLS on all tables, Edge Functions use Deno.env.get()
9. **Data Completeness Gate Test** — Remove one required document. Does the smart feature lock with a "what's missing" message, or does it silently produce wrong results?
10. **Wrong Year Document Test** — Upload a document dated in the previous tax year. Is it stored with the correct tax year or the upload date? Does it appear in the correct year's view?
11. **Partial Data Test** — Add only 1 of 12 months of transactions. Does any annual projection warn it's incomplete, or does it silently extrapolate to a full year?
12. **OAuth Fresh Tab Test** — Test every sign-up and sign-in flow by navigating directly to the app URL in a fresh tab. Never test OAuth from an error page, iframe, or redirected URL.
13. **Dead Button Test** — Click every button and link in the app. Any that do nothing, route incorrectly, or produce empty/header-only output are CRITICAL failures before launch.
14. **Export Relevance Test** — Download every export format. Verify each file contains only items relevant to its stated context. Tax export = tax items only. No mixing.
15. **Code Read Test** — Before any commit, read every file Claude generated or significantly modified in this session. Not the diff — the whole file. Scan specifically for: (a) silent `catch(e) {}` blocks, (b) hardcoded values or keys, (c) routes or RPCs missing auth checks, (d) data fetches inside loops (N+1). Any of these found is a CRITICAL hold. AI-generated code that ships unread is the root of every garbage codebase.
