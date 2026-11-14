param(
    [ValidateRange(0, 65535)][int]$Port = 0,
    [switch]$Browser,
    [switch]$NoBrowser,
    [switch]$BuildOnly,
    [switch]$InstallOnly,
    [switch]$Dev,
    [switch]$Preview
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$studioPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (Test-Path -LiteralPath $studioPython) {
    & $studioPython -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>$null
    if ($LASTEXITCODE -ne 0) {
        # Preserve a stale environment instead of deleting it.
        Move-Item -LiteralPath (Join-Path $PSScriptRoot '.venv') -Destination (Join-Path $PSScriptRoot ('.venv-backup-' + [guid]::NewGuid().ToString('N')))
    }
}
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
$studioRequirementsHash = ((Get-FileHash -LiteralPath 'requirements.txt','requirements-desktop.txt' -Algorithm SHA256).Hash -join ':')
$studioStamp = Join-Path $PSScriptRoot '.venv/requirements.sha256'
$studioInstalledHash = if (Test-Path -LiteralPath $studioStamp) { (Get-Content -LiteralPath $studioStamp -Raw).Trim() } else { '' }
if ($InstallOnly -or $studioRequirementsHash -ne $studioInstalledHash) {
    & $studioPython -m pip install --no-cache-dir -r requirements-desktop.txt
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
if ($Browser -or $NoBrowser) {
    if ($Port -eq 0) { $Port = 4189 }
    $studioArguments = @('-u', 'server.py', '--port', "$Port")
    if (-not $NoBrowser) { $studioArguments += '--open-browser' }
} else {
    $studioArguments = @('-u', 'desktop.py', '--port', "$Port")
    if ($Dev) { $studioArguments += '--debug' }
}
if ($Preview) { $studioArguments += '--dist' }
& $studioPython @studioArguments
exit $LASTEXITCODE
