param([switch]$Dev, [switch]$Preview, [switch]$InstallOnly, [switch]$BuildOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$candidatePaths = @()
$installedNode = Get-Command node -ErrorAction SilentlyContinue
if ($installedNode) { $candidatePaths += $installedNode.Source }
$candidatePaths += (Join-Path $runtimeRoot 'node\bin\node.exe')
$candidatePaths += 'C:\Program Files\nodejs\node.exe'
$nodePath = $null
foreach ($candidate in $candidatePaths) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $version = & $candidate -p 'process.versions.node'
    $parts = $version.Split('.')
    if ([int]$parts[0] -gt 22 -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -ge 12)) { $nodePath = $candidate; break }
}
if (-not $nodePath) { throw 'Node.js 22.12 or newer is required. Install Node.js LTS, then run this launcher again.' }
$env:Path = (Split-Path $nodePath) + ';' + $env:Path
$npmPaths = @((Join-Path (Split-Path $nodePath) 'node_modules\npm\bin\npm-cli.js'), (Join-Path (Split-Path (Split-Path $nodePath)) 'node_modules\npm\bin\npm-cli.js'))
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) { $npmPaths += (Join-Path (Split-Path $npmCommand.Source) 'node_modules\npm\bin\npm-cli.js') }
$npmCli = $npmPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath 'node_modules\vite\bin\vite.js')) {
        Write-Host 'Preparing FlightLab dependencies...'
        if ($npmCli) {
            $installCommand = if (Test-Path -LiteralPath 'package-lock.json') { 'ci' } else { 'install' }
            & $nodePath $npmCli $installCommand --cache (Join-Path $PSScriptRoot '.npm-cache') --no-fund --no-audit
        } else {
            $pnpmPath = Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd'
            if (-not (Test-Path -LiteralPath $pnpmPath)) { throw 'npm is required for the first installation. Reinstall Node.js with npm included.' }
            & $pnpmPath install
        }
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your network connection and retry.' }
    }
    if ($InstallOnly) { Write-Host 'Dependencies are ready.'; exit 0 }
    if ($BuildOnly -or $Preview) {
        & $nodePath 'node_modules\typescript\bin\tsc' --noEmit
        if ($LASTEXITCODE -ne 0) { throw 'Type checking failed.' }
        & $nodePath 'node_modules\vite\bin\vite.js' build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
        if ($BuildOnly) { exit 0 }
    }
    $address = 'http://127.0.0.1:4188/'
    Write-Host "FlightLab: $address"
    Write-Host 'Keep this window open while flying. Press Ctrl+C to stop.'
    $browserOptions = @()
    if (-not $NoBrowser) { $browserOptions = @('--open', $address) }
    if ($Preview) { & $nodePath 'node_modules\vite\bin\vite.js' preview --host 127.0.0.1 --port 4188 --strictPort @browserOptions }
    else { & $nodePath 'node_modules\vite\bin\vite.js' --host 127.0.0.1 --port 4188 --strictPort @browserOptions }
} finally { Pop-Location }
