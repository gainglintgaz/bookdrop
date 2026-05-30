# secrets-handling.md — Secret & Token Hygiene Rules

> **Authority:** Auto-loaded global rule. Applies to every VictorForge project and factory session.
> **Last updated:** 2026-05-13
> **Source incident (SEC-03):** EaseAway harvest session — AI used `Read` tool on `.env.local`, exposing `SUPABASE_ACCESS_TOKEN` in the Claude transcript. No factory rule explicitly prohibited this. Token rotation required. This file is the rule that closes that gap permanently.
> **Project-level overrides:** `<project>/.claude/rules/secrets-handling.md` may add stricter constraints; never relax these.

---

## §1 — The threat model (what we're protecting against)

1. **AI reads a .env file** — `Read` tool on `.env`, `.env.local`, `.env.production`, `.env.development` exposes secret values into the Claude session transcript. Transcript is stored in Anthropic infrastructure. Tokens must be rotated immediately.
2. **AI echoes a secret in shell output** — `Bash(cat .env)`, `Bash(echo $VAR)`, `Bash(printenv)` — any command that dumps env vars to stdout gets captured in transcript.
3. **Secret appears in git history** — token committed to version control, even briefly. GitHub/Gitpod scanners will find it.
4. **Secret in log file** — script writes env vars to a .log or .md file that gets committed or shared.
5. **Secret in MCP call parameters** — a Supabase/API call includes a token value in the request body rather than reading from env.
6. **Cross-project contamination** — a token seen in Project A's session is reused in Project B without rotation. One leaked token, multiple projects compromised.
7. **.env.example with real values** — example files are committed. If someone puts a real key in an example file "just to show the format," it's now in git forever.

This rule closes threats 1-3 explicitly. Threats 4-7 are mitigated via tripwires below.

---

## §2 — THE CORE PROHIBITION (non-negotiable, no exceptions)

### §2.1 Never Read .env files

**AI MUST NEVER use the `Read` tool on:**
- `.env`
- `.env.local`
- `.env.development`
- `.env.development.local`
- `.env.production`
- `.env.production.local`
- `.env.test`
- `.env.test.local`
- `.env.staging`
- `*.env` (any file ending in .env)
- `secrets.json`, `secrets.yaml`, `secrets.toml` (common alternatives)

**When asked to inspect secrets configuration**, the correct approach is:
1. Read `.env.example` (never the real file)
2. Read the code that REFERENCES the env var (`Deno.env.get('VAR_NAME')`, `process.env.VAR_NAME`)
3. State: "I can see the code expects `VAR_NAME`. I cannot read the .env file to check its value — that protects the secret. Please verify it's set."

**If the .env file is read accidentally** (e.g., user-directed or via a glob that matched it):
- IMMEDIATELY flag: "⚠️ I just read a file containing secret values. Those values are now in this session's transcript. Rotate any tokens that appeared."
- Do NOT repeat or display the values
- Do NOT use the values in any subsequent calls
- Log the incident in PENDING_APPROVALS.md under "Recently Resolved"

### §2.2 Never echo secrets via shell

**AI MUST NEVER run:**
```powershell
cat .env                          # exposes all secrets
echo $env:SECRET_NAME             # exposes specific secret
Get-Content .env                  # same as cat
printenv                          # exposes all shell env vars
[System.Environment]::GetEnvironmentVariable("TOKEN")   # exposes value
```

**When verifying a secret is set**, use existence checks only:
```powershell
# CORRECT — checks if set without revealing value
[bool]$env:SUPABASE_ACCESS_TOKEN  # → True or False
Test-Path env:SUPABASE_ACCESS_TOKEN  # → True or False
$null -ne $env:SUPABASE_ACCESS_TOKEN  # → True or False

# CORRECT — verify key count without values
(Get-Content .env.example).Count  # → N (count of expected vars)
```

### §2.3 Never include secret values in any written file

AI MUST NOT write secret values into:
- `*.md` files (including SESSION_DEBRIEF.md, CHANGELOG.md, errors-fixed.json)
- Log files (`logs/*.log`)
- Reports (`STATUS_REPORT.md`, `WEEKLY_INSIGHTS.md`)
- Script output files
- Comments in any code file

If a script or session debrief needs to reference a token, use the **name** only: `SUPABASE_ACCESS_TOKEN` (confirmed set), never the value.

---

## §3 — Token rotation protocol

### §3.1 When to rotate immediately (non-negotiable)

Rotate a token/key within 24 hours if ANY of the following happened:

| Event | Token(s) to rotate |
|---|---|
| AI read a .env file in a session | Every token in that file |
| `cat .env` or equivalent ran in Bash | Every token in that file |
| A secret value appeared anywhere in a Claude transcript | That specific token |
| A token appeared in a git commit (even briefly, even if reverted) | That specific token |
| A token appeared in a shared screenshot, video recording, or screen share | That specific token |
| You see "your API key is `sk-...`" in any session output | That specific token |
| Token has been in use >90 days | That token (quarterly rotation floor) |

### §3.2 Rotation checklist (per token)

```
For each token to rotate:
□ Generate new token in the provider's dashboard
□ Update .env.local in the affected project
□ Update .env.local in any other project using the same token
□ If token is in factory scripts (backup, scheduler): update there too
□ Revoke the old token in the provider dashboard
□ Verify no .env files are committed (git status check)
□ Log rotation in DECISIONS.md: date, token name, reason
□ Note in PROJECT_REGISTRY.md if it affects the project's status
```

### §3.3 SEC-03 specific rotation (EaseAway 2026-05-13)

Token exposed: `SUPABASE_ACCESS_TOKEN` (EaseAway project)

Rotation steps:
1. Supabase Dashboard → Account → Access Tokens → Revoke the exposed token
2. Generate new token with minimal required scope
3. Update `C:\Users\vtbsj\Documents\easeaway-test\.env.local`
4. Verify no other project uses this same token value
5. Log in DECISIONS.md

**Status:** ⚠️ PENDING — Victor to complete (cannot be done by AI session)

---

## §4 — Session-level awareness (every session start)

At session start for any project, AI should silently verify:

```
□ Is there a .env file in this project? (check via Glob *.env* — note existence only, do not Read)
□ Did the previous session's SESSION_DEBRIEF.md flag any secret exposure incidents?
□ Does CURRENT_SPRINT.md have any open SEC-## items?
```

If any answer surfaces a concern, flag it to Victor before starting work.

---

## §5 — Script hygiene (for factory PowerShell scripts)

Factory scripts (`scripts/*.ps1`) frequently reference environment variables for backup, API calls, scheduled tasks. Rules:

### §5.1 How to read secrets in scripts

```powershell
# CORRECT — read from env var, never hardcode
$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) {
    Write-Error "SUPABASE_ACCESS_TOKEN not set. Cannot proceed."
    exit 1
}

# WRONG — hardcoded value in script
$token = "sbp_abc123xyz..."    # NEVER DO THIS

# WRONG — reading from file and storing in log
$token = (Get-Content ".env" | Where-Object { $_ -match "TOKEN=" }).Split("=")[1]
Write-Host "Token: $token"     # NEVER DO THIS
```

### §5.2 Script log files must never contain secret values

```powershell
# CORRECT — log that the token was used without its value
Write-Host "[OK] Token present, proceeding with Supabase operation"

# WRONG — logs the token value
Write-Host "Using token: $token"
```

### §5.3 Scripts that need to verify secret presence

```powershell
function Test-RequiredSecrets {
    param([string[]]$Required)
    $missing = @()
    foreach ($name in $Required) {
        if (-not (Test-Path "env:$name")) { $missing += $name }
    }
    if ($missing.Count -gt 0) {
        Write-Error "Missing required environment variables: $($missing -join ', ')"
        exit 1
    }
    Write-Host "[OK] All $($Required.Count) required secrets present"
}

# Usage in scripts:
Test-RequiredSecrets @("SUPABASE_ACCESS_TOKEN", "B2_APP_KEY", "B2_BUCKET")
```

---

## §6 — Git hygiene for secrets

### §6.1 The .gitignore contract (every project, non-negotiable)

Every project's `.gitignore` must include:
```
# Secrets — never commit
.env
.env.local
.env.development
.env.development.local
.env.production
.env.production.local
.env.test
.env.test.local
.env.staging
*.env
secrets.json
secrets.yaml
secrets.toml
```

### §6.2 .env.example must use placeholder values only

```bash
# CORRECT .env.example
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_ACCESS_TOKEN=sbp_your-token-here
ANTHROPIC_API_KEY=sk-ant-your-key-here

# WRONG .env.example — real values
SUPABASE_URL=https://trcrzkeeceocfsrmfxfm.supabase.co
SUPABASE_ACCESS_TOKEN=sbp_actual_real_value_here    # NEVER DO THIS
```

Tripwire: `grep -r "sbp_\|sk-ant-\|sk-\|eyJ" .env.example` — any match is a breach.

### §6.3 Pre-commit secret scanning

Every project should have `.husky/pre-commit` or equivalent blocking patterns:

```bash
# Block known secret patterns
if git diff --cached --name-only | xargs grep -l "sbp_\|sk-ant-api03-\|AKID\|eyJhbGci" 2>/dev/null; then
    echo "ERROR: Possible secret detected in staged files. Review before committing."
    exit 1
fi
```

Gitleaks-compatible ruleset covers: AWS keys, Anthropic keys, Supabase service role keys, Supabase access tokens, OpenAI keys, Stripe keys, GitHub PATs.

---

## §7 — Cross-project contamination prevention

### §7.1 Each project must have its own tokens

Never reuse the same Supabase access token, API key, or service credential across multiple projects. Reasons:
- Rotating a token in one project doesn't affect another
- Blast radius is contained if one project is compromised
- Audit trail is clean (each project's token fingerprint is unique)

### §7.2 Token registry (per project, in BRIEF.md)

Each project's `projects/<name>/BRIEF.md` should include a **token registry** (names only, no values):

```markdown
## Token Registry (names only — never values)
| Token Name | Provider | Purpose | Last Rotated | Rotation Due |
|---|---|---|---|---|
| SUPABASE_ACCESS_TOKEN | Supabase | DB migrations | 2026-05-13 | 2026-08-13 |
| SUPABASE_ANON_KEY | Supabase | Client SDK | - | Never (public) |
| ANTHROPIC_API_KEY | Anthropic | Claude API calls | 2026-05-01 | 2026-08-01 |
```

This enables the weekly-deep-sweep to flag tokens past their rotation due date.

---

## §8 — Self-check (every session)

Before any task, AI silently checks:

```
□ Am I about to read a .env file? → STOP. Read .env.example instead.
□ Am I about to cat/echo/printenv in Bash? → STOP. Use existence-check pattern.
□ Am I about to write a token value into any .md or log file? → STOP. Use token name only.
□ Did the previous session (SESSION_DEBRIEF.md) flag a secret exposure? → Surface to Victor.
□ Is there an open SEC-## rotation item in PENDING_APPROVALS or CURRENT_SPRINT? → Remind Victor.
```

If any answer is YES → flag before proceeding, never proceed silently.

---

## §9 — Incident response (when a secret is exposed)

### §9.1 Immediate (within minutes)

1. **Do not repeat or reference** the exposed secret value in any further output
2. Flag to Victor: "⚠️ SEC incident: `[TOKEN_NAME]` value appeared in this session. Rotate immediately."
3. Do not continue any work that uses the affected token
4. Add entry to PENDING_APPROVALS.md under "Recently Resolved": date, token name, how it happened

### §9.2 Short-term (within 24 hours — Victor action required)

1. Rotate the token in the provider's dashboard (see §3.2 rotation checklist)
2. Update all .env.local files referencing the old token
3. Revoke the old token
4. Update TOKEN_REGISTRY in the project's BRIEF.md

### §9.3 Follow-up (this session or next session)

1. Identify which factory rule gap allowed the exposure
2. Propose rule update in PENDING_APPROVALS.md
3. Run `sync-rules-to-platforms.ps1` after new rule is committed (so all platform mirrors carry the fix)

---

## §10 — Integration with existing rules

This file extends but does not replace:

| Rule file | What it covers | How secrets-handling.md adds to it |
|---|---|---|
| `privacy.md` | No PII to AI APIs, API key patterns | Adds Read-tool prohibition, existence-check patterns |
| `data-protection.md` | Production DB protection, token scope | Adds transcript hygiene, rotation protocol |
| `vibe-standard.md` Rule 33 | Never commit secrets | Adds pre-commit scanner, .env.example discipline |
| `self-reflection.md` | End-of-session audit | Adds SEC-check to §8 self-check questions |

---

## §11 — Tripwires (runnable greps)

### Detect .env reads in scripts or code
```bash
grep -rn "Read.*\.env\|Get-Content.*\.env\|cat.*\.env" .
# Any match = violation. Replace with existence check.
```

### Detect secret values in .env.example
```bash
grep -rn "sbp_[a-zA-Z0-9]\{20\}\|sk-ant-api03-\|sk-proj-\|AKIA[A-Z0-9]\{16\}" .env.example
# Any match = real token in example file = must rotate + remove
```

### Detect token values hardcoded in scripts
```bash
grep -rn "sbp_\|sk-ant-\|sk-proj-\|AKIA\|eyJhbGciOiJIUzI" scripts/ .claude/
# Should return zero results
```

### Detect echo/cat of .env in factory scripts
```bash
grep -rn "cat.*\.env\|printenv\|Write-Host.*\$env:" scripts/
# Review any matches — printing env var values to output is a leak vector
```

---

## §12 — Factory tooling gap (why this rule didn't exist before)

**Root cause (SEC-03, 2026-05-13):** The `/harvest` skill's STEP 1 reads project files to orient itself. No exclusion list existed for .env files. The session read `.env.local` during orientation, exposing `SUPABASE_ACCESS_TOKEN` in the transcript.

**Fix applied:**
1. This rule file (global prohibition)
2. `/harvest` skill updated to explicitly skip any file matching `*.env*` or `.env*`
3. `onboard-existing-project.ps1` updated to add `*.env*` exclusion to any file-reading operations

**Why this matters for v4.3.5 passive-listening:** the UserPromptSubmit hook processes user prompts. Those prompts sometimes contain partial env var values typed by accident ("my token is sbp_..."). The Tier-1 classifier MUST include a SECURITY signal pattern that matches token-shaped strings and fires an immediate rotation alert.

---

*This rule closes SEC-03. Rotate SUPABASE_ACCESS_TOKEN immediately. Rotate any other token that appeared in any Claude session transcript in the last 90 days. The rotation cadence is 90 days regardless — set a calendar reminder.*
