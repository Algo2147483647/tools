$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localNode = Join-Path $projectRoot '.runtime\node-runtime\node_modules\node\bin'
if (Test-Path (Join-Path $localNode 'node.exe')) { $env:PATH = "$localNode;$env:PATH" }
Push-Location (Join-Path $projectRoot 'desktop')
try {
    $major = [int]((node --version).TrimStart('v').Split('.')[0])
    if ($major -lt 22) { throw 'Install Node.js 24 LTS before starting the desktop app.' }
    $env:ELECTRON_RUN_AS_NODE = $null
    if (!(Test-Path 'node_modules\electron')) {
        npm ci --cache (Join-Path $projectRoot '.runtime\npm-cache')
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    npm start
    if ($LASTEXITCODE -ne 0) { throw 'Desktop startup failed.' }
} finally { Pop-Location }
