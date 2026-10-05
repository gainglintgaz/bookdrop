# scripts/audit-docs.ps1
# Doc-rot detector. Run weekly + on every CI build.
# Flags MD files that exceed the caps in .claude/rules/doc-hygiene.md.

param([switch]$Quiet)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

# Soft + hard caps per pattern
$caps = @(
  # Exempt: one-off factory harvest artifacts + archives
  @{ Pattern = '^\.claude[/\\]v\d+\.\d+.*-harvest\.md$';                              Soft = 9999; Hard = 9999; Kind = 'exempt-harvest' }
  @{ Pattern = '_ARCHIVE\.md$';                                                       Soft = 9999; Hard = 9999; Kind = 'exempt-archive' }
  # Auto-generated mirrors — fix the source rules instead, don't lint mirrors
  @{ Pattern = '^(AGENTS|GEMINI|\.windsurfrules|PERPLEXITY_SPACE_INSTRUCTIONS)\.md$'; Soft = 9999; Hard = 9999; Kind = 'mirror-skip' }
  # Actual caps
  @{ Pattern = '^\.claude[/\\]rules[/\\].*\.md$';                                     Soft = 200;  Hard = 280;  Kind = 'rule' }
  @{ Pattern = '^CURRENT_SPRINT\.md$';                                                Soft =  80;  Hard = 150;  Kind = 'sprint' }
  @{ Pattern = '^V1_FEATURE_BACKLOG\.md$';                                            Soft = 120;  Hard = 200;  Kind = 'backlog' }
  @{ Pattern = '^scripts[/\\].*\.md$';                                                Soft = 200;  Hard = 300;  Kind = 'runbook' }
  @{ Pattern = '\.md$';                                                                Soft = 150;  Hard = 250;  Kind = 'doc' }
)

function Get-Cap($relPath) {
  foreach ($c in $caps) {
    if ($relPath -match $c.Pattern) { return $c }
  }
  return $caps[-1]
}

# Find every MD in the project (skip node_modules, dist, .git)
$files = Get-ChildItem -Path $root -Recurse -Filter '*.md' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\(node_modules|dist|\.git|\.cursor)\\' }

$findings = @()
foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length + 1) -replace '\\','/'
  $lines = (Get-Content $f.FullName | Measure-Object -Line).Lines
  $cap = Get-Cap $rel
  if ($cap.Kind -match '^(mirror-skip|exempt-)') { continue }
  $status = if ($lines -gt $cap.Hard) { 'HARD' } elseif ($lines -gt $cap.Soft) { 'SOFT' } else { 'OK' }
  if ($status -ne 'OK') {
    $findings += [PSCustomObject]@{
      Status  = $status
      Lines   = $lines
      Soft    = $cap.Soft
      Hard    = $cap.Hard
      Kind    = $cap.Kind
      File    = $rel
    }
  }
}

# Sort by overage descending (worst first)
$findings = $findings | Sort-Object @{Expression={$_.Lines - $_.Soft}; Descending=$true}

# Output
if (-not $Quiet) {
  Write-Host ""
  Write-Host "Doc Hygiene Audit" -ForegroundColor Cyan
  Write-Host "=================" -ForegroundColor Cyan
  Write-Host ""
  if ($findings.Count -eq 0) {
    Write-Host "  All MD files within caps." -ForegroundColor Green
  } else {
    $findings | Format-Table -AutoSize Status, Lines, Soft, Hard, Kind, File
    $hardHits = ($findings | Where-Object { $_.Status -eq 'HARD' }).Count
    $softHits = ($findings | Where-Object { $_.Status -eq 'SOFT' }).Count
    Write-Host ""
    Write-Host "  $hardHits HARD-cap violation(s), $softHits SOFT-cap warning(s)" -ForegroundColor $(if ($hardHits -gt 0) { 'Red' } else { 'Yellow' })
    Write-Host ""
    Write-Host "Compaction guide: .claude/rules/doc-hygiene.md" -ForegroundColor DarkGray
  }
}

# Exit code: 0 = clean, 1 = SOFT only, 2 = at least one HARD violation
if (($findings | Where-Object { $_.Status -eq 'HARD' }).Count -gt 0) { exit 2 }
elseif ($findings.Count -gt 0) { exit 1 }
else { exit 0 }
