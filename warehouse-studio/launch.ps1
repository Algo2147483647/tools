param(
    [ValidateRange(1, 65535)][int]$Port = 4186,
    [string]$DataFile,
    [switch]$NoBrowser,
    [switch]$BuildOnly,
    [switch]$InstallOnly,
    [switch]$Dev,
    [switch]$Preview
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$warehouseCandidates = @()
$warehousePathNode = Get-Command node -ErrorAction SilentlyContinue
if ($warehousePathNode) { $warehouseCandidates += $warehousePathNode.Source }
$warehouseCandidates += (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
if ($env:ProgramFiles) { $warehouseCandidates += (Join-Path $env:ProgramFiles 'nodejs/node.exe') }
$warehouseNode = $null
foreach ($candidate in $warehouseCandidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    try {
        $warehouseVersion = & $candidate --version
        if ($LASTEXITCODE -eq 0 -and $warehouseVersion -match '^v(\d+)\.' -and [int]$Matches[1] -ge 20) {
            $warehouseNode = $candidate
            break
        }
    } catch { continue }
}
if (-not $warehouseNode) { throw 'Node.js 20+ is required. Install Node.js LTS and run again.' }
if ($InstallOnly) { Write-Host 'Ready. This project has no third-party dependencies.'; exit 0 }
if ($BuildOnly) {
    & $warehouseNode --check server.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $warehouseNode --check public/app.js
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $warehouseNode --test tests/model.test.mjs tests/server.test.mjs tests/history.test.mjs tests/types.test.mjs
    exit $LASTEXITCODE
}
$warehouseArguments = @('server.mjs', '--port', "$Port")
if ($DataFile) { $warehouseArguments += @('--data', $DataFile) }
Write-Host "Warehouse Studio: http://127.0.0.1:$Port"
Write-Host 'Keep this window open. Press Ctrl+C to stop.'
$warehouseUrl = "http://127.0.0.1:$Port"
$warehouseBrowserOpened = $false
& $warehouseNode @warehouseArguments | ForEach-Object {
    Write-Host $_
    # The server prints its URL only after listen succeeds.
    if (-not $NoBrowser -and -not $warehouseBrowserOpened -and $_.Contains($warehouseUrl)) {
        $warehouseBrowserOpened = $true
        try { Start-Process $warehouseUrl -WindowStyle Hidden }
        catch { Write-Warning "Could not open the browser. Open $warehouseUrl manually." }
    }
}
exit $LASTEXITCODE
