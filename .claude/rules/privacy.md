# Privacy Rules + Security Patterns

## AI API Boundaries — MANDATORY for All Projects

### NEVER Send to Any AI API
- Social Security Numbers (SSN)
- Employer Identification Numbers (EIN)
- Bank account numbers or routing numbers
- Full names (first + last together)
- Full addresses
- Credit card numbers
- Passwords or auth tokens

### What You CAN Send
- Date, amount, category, type
- Truncated merchant name (max 20 chars)
- Aggregated/summarized data
- Category IDs (not names)
- Boolean flags (isRecurring, isDeductible)

## API Key Security
- **NEVER use `VITE_` prefix for secret API keys.** VITE_ exposes vars to browser bundle.
- **NEVER use `dangerouslyAllowBrowser: true`** on any AI SDK client.
- **ALL AI API calls go through server-side functions** (Supabase Edge Functions, Vercel Functions, etc.)
- **Pattern:** Browser -> `supabase.functions.invoke()` -> Edge Function -> `Deno.env.get('API_KEY')` -> External API -> response
- Only use `VITE_` for PUBLIC config (Supabase anon key, Supabase URL, Turnstile site key)

## Data Storage
- All money as BIGINT cents (never floating point)
- PII encrypted at rest (Supabase default)
- RLS enabled on ALL tables (no exceptions, verify with SQL audit)
- Storage buckets set to private by default
- Edge Functions use `Deno.env.get()` for secrets (never hardcoded)

## Secrets Management
- `.env` and `.env.local` in `.gitignore` (always)
- `.env.example` with placeholder values committed
- Pre-commit hook blocks secret patterns in ALL files including .md
- Never put API keys in URL query strings (use headers)
- Rotate keys immediately if ever exposed in git history
- Document key rotation as prose, never as bash examples with actual key patterns

## AI Audit Trail
- All AI API calls logged (timestamp, model, token count, purpose)
- User can see what was sent to AI (transparency)
- All AI actions logged to audit store

## Marketing & User Data Claims
- "Zero data sold. Zero LLM calls in free tier." — must be TRUE
- User data never leaves their Supabase row (RLS enforced)
- Collective benchmarks are anonymized aggregates only

## Security Patterns

### RLS Audit (run before every launch)
```sql
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
```
Every row must show `relrowsecurity = true`.

### Storage Bucket Check
```sql
SELECT id, name, public FROM storage.buckets;
```
User-uploaded content buckets must be `public = false`.

### Security Headers (vercel.json or equivalent)
- Strict-Transport-Security (HSTS)
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin

### Account Deletion (app store requirement)
- Must exist in Settings > Danger Zone
- Type "DELETE" confirmation
- Wipe: storage files, all user rows (in FK dependency order), auth user
- Sign out and redirect after completion

### Pre-Launch Security Checklist
- [ ] All money in cents (DB) / 100 (display)
- [ ] HITL feedback loop working
- [ ] Zero fakes / placeholders / mock data
- [ ] No hardcoded API keys in source
- [ ] RLS on all tables (verified with SQL audit)
- [ ] Storage buckets set to private
- [ ] Error boundary in place
- [ ] Image compression on uploads
- [ ] Account deletion button
- [ ] Privacy Policy + Terms of Service pages
- [ ] Security headers configured
- [ ] Pre-commit hook blocks secrets
- [ ] Design system enforced (no ad-hoc colors)
- [ ] 2FA enrollment + enforcement together
