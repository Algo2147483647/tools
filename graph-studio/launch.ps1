# Starts and stops the Graph Studio frontend and backend together.
[CmdletBinding(PositionalBinding = $false)]
param([switch]$Preview, [switch]$InstallOnly, [switch]$BuildOnly, [switch]$NoBrowser, [switch]$Help)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/node-runtime.ps1')
try {
    $graphNode = Find-GraphNode
    $graphArgs = @()
    $optionNames = @{ Preview = '--preview'; InstallOnly = '--install-only'; BuildOnly = '--build-only'; NoBrowser = '--no-browser'; Help = '--help' }
    foreach ($entry in $PSBoundParameters.GetEnumerator()) {
        if ($entry.Value) { $graphArgs += $optionNames[$entry.Key] }
    }
    & $graphNode (Join-Path $PSScriptRoot 'scripts/launch.mjs') @graphArgs
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
