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
Push-Location -LiteralPath $PSScriptRoot

try {
    $dashboardModes = @($Dev, $Preview, $BuildOnly, $InstallOnly) | Where-Object { $_ }
    if (@($dashboardModes).Count -gt 1) {
        throw 'Choose only one mode: -Dev, -Preview, -BuildOnly or -InstallOnly.'
    }

    $dashboardNode = (Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    $dashboardNpm = (Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if (-not $dashboardNode -or -not $dashboardNpm) {
        throw 'Node.js and npm were not found. Install Node.js 22.13+ (24 LTS recommended), then reopen this terminal.'
    }
    $dashboardNodeVersion = [version]((& $dashboardNode --version).TrimStart('v'))
    if ($dashboardNodeVersion -lt [version]'22.13.0') {
        throw "Node.js $dashboardNodeVersion is too old. This project requires Node.js 22.13+."
    }

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
        & $dashboardNpm ls --depth=0 --omit=optional --offline *> $null
        $dashboardNeedsInstall = $LASTEXITCODE -ne 0
    }
    if ($dashboardNeedsInstall) {
        Write-Host 'Installing dependencies from package-lock.json...'
        & $dashboardNpm ci --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check the npm output above.' }
    } else {
        Write-Host 'Dependencies are ready; no installation needed.'
    }

    if ($InstallOnly) {
        $dashboardExitCode = 0
    } else {
        if ($Preview -or $BuildOnly) {
            & $dashboardNpm run build
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
}

exit $dashboardExitCode
