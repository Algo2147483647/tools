param([switch]$Dev)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$atlasNodeCandidates = @(
    (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
)
$atlasNode = $null
foreach ($candidate in $atlasNodeCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        $version = & $candidate -p 'process.versions.node'
        if ([version]$version -ge [version]'22.12.0') { $atlasNode = $candidate; break }
    }
}
if (-not $atlasNode) { throw 'Install Node.js 22.12 or later, then run this launcher again.' }
$env:Path = "$(Split-Path -Parent $atlasNode);$env:Path"
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) {
    $atlasNpm = Get-Command npm.cmd -ErrorAction Stop
    $atlasNpmCli = Join-Path (Split-Path -Parent $atlasNpm.Source) 'node_modules/npm/bin/npm-cli.js'
    if (Test-Path -LiteralPath $atlasNpmCli) { & $atlasNode $atlasNpmCli ci --cache .npm-cache }
    else { & $atlasNpm.Source ci --cache .npm-cache }
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
if ($Dev) {
    Write-Host 'Service Atlas: http://127.0.0.1:4320/ (Ctrl+C to stop)'
    & $atlasNode scripts/dev.mjs
} else {
    & $atlasNode node_modules/typescript/bin/tsc --noEmit
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $atlasNode node_modules/vite/bin/vite.js build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $atlasNode --import tsx server/index.ts --open
}
