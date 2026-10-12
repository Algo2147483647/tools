param([switch]$Diagnose)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeRuntime = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
if ($Diagnose) { & $nodeRuntime (Join-Path $PSScriptRoot 'diagnose.mjs'); exit $LASTEXITCODE }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\ws'))) { throw 'Run npm install in the FlightLab folder first.' }
& $nodeRuntime (Join-Path $PSScriptRoot 'server.mjs')
exit $LASTEXITCODE
