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
$studioPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $studioPython)) {
    $studioCandidates = @()
    $studioPy = Get-Command py -ErrorAction SilentlyContinue
    if ($studioPy) {
        $studioDiscovered = & $studioPy.Source -3 -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0) { $studioCandidates += $studioDiscovered }
    }
    $studioPathPython = Get-Command python -ErrorAction SilentlyContinue
    if ($studioPathPython) { $studioCandidates += $studioPathPython.Source }
    $studioCandidates += (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')
    $studioBasePython = $null
    foreach ($studioCandidate in $studioCandidates) {
        if (-not (Test-Path -LiteralPath $studioCandidate -PathType Leaf)) { continue }
        & $studioCandidate -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>$null
        if ($LASTEXITCODE -eq 0) { $studioBasePython = $studioCandidate; break }
    }
    if (-not $studioBasePython) { throw 'Python 3.10+ is required. Install Python and run again.' }
    & $studioBasePython -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the project Python environment.' }
}
$studioRequirementsHash = (Get-FileHash -LiteralPath 'requirements.txt' -Algorithm SHA256).Hash
$studioStamp = Join-Path $PSScriptRoot '.venv/requirements.sha256'
$studioInstalledHash = if (Test-Path -LiteralPath $studioStamp) { (Get-Content -LiteralPath $studioStamp -Raw).Trim() } else { '' }
if ($InstallOnly -or $studioRequirementsHash -ne $studioInstalledHash) {
    & $studioPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python dependencies could not be installed.' }
    Set-Content -LiteralPath $studioStamp -Value $studioRequirementsHash -Encoding ascii
}
if ($InstallOnly) { Write-Host 'Python engine and dependencies are ready.'; exit 0 }
if ($BuildOnly -or $Preview) {
    & $studioPython scripts/manage.py check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $studioPython scripts/manage.py build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($BuildOnly) { exit 0 }
}
$studioArguments = @('-u', 'server.py', '--port', "$Port")
if ($Preview) { $studioArguments += '--dist' }
$studioUrl = "http://127.0.0.1:$Port/"
$studioBrowserOpened = $false
& $studioPython @studioArguments | ForEach-Object {
    Write-Host $_
    if (-not $NoBrowser -and -not $studioBrowserOpened -and $_.Contains($studioUrl)) {
        $studioBrowserOpened = $true
        try { Start-Process $studioUrl -WindowStyle Hidden }
        catch { Write-Warning "Open $studioUrl in your browser." }
    }
}
exit $LASTEXITCODE
