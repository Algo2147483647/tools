param(
    [ValidateRange(1, 65535)][int]$Port = 4189,
    [switch]$NoBrowser,
    [switch]$BuildOnly,
    [switch]$InstallOnly,
    [switch]$Dev,
    [switch]$Preview
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$studioCandidates = @()
$studioPathNode = Get-Command node -ErrorAction SilentlyContinue
if ($studioPathNode) { $studioCandidates += $studioPathNode.Source }
$studioCandidates += (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
if ($env:ProgramFiles) { $studioCandidates += (Join-Path $env:ProgramFiles 'nodejs/node.exe') }
$studioNode = $null
foreach ($candidate in $studioCandidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    try {
        $studioVersion = & $candidate --version
        if ($LASTEXITCODE -eq 0 -and $studioVersion -match '^v(\d+)\.' -and [int]$Matches[1] -ge 20) {
            $studioNode = $candidate
            break
        }
    } catch { continue }
}
if (-not $studioNode) { throw 'Node.js 20+ is required. Install Node.js LTS and run again.' }
if ($InstallOnly) { Write-Host 'Runtime is ready. No runtime dependencies are required.'; exit 0 }
if ($BuildOnly -or $Preview) {
    & $studioNode scripts/check.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $studioNode scripts/build.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($BuildOnly) { exit 0 }
}
$studioArguments = @('server.mjs', '--port', "$Port")
if ($Preview) { $studioArguments += '--dist' }
$studioUrl = "http://127.0.0.1:$Port/"
$studioBrowserOpened = $false
& $studioNode @studioArguments | ForEach-Object {
    Write-Host $_
    if (-not $NoBrowser -and -not $studioBrowserOpened -and $_.Contains($studioUrl)) {
        $studioBrowserOpened = $true
        try { Start-Process $studioUrl -WindowStyle Hidden }
        catch { Write-Warning "Could not open the browser. Open $studioUrl manually." }
    }
}
exit $LASTEXITCODE
