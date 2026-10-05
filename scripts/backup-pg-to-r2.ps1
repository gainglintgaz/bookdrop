# scripts/backup-pg-to-r2.ps1
# Daily off-platform Postgres backup -> Cloudflare R2.
# Runs nightly via Windows Task Scheduler (recommended: 02:00 local time).
#
# Required env vars (set in Windows: setx VAR "value", then restart shell):
#   SUPABASE_DB_URL          full Postgres connection string for the project
#                            (NOT the pooler URL; direct connect for pg_dump)
#                            shape: postgresql://postgres:[pwd]@db.[ref].supabase.co:5432/postgres
#   R2_BUCKET                bucket name (e.g. bookdrop-backups)
#   R2_ACCESS_KEY_ID         Cloudflare R2 access key
#   R2_SECRET_ACCESS_KEY     Cloudflare R2 secret
#   R2_ACCOUNT_ID            Cloudflare account ID
#   BACKUP_LOCAL_DIR         (optional) local staging dir; default $env:TEMP\bookdrop-backups
#
# Required tools:
#   pg_dump      (Postgres client tools — install via PostgreSQL installer or scoop install postgresql)
#   wrangler     (npm i -g wrangler) OR aws-cli configured with R2 endpoint
#
# Retention: 90 days (CPA-grade — set as R2 lifecycle policy on the bucket, NOT in this script).
# This script never deletes from R2; rotation is the bucket's job.
#
# Exit codes:
#   0 success
#   1 missing env var
#   2 pg_dump or wrangler not on PATH
#   3 pg_dump failed
#   4 upload failed
#   5 local cleanup failed (non-fatal but logged)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$logFile = Join-Path $PSScriptRoot 'backups.log'

function Write-Log {
    param([string]$msg, [string]$level = 'INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $level, $msg
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

function Require-Env {
    param([string]$name)
    $val = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($val)) {
        Write-Log "Missing required env var: $name" 'ERROR'
        exit 1
    }
    return $val
}

function Require-Tool {
    param([string]$cmd)
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Log "Required tool not on PATH: $cmd" 'ERROR'
        exit 2
    }
}

# ----- 1. Validate env + tools -----
Write-Log "BookDrop Postgres -> R2 backup starting"

$dbUrl     = Require-Env 'SUPABASE_DB_URL'
$bucket    = Require-Env 'R2_BUCKET'
$r2Key     = Require-Env 'R2_ACCESS_KEY_ID'
$r2Secret  = Require-Env 'R2_SECRET_ACCESS_KEY'
$r2Account = Require-Env 'R2_ACCOUNT_ID'
$localDir  = $env:BACKUP_LOCAL_DIR
if ([string]::IsNullOrWhiteSpace($localDir)) {
    $localDir = Join-Path $env:TEMP 'bookdrop-backups'
}

Require-Tool 'pg_dump'
Require-Tool 'wrangler'   # alternative: 'aws' with R2 endpoint configured

if (-not (Test-Path $localDir)) {
    New-Item -ItemType Directory -Path $localDir -Force | Out-Null
}

# ----- 2. Run pg_dump -----
$timestamp = Get-Date -Format 'yyyy-MM-ddTHHmmss'
$dumpFile  = Join-Path $localDir "bookdrop-$timestamp.dump"

Write-Log "Running pg_dump -> $dumpFile"

# Use --format=custom (compressed binary, supports parallel restore)
# --no-owner / --no-privileges keep dumps portable across projects (required for restore drills on staging projects)
$pgDumpArgs = @(
    '--dbname', $dbUrl,
    '--format=custom',
    '--compress=9',
    '--no-owner',
    '--no-privileges',
    '--file', $dumpFile,
    '--verbose'
)

try {
    $pgDumpOutput = & pg_dump @pgDumpArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Log "pg_dump exited with code $LASTEXITCODE" 'ERROR'
        Write-Log ($pgDumpOutput -join "`n") 'ERROR'
        exit 3
    }
} catch {
    Write-Log "pg_dump threw: $($_.Exception.Message)" 'ERROR'
    exit 3
}

$dumpSizeBytes = (Get-Item $dumpFile).Length
$dumpSizeMb = [math]::Round($dumpSizeBytes / 1MB, 2)
Write-Log "pg_dump complete: $dumpSizeMb MB"

# ----- 3. Upload to R2 -----
$r2Key = "daily/bookdrop-$timestamp.dump"
Write-Log "Uploading to R2 bucket=$bucket key=$r2Key"

# Use wrangler r2 object put (simplest auth — uses CF account login)
# Alternative: aws s3 cp with R2 endpoint:
#   aws s3 cp $dumpFile s3://$bucket/$r2Key --endpoint-url https://$r2Account.r2.cloudflarestorage.com
$wranglerArgs = @(
    'r2', 'object', 'put',
    "$bucket/$r2Key",
    '--file', $dumpFile,
    '--remote'
)

try {
    $uploadOutput = & wrangler @wranglerArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Log "wrangler upload exited with code $LASTEXITCODE" 'ERROR'
        Write-Log ($uploadOutput -join "`n") 'ERROR'
        exit 4
    }
} catch {
    Write-Log "wrangler upload threw: $($_.Exception.Message)" 'ERROR'
    exit 4
}

Write-Log "Upload OK: $bucket/$r2Key ($dumpSizeMb MB)"

# ----- 4. Local cleanup (best-effort) -----
try {
    Remove-Item $dumpFile -Force
    Write-Log "Local dump removed"
} catch {
    Write-Log "Local cleanup failed (non-fatal): $($_.Exception.Message)" 'WARN'
    # don't exit 5 here — backup succeeded, only cleanup failed
}

Write-Log "Backup completed successfully"
exit 0
