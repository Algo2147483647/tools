$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localNode = Join-Path $projectRoot '.runtime\node-runtime\node_modules\node\bin'
if (Test-Path (Join-Path $localNode 'node.exe')) { $env:PATH = "$localNode;$env:PATH" }
Push-Location (Join-Path $projectRoot 'desktop')
try {
    npm run verify
    if ($LASTEXITCODE -ne 0) { throw 'Verification failed.' }
} finally { Pop-Location }
