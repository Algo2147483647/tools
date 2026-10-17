# Windows runtime discovery; shared startup behavior lives in launch.mjs.
function Find-GraphNode {
    $candidates = @((Get-Command node.exe -All -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source))
    $candidates += @(
        "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe",
        "$env:ProgramFiles/nodejs/node.exe",
        "$env:LOCALAPPDATA/Programs/nodejs/node.exe"
    )
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $reported = & $candidate --version 2>$null
        $version = $null
        if ($LASTEXITCODE -eq 0 -and [version]::TryParse(([string]$reported).Trim().TrimStart('v'), [ref]$version) -and $version -ge [version]'22.12.0') {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw 'Node.js 22.12+ is required. Install Node.js LTS (including npm) from https://nodejs.org/ and reopen this launcher.'
}
