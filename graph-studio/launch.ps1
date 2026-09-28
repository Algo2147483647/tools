param([switch]$InstallOnly, [switch]$BuildOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

. (Join-Path $PSScriptRoot '../scripts/node-runtime.ps1')
$graphNode = Initialize-ToolsProject -ProjectPath $PSScriptRoot
if ($InstallOnly) { exit 0 }
if ($BuildOnly) {
    & $graphNode node_modules/typescript/bin/tsc --noEmit
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $graphNode node_modules/vite/bin/vite.js build
    exit $LASTEXITCODE
}

$graphArgs = @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1')
if (-not $NoBrowser) { $graphArgs += '--open' }
Write-Host 'Starting DAG Studio. Keep this window open. Press Ctrl+C to stop.'
& $graphNode @graphArgs
exit $LASTEXITCODE
