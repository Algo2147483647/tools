param([switch]$Dev, [switch]$Preview, [switch]$NoBrowser, [switch]$BuildOnly, [switch]$InstallOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot '../scripts/node-runtime.ps1')
$dashboardNode = Initialize-ToolsProject -ProjectPath $PSScriptRoot
if ($InstallOnly) { exit 0 }
if ($Preview -or $BuildOnly) {
    & $dashboardNode node_modules/next/dist/bin/next build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($BuildOnly) { exit 0 }
    $dashboardMode = 'start'
} else { $dashboardMode = 'dev' }
Write-Host 'Asset Dashboard: http://127.0.0.1:3000/ (Ctrl+C to stop)'
& $dashboardNode node_modules/next/dist/bin/next $dashboardMode --hostname 127.0.0.1 --port 3000
exit $LASTEXITCODE
