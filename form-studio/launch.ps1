param([switch]$Dev, [switch]$Preview, [switch]$NoBrowser, [switch]$BuildOnly, [switch]$InstallOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot '../scripts/node-runtime.ps1')
$studioNode = Initialize-ToolsProject -ProjectPath $PSScriptRoot
if ($InstallOnly) { exit 0 }
if ($Dev -and -not $BuildOnly) {
    $studioArgs = @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1')
} else {
    & $studioNode node_modules/typescript/bin/tsc -b
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $studioNode node_modules/vite/bin/vite.js build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($BuildOnly) { exit 0 }
    $studioArgs = @('node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort')
}
if (-not $NoBrowser) { $studioArgs += '--open' }
Write-Host 'Form Studio is starting. Keep this window open; press Ctrl+C to stop.'
& $studioNode @studioArgs
exit $LASTEXITCODE
