param(
  [string]$BackupDir = ".\backups"
)

$ErrorActionPreference = 'Stop'

if (-not $env:DATABASE_URL) {
  throw 'DATABASE_URL environment variable is required.'
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$outFile = Join-Path $BackupDir "codynex_os_$timestamp.dump"

pg_dump $env:DATABASE_URL --no-owner --no-acl -Fc -f $outFile
Write-Host "Backup created: $outFile"
