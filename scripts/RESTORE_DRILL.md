# Restore Drill — How to Verify the BookDrop Backup Pipeline Works

> **Why this document matters:** an off-platform backup that has never been restored is hope, not a backup. CPAs cannot afford a database outage; "we have backups" is meaningless until you've proved you can restore from them.
>
> Run the **first quarterly drill within 30 days of going live**. Quarterly thereafter. Document each drill at the bottom of this file with date, outcome, and lessons.

---

## Prerequisites

You need:

1. **An R2 bucket** with at least one daily backup uploaded by `scripts/backup-pg-to-r2.ps1`
2. **Wrangler CLI** logged into your Cloudflare account (`wrangler login`)
3. **A staging Postgres project** to restore INTO (NEVER restore over your production database during a drill — create a fresh disposable project)
4. **`pg_restore`** on PATH (comes with PostgreSQL client tools)
5. **`psql`** for verification queries

---

## Setup checklist (do this once before the first drill)

- [ ] Cloudflare R2 bucket created (e.g. `bookdrop-backups`)
- [ ] R2 API token created with read+write on the bucket
- [ ] Bucket lifecycle rule: `daily/` prefix expires after 90 days
- [ ] Env vars set on the backup machine: `SUPABASE_DB_URL`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`
- [ ] `pg_dump` and `wrangler` on PATH on the backup machine
- [ ] Windows Task Scheduler entry: daily 02:00 → `pwsh -File C:\path\to\scripts\backup-pg-to-r2.ps1`
- [ ] After 24h, verify `backups.log` shows at least one successful run AND R2 bucket contains the file
- [ ] Add a calendar reminder: first drill within 30 days of going live

---

## The drill — step by step

### 1. List recent backups in R2

```powershell
wrangler r2 object list bookdrop-backups --prefix daily/ | Sort-Object Key -Descending | Select-Object -First 5
```

Pick one — usually the most recent. Note the key (e.g. `daily/bookdrop-2026-05-05T020000.dump`).

### 2. Download the backup locally

```powershell
$key = 'daily/bookdrop-2026-05-05T020000.dump'
$local = "C:\temp\bookdrop-restore-test.dump"
wrangler r2 object get "bookdrop-backups/$key" --file $local
```

Check file size matches what `backups.log` recorded for that night. If it differs, the upload was corrupted — STOP and investigate.

### 3. Spin up a disposable staging Postgres

Create a fresh Supabase project (or local Postgres) for the drill. **Never use production.** Note its connection string as `STAGING_DB_URL`.

If using Supabase: create a new project in a different organization or under the Free tier; delete it when the drill is done.

### 4. Run pg_restore

```powershell
$ENV:STAGING_DB_URL = "postgresql://postgres:[pwd]@db.[ref].supabase.co:5432/postgres"

pg_restore `
  --dbname=$ENV:STAGING_DB_URL `
  --no-owner `
  --no-privileges `
  --clean `
  --if-exists `
  --verbose `
  $local
```

Expected: hundreds of `RESTORE` lines, no `ERROR` lines. If you see errors, log them — common causes are extension mismatches between source and staging projects.

### 5. Verify the restore matches expectations

Connect to staging with psql and run sanity queries:

```sql
-- Table list — should match production schema
\dt public.*

-- Row counts per table — should be plausible (within ~24h of production)
SELECT 'bookkeepers' AS t, count(*) FROM bookkeepers
UNION ALL SELECT 'clients', count(*) FROM clients
UNION ALL SELECT 'document_requirements', count(*) FROM document_requirements
UNION ALL SELECT 'document_uploads', count(*) FROM document_uploads
UNION ALL SELECT 'reminder_log', count(*) FROM reminder_log
UNION ALL SELECT 'engagement_letters', count(*) FROM engagement_letters
ORDER BY t;

-- Spot-check the most recent rows — pick a known recent client/upload from production
-- and verify it landed in the restore. If it's missing, the backup is older than expected.
SELECT id, business_name, contact_email, created_at
FROM clients
ORDER BY created_at DESC
LIMIT 5;

-- RLS check — policies must restore correctly
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
```

### 6. Smoke-test reads as a sample user

```sql
-- Set role to a real bookkeeper id from the restore (not `postgres`)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"[bookkeeper-uuid-here]","role":"authenticated"}';

-- This should return only that bookkeeper's clients
SELECT id, business_name FROM clients;

-- Reset
RESET ROLE;
```

If RLS is broken in the restore, the backup file is missing policies — pg_dump format may need adjustment.

### 7. Tear down the staging project

```powershell
# Delete the Supabase staging project from the dashboard (don't keep paying for it)
# Delete the local dump file
Remove-Item $local -Force
```

### 8. Document the drill outcome below.

---

## Drill log

| Date | Drill # | Backup tested | Restore time | Result | Lessons / errors |
|---|---|---|---|---|---|
| YYYY-MM-DD | 1 | daily/bookdrop-…dump | N min | ✅ / ❌ | … |

---

## Common failure modes (from FinKeel's setup, recorded so BookDrop doesn't rediscover)

| Symptom | Likely cause | Fix |
|---|---|---|
| `pg_dump: error: connection to server failed` | Using the connection-pooler URL instead of direct connect | Switch `SUPABASE_DB_URL` to the direct-connect URL (port 5432, not the pooler) |
| `pg_restore: error: could not execute query: ERROR: extension "pg_net" does not exist` | Source DB has extensions that staging doesn't | Pre-create the missing extensions on staging before restore: `CREATE EXTENSION IF NOT EXISTS pg_net;` |
| `pg_restore: warning: errors ignored on restore: 47` | `--no-owner` / `--no-privileges` flags weren't used during dump | Adjust `backup-pg-to-r2.ps1` to use both flags consistently |
| R2 object size differs from local | Upload was interrupted | Check `backups.log` — if upload exit code was nonzero, the file is corrupt; re-upload from a fresh dump |
| RLS policies missing after restore | pg_dump didn't include them | Check `--section=post-data` was included in the dump (custom format includes by default) |
| Backup file exists but is 0 bytes | pg_dump failed silently due to bad credentials | Verify `SUPABASE_DB_URL` works manually first: `psql $SUPABASE_DB_URL -c '\dt'` |
| **"Drill never run"** | Calendar slipped, no urgency | THIS IS THE FAILURE MODE TO AVOID. Until you've completed drill #1, the backup pipeline is unproven. Schedule it on day 30 of going live; do not skip. |

---

## Cadence

- **Drill #1**: within 30 days of going live
- **Drill #2**: 90 days after drill #1
- **Drill #3+**: quarterly, on a calendar-locked recurring date
- **After any schema migration that adds extensions or non-standard types**: extra ad-hoc drill within 7 days

If a drill fails, that's a CRITICAL incident. Document the failure, fix the pipeline, re-drill. Do not consider the issue closed until a successful drill has been logged.

---

## Why 90-day retention (vs FinKeel's 7-day)

CPAs deal with retrospective questions — "what did this client's books look like in February?" — weeks or months later. 7-day rotation isn't enough. 90 days is the CPA-grade minimum.

Set this as an R2 bucket lifecycle policy on the `daily/` prefix, NOT in the script. The bucket is the source of truth for retention; the script's job is just to upload.
