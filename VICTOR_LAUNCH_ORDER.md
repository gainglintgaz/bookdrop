# Victor Launch Order — Vercel + R2 only

> **One page. Clicks only. No code.**  
> Full product launch still needs Resend + Stripe later — this page is **only** “live app mode” + “database backups.”  
> **Do not paste secrets into chat or git.**

---

## A. Vercel → real cloud app (~15–25 min)

### A1. Open the right project
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Open project **bookkeeper-portal** (or your BookDrop Vercel project name)
3. **Settings → Environment Variables**
4. Scope: set for **Production** first (Preview optional later)

### A2. Set these **before** flipping mode

| Variable | Where the value comes from | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Browser-safe |
| `VITE_SUPABASE_ANON_KEY` | Same page → `anon` `public` key | Browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → `service_role` **secret** | **Server only** — never `VITE_` |
| `PUBLIC_APP_URL` | Your live URL, e.g. `https://bookkeeper-portal.vercel.app` | Used by emails later |

Optional until email/pay (skip for this page): `RESEND_*`, `STRIPE_*`, `CRON_SECRET`.

### A3. Redeploy once (still demo-safe)
1. **Deployments** → ⋯ on latest → **Redeploy**  
   Or push a commit; wait until status **Ready**.
2. Open the production URL in a normal window — still fine if demo banner shows.

### A4. Flip cloud **last**
1. Environment Variables → add/edit:

| Variable | Value |
|---|---|
| `VITE_MODE` | `cloud` |

2. **Redeploy again** (required — `VITE_` is baked at **build** time).

### A5. Prove it worked (2 min)
Open production URL in **Incognito**:

| Check | Pass if |
|---|---|
| Demo banner | **Gone** (if still there, redeploy failed or var not Production) |
| Signup | Creates a real row in Supabase `bookkeepers` |
| Add client | Row in `clients` with `portal_token` |
| Portal upload | `/upload/<token>` stores file + `document_uploads` row |

If signup fails: wrong URL/anon key, or RLS/migrations — check Vercel Function logs + Supabase.

### A6. Local cloud test (optional)
In repo root **`.env.local`** only (gitignored):

```
VITE_MODE=cloud
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Then `npm run dev` → http://localhost:… in Incognito.

---

## B. R2 off-platform DB backups (~30–40 min)

Goal: nightly Postgres dump **outside** Supabase. Script: `scripts/backup-pg-to-r2.ps1`. Details: `scripts/SETUP_BACKUPS.md`.

### B1. Cloudflare R2 bucket
1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2**
2. Enable R2 if first time (card may be required; free tier is enough for V1 dumps)
3. **Create bucket**: name `bookdrop-backups`
4. Bucket → **Settings → Object lifecycle**:
   - Prefix `daily/`
   - Delete after **90 days**

### B2. R2 API token
1. R2 → **Manage R2 API Tokens** → Create  
2. Permission: **Object Read & Write**  
3. Limit to bucket `bookdrop-backups`  
4. Copy once (store in password manager):

| Name you will set on PC |
|---|
| `R2_ACCESS_KEY_ID` |
| `R2_SECRET_ACCESS_KEY` |
| `R2_ACCOUNT_ID` (R2 overview header) |

### B3. Tools on your Windows PC
```powershell
npm install -g wrangler
wrangler login
# pg_dump — e.g. scoop install postgresql  OR PostgreSQL "command line tools" installer
pg_dump --version
wrangler --version
```

### B4. Windows **User** environment variables
System Properties → Environment Variables → **User** → New:

| Variable | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Database → **Connection string → Direct** URI with password (`db.<ref>.supabase.co:5432`) — **not** the pooler `:6543` |
| `R2_BUCKET` | `bookdrop-backups` |
| `R2_ACCESS_KEY_ID` | from B2 |
| `R2_SECRET_ACCESS_KEY` | from B2 |
| `R2_ACCOUNT_ID` | from B2 |

Close and reopen PowerShell. Check presence only:

```powershell
[bool]$env:SUPABASE_DB_URL
[bool]$env:R2_ACCESS_KEY_ID
```

### B5. First backup (manual)
```powershell
cd C:\Users\vtbsj\.gemini\antigravity\scratch\bookdrop-work-20260711
# or main: ...\bookkeeper-portal
pwsh -File scripts\backup-pg-to-r2.ps1
```

Pass if Cloudflare R2 shows object under `daily/bookdrop-....dump`.

### B6. Schedule daily 02:00
Windows **Task Scheduler**:
- Trigger: Daily 2:00 AM  
- Action: `pwsh -File "C:\Users\vtbsj\.gemini\antigravity\scratch\bookkeeper-portal\scripts\backup-pg-to-r2.ps1"`  
  (use the path you actually keep as the long-lived repo)

### B7. Restore drill (calendar)
Within 30 days: follow `scripts/RESTORE_DRILL.md` (restore dump to a **throwaway** Supabase project — not production wipe).

---

## Order if doing both today

```text
1. A2 Supabase vars on Vercel (no VITE_MODE yet)
2. A3 Redeploy
3. B1–B5 R2 first dump (sleep well)
4. A4 VITE_MODE=cloud + redeploy
5. A5 Incognito smoke
6. B6 Task Scheduler
```

Resend / Stripe: **not on this page** — after A5 when you want real email and paid plans.

---

## Done when

- [ ] Production runs with real Supabase (no demo banner)
- [ ] At least one successful R2 `daily/` dump
- [ ] Daily schedule set
- [ ] Restore drill date on calendar
