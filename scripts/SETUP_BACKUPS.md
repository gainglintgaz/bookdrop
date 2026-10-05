# R2 Backup Pipeline — One-Page Setup Runbook

> **Goal:** daily 02:00 local-time `pg_dump → Cloudflare R2` running automatically, with first restore drill scheduled within 30 days.
>
> **Time required:** ~30-40 min total.
>
> **Prerequisite:** Block 1 complete — migrations 001-004 applied to live Supabase, schema verified.

---

## Step 1 — Create Cloudflare R2 bucket (~10 min)

1. **Sign up / sign in** at https://dash.cloudflare.com
2. Left sidebar → **R2** → **Overview**
   - First time only: enable R2 (requires a payment method, but the free tier covers 10GB storage + 1M Class A ops/month — BookDrop won't approach those limits for years)
3. **Create bucket**:
   - Name: `bookdrop-backups`
   - Location: closest to you (US West for west-coast US, etc.)
4. **Click into the bucket** → **Settings** tab → **Object lifecycle rules**:
   - **Add rule**:
     - Name: `daily-90-day-retention`
     - Apply to objects with prefix: `daily/`
     - **Delete after**: `90 days`
     - Save
   - This is CPA-grade retention per `scripts/RESTORE_DRILL.md` §11. Retains 3 months of daily dumps.
5. **API Tokens** (left sidebar → R2 → "Manage R2 API Tokens"):
   - Click **Create API Token**
   - Name: `bookdrop-backup-uploader`
   - Permissions: **Object Read & Write**
   - Specify bucket: `bookdrop-backups` (limit scope — never grant org-wide write)
   - TTL: leave blank for non-expiring (or set 1y for rotation discipline)
   - Click **Create API Token**
   - **Copy the three values** immediately (Cloudflare shows them once):
     - `R2_ACCESS_KEY_ID`
     - `R2_SECRET_ACCESS_KEY`
     - `R2_ACCOUNT_ID` (visible at the top of the R2 dashboard)

---

## Step 2 — Install Wrangler + login (~5 min)

1. Open **PowerShell** as your normal user (not admin).
2. Install Wrangler globally:
   ```powershell
   npm install -g wrangler
   ```
3. Verify:
   ```powershell
   wrangler --version
   ```
   Should print a version like `4.x.x`.
4. Log in (browser opens):
   ```powershell
   wrangler login
   ```
   Approve the browser prompt. Wrangler stores the token in `~/.wrangler/config/`.

---

## Step 3 — Install pg_dump (~5 min)

`pg_dump` ships with the PostgreSQL command-line tools.

**Option A — Install via Scoop (cleanest)**:
```powershell
scoop install postgresql
```

**Option B — Install via official installer**:
- Download from https://www.postgresql.org/download/windows/
- During install, choose "Command Line Tools" only (not the server)

**Verify**:
```powershell
pg_dump --version
```
Should print `pg_dump (PostgreSQL) 16.x` or similar.

---

## Step 4 — Set Windows env vars (~5 min)

Open **System Properties → Advanced → Environment Variables → User variables → New** for each:

| Variable | Value | Where to find it |
|---|---|---|
| `SUPABASE_DB_URL` | Full Postgres connection string | Supabase dashboard → Settings → Database → **Connection string → Direct connection** (NOT Pooler) — toggle "URI" view, then check "Display password" so the URL contains your DB password |
| `R2_BUCKET` | `bookdrop-backups` | Just the literal string |
| `R2_ACCESS_KEY_ID` | from Step 1.5 | Your R2 token |
| `R2_SECRET_ACCESS_KEY` | from Step 1.5 | Your R2 token |
| `R2_ACCOUNT_ID` | from Step 1.5 | Top of Cloudflare R2 dashboard |

> ⚠️ **Critical: use the DIRECT connection URL, not the pooler.** `pg_dump` doesn't work through PgBouncer. The direct URL has the shape `postgresql://postgres:[pwd]@db.<ref>.supabase.co:5432/postgres`. The pooler is `aws-0-<region>.pooler.supabase.com:6543` — that one will fail.

After setting, **close and reopen** PowerShell so the new env vars are loaded.

Verify:
```powershell
echo $env:SUPABASE_DB_URL
echo $env:R2_BUCKET
```
Both should print non-empty values.

---

## Step 5 — Run the backup manually once (~3 min)

```powershell
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal
pwsh -File scripts\backup-pg-to-r2.ps1
```

Expected output:
```
[2026-05-06 12:34:56] [INFO] BookDrop Postgres -> R2 backup starting
[2026-05-06 12:34:56] [INFO] Running pg_dump -> ...\bookdrop-2026-05-06T123456.dump
[2026-05-06 12:35:10] [INFO] pg_dump complete: 0.24 MB
[2026-05-06 12:35:10] [INFO] Uploading to R2 bucket=bookdrop-backups key=daily/bookdrop-2026-05-06T123456.dump
[2026-05-06 12:35:14] [INFO] Upload OK: bookdrop-backups/daily/bookdrop-2026-05-06T123456.dump (0.24 MB)
[2026-05-06 12:35:14] [INFO] Local dump removed
[2026-05-06 12:35:14] [INFO] Backup completed successfully
```

**Verify in Cloudflare R2 dashboard**:
- Open bucket `bookdrop-backups`
- Should see `daily/` folder with the new dump file
- File size should match the script's reported size

**If the script fails**:
- Exit code 1 (missing env var): re-check Step 4
- Exit code 2 (missing tool): re-check Steps 2 + 3
- Exit code 3 (pg_dump failed): typically the pooler URL was used — switch to direct connect
- Exit code 4 (upload failed): typically `wrangler login` expired — re-run

---

## Step 6 — Schedule the daily backup (~5 min)

1. Open **Task Scheduler** (Win+R → `taskschd.msc`)
2. **Create Task** (NOT "Create Basic Task" — we need full options)
   - **General tab**:
     - Name: `BookDrop Daily Backup`
     - Description: `Daily pg_dump of Supabase to Cloudflare R2`
     - Security options: select "Run whether user is logged on or not" + "Do not store password" + "Run with highest privileges"
     - Configure for: Windows 10
   - **Triggers tab → New**:
     - Begin: `On a schedule`
     - Daily, 02:00 AM
     - Recur every 1 day
     - Enabled
   - **Actions tab → New**:
     - Action: `Start a program`
     - Program/script: `pwsh.exe`
     - Add arguments: `-NoProfile -ExecutionPolicy Bypass -File "C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal\scripts\backup-pg-to-r2.ps1"`
     - Start in: `C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal`
   - **Conditions tab**:
     - Uncheck "Start the task only if the computer is on AC power" (otherwise laptops on battery skip it)
     - Optionally: "Wake the computer to run this task" if you want it to fire even if asleep
   - **Settings tab**:
     - Check "Allow task to be run on demand"
     - "If task fails, restart every": 30 minutes, max 3 attempts
3. Save (you may be prompted for your Windows password)
4. **Test**: right-click the task → **Run** → check `backups.log` and R2 bucket for a new entry within 1 minute

---

## Step 7 — Schedule first restore drill (~2 min)

The drill is the actual proof the backup works. Don't skip.

1. Open your calendar (Google Cal, Outlook, etc.)
2. Add an event for **30 days from today**:
   - Title: `BookDrop Restore Drill #1`
   - Description: `Read scripts/RESTORE_DRILL.md and execute steps 1-8. Log result.`
   - Reminder: 1 day before
3. **Read** `scripts/RESTORE_DRILL.md` once now so you know what to expect on drill day

---

## Done — verification checklist

After all 7 steps:

- [ ] Cloudflare R2 bucket `bookdrop-backups` exists with 90-day retention on `daily/`
- [ ] Wrangler installed + logged in
- [ ] pg_dump installed + on PATH
- [ ] 5 env vars set in Windows User variables
- [ ] Manual run: `daily/bookdrop-*.dump` exists in R2; `backups.log` has success line
- [ ] Task Scheduler entry created + manually verified
- [ ] Calendar entry for restore drill #1 placed at day 30

If all 7 are checked, Block 2 is done.

---

## What ongoing maintenance looks like

- **Weekly (15 sec)**: glance at the most recent line of `backups.log` to confirm yesterday's run succeeded.
- **Monthly (30 sec)**: open R2 bucket, eyeball that the daily/ prefix has ~30 dump files (older ones auto-deleted by lifecycle rule).
- **Quarterly (1 hr)**: execute restore drill per `scripts/RESTORE_DRILL.md`, log the result.
- **Annually (5 min)**: rotate `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` (Cloudflare dashboard → R2 → API Tokens → Roll). Update Windows env vars after rotation.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `[ERROR] Missing required env var: SUPABASE_DB_URL` | Env var not set or PowerShell not restarted | Step 4 — close and reopen PowerShell after setting env vars |
| `[ERROR] Required tool not on PATH: pg_dump` | PostgreSQL tools not installed or not in PATH | Step 3 — verify with `pg_dump --version` |
| `[ERROR] pg_dump exited with code 1` | Pooler URL used instead of direct connect | Re-copy connection string from Supabase, ensure it's the **Direct connection** (port 5432) |
| `[ERROR] wrangler upload exited with code 1` | Wrangler not logged in or token expired | Re-run `wrangler login` |
| Task Scheduler shows "Last Run Result: 0x1" | The PS1 script returned a non-zero exit | Open `backups.log`, find the most recent error line, troubleshoot per other rows in this table |
| Task fires but no log entry | Task ran as wrong user (env vars not loaded) | In Task Scheduler → General tab, ensure user is your normal Windows user (not SYSTEM); env vars must be User variables for that user |
| R2 bucket fills up faster than expected | Retention rule misconfigured | Check Step 1.4 — lifecycle rule must apply to `daily/` prefix specifically |
