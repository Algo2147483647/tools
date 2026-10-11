[CmdletBinding()]
param(
    [switch]$Dev,
    [switch]$Preview,
    [switch]$NoBrowser,
    [switch]$BuildOnly,
    [switch]$InstallOnly,
    [ValidateRange(1, 65535)][int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$dashboardExitCode = 1
$dashboardBrowserHelper = $null
$dashboardOriginalPath = $env:PATH
Push-Location -LiteralPath $PSScriptRoot

try {
    $dashboardModes = @($Dev, $Preview, $BuildOnly, $InstallOnly) | Where-Object { $_ }
    if (@($dashboardModes).Count -gt 1) {
        throw 'Choose only one mode: -Dev, -Preview, -BuildOnly or -InstallOnly.'
    }

    $dashboardNode = $null
    $dashboardNodeCandidates = @(Get-Command node.exe -All -CommandType Application -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    # Ordinary terminals do not inherit the extra PATH entries supplied by Codex.
    $dashboardNodeCandidates += @(
        "$env:ProgramFiles\nodejs\node.exe"
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
        "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    )
    foreach ($dashboardCandidate in $dashboardNodeCandidates) {
        if (-not (Test-Path -LiteralPath $dashboardCandidate -PathType Leaf)) { continue }
        try {
            $dashboardNodeVersion = [version]((& $dashboardCandidate --version).TrimStart('v'))
            if ($LASTEXITCODE -eq 0 -and $dashboardNodeVersion -ge [version]'22.13.0') {
                $dashboardNode = $dashboardCandidate
                break
            }
        } catch { continue }
    }
    if (-not $dashboardNode) {
        throw 'No compatible Node.js was found on PATH or in standard installation locations. Install Node.js 22.13+ and reopen this terminal.'
    }
    $dashboardNodeDirectory = Split-Path -Parent $dashboardNode
    $env:PATH = "$dashboardNodeDirectory;$env:PATH"

    # npm.cmd may force its own older node.exe; use the selected Node explicitly.
    $dashboardNpmCandidates = @(Join-Path $dashboardNodeDirectory 'node_modules/npm/bin/npm-cli.js')
    foreach ($dashboardNpmCommand in @(Get-Command npm.cmd -All -CommandType Application -ErrorAction SilentlyContinue)) {
        $dashboardNpmCandidates += Join-Path (Split-Path -Parent $dashboardNpmCommand.Source) 'node_modules/npm/bin/npm-cli.js'
    }
    $dashboardNpm = $dashboardNpmCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $dashboardNpm) {
        throw 'npm was not found. Install a Node.js distribution that includes npm and reopen this terminal.'
    }
    Write-Host "Using Node.js $dashboardNodeVersion ($dashboardNode)"

    $dashboardLock = Join-Path $PSScriptRoot 'package-lock.json'
    $dashboardInstalledLock = Join-Path $PSScriptRoot 'node_modules/.package-lock.json'
    $dashboardNext = Join-Path $PSScriptRoot 'node_modules/next/dist/bin/next'
    if (-not (Test-Path -LiteralPath $dashboardLock)) {
        throw 'package-lock.json is missing. Run npm install to restore it before launching.'
    }

    $dashboardNeedsInstall = -not (Test-Path -LiteralPath $dashboardNext) -or -not (Test-Path -LiteralPath $dashboardInstalledLock)
    if (-not $dashboardNeedsInstall) {
        $dashboardNeedsInstall = (Get-Item -LiteralPath $dashboardLock).LastWriteTimeUtc -gt (Get-Item -LiteralPath $dashboardInstalledLock).LastWriteTimeUtc
    }
    if (-not $dashboardNeedsInstall) {
        & $dashboardNode $dashboardNpm ls --depth=0 --omit=optional --offline *> $null
        $dashboardNeedsInstall = $LASTEXITCODE -ne 0
    }
    if ($dashboardNeedsInstall) {
        Write-Host 'Installing dependencies from package-lock.json...'
        & $dashboardNode $dashboardNpm ci --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check the npm output above.' }
    } else {
        Write-Host 'Dependencies are ready; no installation needed.'
    }

    if ($InstallOnly) {
        $dashboardExitCode = 0
    } else {
        if ($Preview -or $BuildOnly) {
            & $dashboardNode $dashboardNpm run build
            if ($LASTEXITCODE -ne 0) { throw 'The production build failed. Check the output above.' }
        }
        if ($BuildOnly) {
            $dashboardExitCode = 0
        } else {
            $dashboardMode = if ($Preview) { 'start' } else { 'dev' }
            $dashboardUrl = "http://127.0.0.1:$Port/"
            $dashboardPortProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
            try {
                $dashboardPortProbe.Start()
            } catch {
                throw "Port $Port is unavailable. Choose another port with -Port."
            } finally {
                $dashboardPortProbe.Stop()
            }
            Write-Host "Asset Dashboard: $dashboardUrl (Ctrl+C to stop)"

            if (-not $NoBrowser) {
                # Wait in a hidden helper so the browser opens only after the server responds.
                $dashboardBrowserScript = @"
`$deadline = [DateTime]::UtcNow.AddMinutes(2)
while ([DateTime]::UtcNow -lt `$deadline) {
    try {
        `$response = Invoke-WebRequest -Uri '$dashboardUrl' -UseBasicParsing -TimeoutSec 2
        if (`$response.StatusCode -eq 200) {
            Start-Process '$dashboardUrl'
            break
        }
    } catch { }
    Start-Sleep -Milliseconds 500
}
"@
                $dashboardEncodedScript = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($dashboardBrowserScript))
                $dashboardBrowserHelper = Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile', '-EncodedCommand', $dashboardEncodedScript) -PassThru
            }

            & $dashboardNode $dashboardNext $dashboardMode --hostname 127.0.0.1 --port $Port
            $dashboardExitCode = $LASTEXITCODE
        }
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    if ($null -ne $dashboardBrowserHelper -and -not $dashboardBrowserHelper.HasExited) {
        Stop-Process -Id $dashboardBrowserHelper.Id -ErrorAction SilentlyContinue
    }
    Pop-Location
    $env:PATH = $dashboardOriginalPath
}

exit $dashboardExitCode
