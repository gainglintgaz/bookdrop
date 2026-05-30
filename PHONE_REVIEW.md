# PHONE_REVIEW — review + ship from your phone while on vacation

Goal: while you're away, work keeps flowing. You don't write code on your phone — you review + approve.

## Once before you leave

1. **Install GitHub Mobile** (App Store / Play Store) → sign in → watch this repo (bell icon top-right of repo page)
2. **Install Vercel mobile** (optional — web works fine too)
3. **Confirm `npm run audit-docs` works locally** so you trust the CI advisory
4. **Verify vacation-watchdog is green** — go to GitHub → Actions → vacation-watchdog → "Run workflow" → set `open_issue_always=true` → confirm an issue opens with all-green status

## Daily flow while away (5 min/day on phone)

1. **Morning**: open GitHub Mobile → Notifications. You'll see one of:
   - `[vacation-watchdog]` morning report — green = nothing to do
   - PR opened (Dependabot or me) → review
   - `[vacation-watchdog]` morning report — RED = open the issue, read the failure, decide
2. **For each PR**:
   - Tap into the PR
   - Files Changed tab → scan diff
   - Checks tab → all green? merge. Any red? skip / comment "fix this when I'm back"
   - Vercel preview URL is in the PR body → tap to verify visually
3. **If something broke overnight**:
   - Read the morning-report issue
   - Worst case: in GitHub Mobile, go to the bad commit → ⋯ → "Revert" → opens a PR → merge it
   - Worse: tap the actions run → use "Re-run failed jobs" to retry (sometimes it's flaky CI)

## Emergency rollback (from your phone)

Vercel auto-deploys every commit to master. If a bad commit landed and is causing problems:

1. **Easiest** (1 tap): GitHub Mobile → repo → Releases or Commits → find the last-known-good commit → ⋯ → Revert. Merge the resulting PR.
2. **Vercel rollback** (no git change): vercel.com → BookDrop project → Deployments → tap the last-known-good deploy → "Promote to Production". Takes ~10s, no commit needed.
3. **Nuclear**: in the Vercel project Settings → Environment Variables → set `VITE_MODE=demo` → save → trigger redeploy. The whole app falls back to demo mode in ~2 min.

## What you should NOT do from phone

- Don't write code (typos compound on small keyboards)
- Don't run migrations (one fat-finger = bad day)
- Don't change Vercel env vars unless rolling back to demo mode
- Don't merge PRs with red CI (even if "looks fine")
- Don't approve Dependabot major-version PRs without reading the changelog

## What to expect during the week

- **Daily**: 1 morning-report (silent if green)
- **Mondays**: 0–5 Dependabot PRs for npm/GitHub-Actions updates (auto-grouped)
- **Otherwise**: silence, unless you dispatch work to me

## Useful URLs (bookmark them)

- Repo: `https://github.com/gainglintgaz/bookdrop`
- Actions: `https://github.com/gainglintgaz/bookdrop/actions`
- Vercel project: `https://vercel.com/<your-team>/bookkeeper-portal`
- Supabase project: `https://supabase.com/dashboard/project/mvvadmlivrpyawmlaqye`
- Live demo: `https://bookkeeper-portal.vercel.app`

## If you want to dispatch work to me from the phone

Either:

**A — Just text/message it to yourself.** Open whatever notes app. Write "ship #5 from VACATION_QUEUE" or "compact CLAUDE.md per audit hit." When you next open Claude Code (any device), paste it. I'll execute.

**B — Optional cloud autonomous (one-time setup before you leave).** Add `ANTHROPIC_API_KEY` to repo secrets (Settings → Secrets and variables → Actions → New repository secret). Then `claude-agent-dispatch.yml` workflow lets you fire-and-forget tasks from GitHub Mobile (Actions tab → "Claude agent dispatch" → Run workflow → enter `task_id=5` → submit). Costs $0.50–2/task in API usage.

## Honest limits

- **No code gets written automatically while you sleep** unless you set up option B above. The daily watchdog only audits + reports.
- **CI is advisory**, not blocking — I haven't flipped doc-hygiene to blocking yet. Merges are your judgment call.
- **Vercel preview deploys** take ~60s after a PR is opened. Tap-refresh if the URL 404s right away.
- **Supabase migrations require an active Claude Code session** — they can't run unattended (no MCP without an active runtime). Don't queue migration tasks while away unless you're ready to run them.
