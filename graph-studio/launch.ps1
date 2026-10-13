param([switch]$Dev, [switch]$Preview, [switch]$InstallOnly, [switch]$BuildOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

. (Join-Path $PSScriptRoot 'scripts/node-runtime.ps1')
$graphNode = Initialize-GraphStudio -ProjectPath $PSScriptRoot
if ($InstallOnly) { exit 0 }
if ($BuildOnly -or $Preview) {
    & $graphNode node_modules/typescript/bin/tsc --noEmit
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $graphNode node_modules/vite/bin/vite.js build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($BuildOnly) { exit 0 }
}

$graphArgs = @('node_modules/vite/bin/vite.js')
if ($Preview) { $graphArgs += 'preview' }
$graphArgs += @('--host', '127.0.0.1')
if (-not $NoBrowser) { $graphArgs += '--open' }
Write-Host 'Starting Graph Studio. Keep this window open. Press Ctrl+C to stop.'
& $graphNode @graphArgs
exit $LASTEXITCODE
