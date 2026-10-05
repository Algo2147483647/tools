[CmdletBinding()]
param([switch]$BuildOnly, [switch]$Preview, [switch]$InstallOnly, [switch]$NoBrowser, [switch]$BackendOnly, [switch]$FrontendOnly)
$ErrorActionPreference = 'Stop'
$ownedBackend = $null
$backendDirectory = Join-Path $PSScriptRoot 'backend'
$frontendDirectory = Join-Path $PSScriptRoot 'frontend'
$runtimeDirectory = Join-Path $PSScriptRoot '.runtime'

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE : $Executable $Arguments" }
}
function Get-DependencyHash {
    param([string]$Path)
    $stream = [System.IO.File]::OpenRead($Path)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try { return [System.BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
    finally { $hasher.Dispose(); $stream.Dispose() }
}
function Find-Python {
    $candidates = @()
    $pathPython = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pathPython) { $candidates += $pathPython.Source }
    $candidates += (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')
    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        & $candidate -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>$null
        if ($LASTEXITCODE -eq 0) { return $candidate }
    }
    throw 'Python 3.11+ is required on PATH. Install Python, then reopen the launcher.'
}
try {
    if (($BuildOnly -and $Preview) -or ($InstallOnly -and ($BuildOnly -or $Preview))) { throw 'Choose only one of -BuildOnly, -Preview, or -InstallOnly.' }
    if ($BackendOnly -and $FrontendOnly) { throw 'Choose either -BackendOnly or -FrontendOnly.' }
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    Write-Host 'VECTOR / Dispatch Simulation Platform' -ForegroundColor Green
    if (-not $FrontendOnly) {
        $projectPython = Join-Path $backendDirectory '.venv/Scripts/python.exe'
        if (-not (Test-Path -LiteralPath $projectPython)) { Invoke-Checked (Find-Python) @('-m', 'venv', (Join-Path $backendDirectory '.venv')) }
        & $projectPython -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'
        if ($LASTEXITCODE -ne 0) { throw 'backend/.venv must use Python 3.11+.' }
        $requirementsPath = Join-Path $backendDirectory 'requirements.txt'
        $requirementsHash = Get-DependencyHash $requirementsPath
        $pythonStamp = Join-Path $runtimeDirectory 'python-requirements.sha256'
        $previousPythonHash = if (Test-Path -LiteralPath $pythonStamp) { (Get-Content -LiteralPath $pythonStamp -Raw).Trim() } else { '' }
        & $projectPython -c 'import fastapi, uvicorn, scipy, numpy, pytest, httpx, websockets' 2>$null
        $pythonReady = $LASTEXITCODE -eq 0
        if ($InstallOnly -or -not $pythonReady -or $previousPythonHash -ne $requirementsHash) {
            Invoke-Checked $projectPython @('-m', 'pip', 'install', '-r', $requirementsPath)
            Set-Content -LiteralPath $pythonStamp -Value $requirementsHash -Encoding ASCII
        }
    }
    if (-not $BackendOnly) {
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (-not $nodeCommand -or -not $npmCommand) { throw 'Node.js 22+ and npm are required on PATH.' }
        $nodeVersion = & $nodeCommand.Source --version
        if ($nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw 'Node.js 22+ is required.' }
        $frontendHash = Get-DependencyHash (Join-Path $frontendDirectory 'package-lock.json')
        $nodeStamp = Join-Path $runtimeDirectory 'frontend-package.sha256'
        $previousNodeHash = if (Test-Path -LiteralPath $nodeStamp) { (Get-Content -LiteralPath $nodeStamp -Raw).Trim() } else { '' }
        if ($InstallOnly -or $previousNodeHash -ne $frontendHash -or -not (Test-Path -LiteralPath (Join-Path $frontendDirectory 'node_modules/vite/bin/vite.js'))) {
            Invoke-Checked $npmCommand.Source @('--prefix', $frontendDirectory, 'ci', '--no-audit', '--no-fund')
            Set-Content -LiteralPath $nodeStamp -Value $frontendHash -Encoding ASCII
        }
    }
    if ($InstallOnly) { Write-Host 'Dependencies are ready.' -ForegroundColor Green; exit 0 }
    if ($BuildOnly -or $Preview) {
        if (-not $FrontendOnly) { Invoke-Checked $projectPython @('-m', 'compileall', '-q', (Join-Path $backendDirectory 'app')) }
        if (-not $BackendOnly) { Invoke-Checked $npmCommand.Source @('--prefix', $frontendDirectory, 'run', 'build') }
        if ($BuildOnly) { Write-Host 'Build complete.' -ForegroundColor Green; exit 0 }
    }
    if ($BackendOnly) {
        Write-Host 'Backend: http://127.0.0.1:8000/docs (Ctrl+C to stop)' -ForegroundColor Cyan
        Invoke-Checked $projectPython @('-m', 'uvicorn', 'app.main:app', '--app-dir', $backendDirectory, '--host', '127.0.0.1', '--port', '8000', '--workers', '1')
        exit 0
    }
    if (-not $FrontendOnly) {
        $existingBackend = $null
        try { $existingBackend = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2 } catch { }
        if ($existingBackend -and $existingBackend.service -ne 'vector-backend') { throw 'Port 8000 is occupied by another service.' }
        if (-not $existingBackend) {
            $ownedBackend = Start-Process -FilePath $projectPython -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--workers', '1') -WorkingDirectory $backendDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'backend.stdout.log') -RedirectStandardError (Join-Path $runtimeDirectory 'backend.stderr.log')
            $ready = $false
            for ($attempt = 0; $attempt -lt 40; $attempt++) {
                if ($ownedBackend.HasExited) { throw "Backend exited. See $runtimeDirectory/backend.stderr.log" }
                try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 1; if ($health.service -eq 'vector-backend') { $ready = $true; break } } catch { }
                Start-Sleep -Milliseconds 250
            }
            if (-not $ready) { throw "Backend did not become ready. See $runtimeDirectory/backend.stderr.log" }
        }
    }
    $frontendScript = if ($Preview) { 'preview' } else { 'dev' }
    $frontendArguments = @('--prefix', $frontendDirectory, 'run', $frontendScript)
    if (-not $NoBrowser) { $frontendArguments += @('--', '--open') }
    Write-Host 'Frontend: http://127.0.0.1:4186/ | API: http://127.0.0.1:8000/docs' -ForegroundColor Cyan
    Write-Host 'Ctrl+C stops the frontend and the backend started by this launcher.'
    Invoke-Checked $npmCommand.Source $frontendArguments
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
finally { if ($ownedBackend -and -not $ownedBackend.HasExited) { Stop-Process -Id $ownedBackend.Id -ErrorAction SilentlyContinue } }
