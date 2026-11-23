param([ValidateRange(1,65535)][int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
$index = Join-Path $PSScriptRoot 'frontend/dist/index.html'
if ((Test-Path $python) -and (Test-Path $index)) {
    Push-Location $PSScriptRoot
    try {
        $url = "http://127.0.0.1:$Port"
        $existing = $null
        try { $existing = Invoke-RestMethod "$url/openapi.json" -TimeoutSec 2 } catch {}
        $ready = $existing -and ($existing.paths.PSObject.Properties.Name -contains '/api/games/{key}/analyse')
        if ($ready) {
            Write-Host $url
            if ($env:ZERO_OPEN_BROWSER -eq '1') { Start-Process $url }
            exit 0
        }
        if ($existing) { throw "Port $Port is already in use." }
        if ($env:ZERO_OPEN_BROWSER -eq '1') {
            $watch = Start-Job -ArgumentList $url -ScriptBlock {
                param($address)
                for ($i=0; $i -lt 60; $i++) {
                    try {
                        $api = Invoke-RestMethod "$address/openapi.json" -TimeoutSec 1
                        if ($api.paths.PSObject.Properties.Name -contains '/api/games/{key}/analyse') {
                            Start-Process $address
                            return
                        }
                    } catch {}
                    Start-Sleep -Milliseconds 500
                }
            }
        }
        & $python -m zero serve --port $Port
        exit $LASTEXITCODE
    } finally {
        if ($watch) { Remove-Job $watch -Force }
        Pop-Location
    }
}
foreach ($candidate in (Get-Command node -All -CommandType Application -ErrorAction SilentlyContinue)) {
    $nodePath = $candidate.Source
    $version = & $nodePath --version
    if ($version -match '^v(\d+)' -and [int]$Matches[1] -ge 18) {
        $env:Path = (Split-Path -Parent $nodePath) + [IO.Path]::PathSeparator + $env:Path
        $launcher = Join-Path $PSScriptRoot 'scripts/launch.mjs'
        & $nodePath $launcher $Port
        exit $LASTEXITCODE
    }
}
throw 'Node.js 18+ is required. Install it and run this launcher again.'
