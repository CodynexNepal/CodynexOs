param(
  [switch]$SkipDashboardBuild
)

$ErrorActionPreference = 'Stop'

Write-Host '=== CodyNex OS Backend Checks ==='
Push-Location (Join-Path $PSScriptRoot '..')
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
Pop-Location

Write-Host '=== CodyNex OS Dashboard Checks ==='
Push-Location (Join-Path $PSScriptRoot '..\..\dashboard')
npm run typecheck
npm run lint
if (-not $SkipDashboardBuild) {
  npm run build
}
Pop-Location

Write-Host 'All CodyNex OS verification checks passed.'
