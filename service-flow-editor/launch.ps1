param([switch]$Dev, [switch]$Preview, [switch]$InstallOnly, [switch]$BuildOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot '../scripts/node-runtime.ps1')
$atlasNode = Initialize-ToolsProject -ProjectPath $PSScriptRoot
if ($InstallOnly) { Write-Host 'Dependencies are ready.'; exit 0 }
if ($Dev -and -not $BuildOnly) {
    Write-Host 'Service Atlas: http://127.0.0.1:4320/ (Ctrl+C to stop)'
    & $atlasNode scripts/dev.mjs
} else {
    & $atlasNode node_modules/typescript/bin/tsc --noEmit
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $atlasNode node_modules/vite/bin/vite.js build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($BuildOnly) { exit 0 }
    if ($NoBrowser) { & $atlasNode --import tsx server/index.ts }
    else { & $atlasNode --import tsx server/index.ts --open }
}
exit $LASTEXITCODE
