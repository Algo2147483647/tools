[CmdletBinding()]
param(
    [switch]$BuildOnly,
    [switch]$Preview,
    [switch]$NoBrowser,
    [switch]$InstallOnly
)

$ErrorActionPreference = 'Stop'

try {
    if (($BuildOnly -and $Preview) -or ($InstallOnly -and ($BuildOnly -or $Preview))) {
        throw 'Choose only one of -BuildOnly, -Preview, or -InstallOnly.'
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not $npmCommand) {
        throw 'Node.js 22 or newer and npm are required on PATH. Install Node.js, then reopen the launcher.'
    }

    $nodeVersion = & $nodeCommand.Source --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') {
        throw 'Unable to read the Node.js version.'
    }
    if ([int]$Matches[1] -lt 22) {
        throw "Node.js 22 or newer is required. Found $nodeVersion."
    }

    Push-Location -LiteralPath $PSScriptRoot
    try {
        Write-Host ''
        Write-Host 'VECTOR / Ride Dispatch Simulator' -ForegroundColor Green
        Write-Host "Using Node.js $nodeVersion"

        $viteEntry = Join-Path $PSScriptRoot 'node_modules/vite/bin/vite.js'
        $typescriptEntry = Join-Path $PSScriptRoot 'node_modules/typescript/bin/tsc'
        if ($InstallOnly -or -not (Test-Path -LiteralPath $viteEntry) -or -not (Test-Path -LiteralPath $typescriptEntry)) {
            Write-Host 'Installing project dependencies...'
            if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'package-lock.json')) {
                & $npmCommand.Source ci
            } else {
                & $npmCommand.Source install
            }
            if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed (exit $LASTEXITCODE)." }
        }

        if ($InstallOnly) {
            Write-Host 'Dependencies are ready.' -ForegroundColor Green
        } else {
            if ($BuildOnly -or $Preview) {
                Write-Host 'Building the production application...'
                & $npmCommand.Source run build
                if ($LASTEXITCODE -ne 0) { throw "Production build failed (exit $LASTEXITCODE)." }
            }

            if ($BuildOnly) {
                Write-Host 'Build complete. Production files are in dist/.' -ForegroundColor Green
            } else {
                $runScript = if ($Preview) { 'preview' } else { 'dev' }
                $npmArguments = @('run', $runScript)
                if (-not $NoBrowser) { $npmArguments += @('--', '--open') }
                Write-Host 'Opening http://127.0.0.1:4186/' -ForegroundColor Cyan
                Write-Host 'Keep this terminal open. Press Ctrl+C to stop the server.'
                & $npmCommand.Source @npmArguments
                if ($LASTEXITCODE -ne 0) { throw "The server stopped with exit code $LASTEXITCODE. Check whether port 4186 is already in use." }
            }
        }
    } finally {
        Pop-Location
    }
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
