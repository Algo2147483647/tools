# Shared Windows runtime for independent tools. Compatible with Windows PowerShell 5.1.
# Dot-source this file; it does not change the caller's working directory.

function Resolve-ToolsNode {
    param([version]$MinimumVersion = [version]'22.12.0')
    $runtimeRoot = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies'
    $candidates = @(Get-Command node.exe -All -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    $candidates += Join-Path $runtimeRoot 'node/bin/node.exe'
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'nodejs/node.exe' }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not $candidate -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try {
            $versionText = & $candidate -p 'process.versions.node' 2>$null
            if ($LASTEXITCODE -eq 0 -and [version]$versionText -ge $MinimumVersion) {
                return (Resolve-Path -LiteralPath $candidate).Path
            }
        } catch { continue }
    }
    throw "Node.js $MinimumVersion or later was not found. Install Node.js LTS, reopen the terminal, and retry. An existing Codex runtime is also supported."
}

function Find-ToolsPackageManager {
    param([string]$Node, [ValidateSet('npm', 'pnpm')][string]$Name)
    $nodeDirectory = Split-Path -Parent $Node
    $runtimeRoot = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies'
    $relativeCli = if ($Name -eq 'npm') { 'npm/bin/npm-cli.js' } else { 'pnpm/bin/pnpm.mjs' }
    $wrappers = @(Get-Command "$Name.cmd" -All -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    $cliCandidates = @(
        (Join-Path $nodeDirectory "node_modules/$relativeCli"),
        (Join-Path (Split-Path -Parent $nodeDirectory) "node_modules/$relativeCli")
    )
    foreach ($wrapper in $wrappers) { $cliCandidates += Join-Path (Split-Path -Parent $wrapper) "node_modules/$relativeCli" }
    $cliCandidates += Join-Path $runtimeRoot "node/node_modules/$relativeCli"
    foreach ($candidate in ($cliCandidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            & $Node $candidate --version *> $null
            if ($LASTEXITCODE -eq 0) { return [pscustomobject]@{ Name = $Name; Executable = $Node; Prefix = @($candidate) } }
        }
    }
    if ($Name -eq 'pnpm') { $wrappers += Join-Path $runtimeRoot 'bin/fallback/pnpm.cmd' }
    foreach ($wrapper in ($wrappers | Select-Object -Unique)) {
        if ($wrapper -and (Test-Path -LiteralPath $wrapper -PathType Leaf)) {
            & $wrapper --version *> $null
            if ($LASTEXITCODE -eq 0) { return [pscustomobject]@{ Name = $Name; Executable = $wrapper; Prefix = @() } }
        }
    }
    return $null
}

function Invoke-ToolsPackageManager {
    param($Manager, [string[]]$Arguments)
    $managerArgs = @($Manager.Prefix) + $Arguments
    & $Manager.Executable @managerArgs | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "$($Manager.Name) $($Arguments -join ' ') failed (exit $LASTEXITCODE). Fix the error above and rerun the launcher; installation will be retried." }
}

function Get-ToolsDependencyFingerprint {
    param([string]$ProjectPath, [string]$Node)
    $manifest = Get-Content -LiteralPath (Join-Path $ProjectPath 'package.json') -Raw | ConvertFrom-Json
    # npm remains authoritative in existing npm projects; converted pnpm locks are caches.
    $lockName = if ($manifest.packageManager -like 'pnpm@*' -or -not (Test-Path -LiteralPath (Join-Path $ProjectPath 'package-lock.json'))) { 'pnpm-lock.yaml' } else { 'package-lock.json' }
    $files = @('package.json', $lockName, '.npmrc', 'pnpm-workspace.yaml')
    $hashes = foreach ($file in $files) {
        $path = Join-Path $ProjectPath $file
        if (Test-Path -LiteralPath $path) { "$file=$((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash)" }
    }
    $platform = & $Node -p 'process.platform + "/" + process.arch + "/" + process.versions.modules'
    return 'tools-runtime-v1;' + $platform + ';' + ($hashes -join ';')
}

function Test-ToolsDependencies {
    param([string]$ProjectPath, [string]$Node)
    # Check all direct dependencies, and load native bundler packages to catch a copied node_modules.
    & $Node --input-type=module -e @'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8').replace(/^\uFEFF/, ''));
for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
  if (!fs.existsSync(path.join(root, 'node_modules', name, 'package.json'))) process.exit(1);
}
for (const name of ['vite', 'tsx', 'next']) {
  if (!(manifest.dependencies?.[name] || manifest.devDependencies?.[name])) continue;
  const file = name === 'vite' ? 'dist/node/index.js' : name === 'tsx' ? 'dist/loader.mjs' : 'dist/server/next.js';
  await import(pathToFileURL(path.join(root, 'node_modules', name, file)).href);
}
'@ $ProjectPath *> $null
    return $LASTEXITCODE -eq 0
}

function Initialize-ToolsProject {
    param([Parameter(Mandatory = $true)][string]$ProjectPath, [switch]$ForceInstall)
    $project = (Resolve-Path -LiteralPath $ProjectPath).Path
    if (-not (Test-Path -LiteralPath (Join-Path $project 'package.json'))) { throw "No package.json found in $project" }
    $node = Resolve-ToolsNode
    $env:Path = "$(Split-Path -Parent $node);$env:Path"
    $fingerprint = Get-ToolsDependencyFingerprint -ProjectPath $project -Node $node
    $stampPath = Join-Path $project 'node_modules/.tools-install-ready'
    $installed = if (Test-Path -LiteralPath $stampPath) { (Get-Content -LiteralPath $stampPath -Raw).Trim() } else { '' }
    $ready = -not $ForceInstall -and $installed -eq $fingerprint -and (Test-ToolsDependencies -ProjectPath $project -Node $node)
    if (-not $ready) {
        $manifest = Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw | ConvertFrom-Json
        $preferPnpm = $manifest.packageManager -like 'pnpm@*' -or -not (Test-Path -LiteralPath (Join-Path $project 'package-lock.json'))
        $managerName = if ($preferPnpm) { 'pnpm' } else { 'npm' }
        $manager = Find-ToolsPackageManager -Node $node -Name $managerName
        if (-not $manager) {
            $fallbackName = if ($preferPnpm) { 'npm' } else { 'pnpm' }
            $manager = Find-ToolsPackageManager -Node $node -Name $fallbackName
            if ($manager -and $preferPnpm) {
                $pnpmVersion = if ($manifest.packageManager -match '^pnpm@([0-9]+\.[0-9]+\.[0-9]+)') { $Matches[1] } else { '11.19.0' }
                $manager = [pscustomobject]@{ Name = 'pnpm'; Executable = $manager.Executable; Prefix = @($manager.Prefix) + @('exec', '--yes', "--package=pnpm@$pnpmVersion", '--', 'pnpm') }
            }
        }
        if (-not $manager) { throw 'Neither npm nor pnpm is available. Install Node.js LTS with npm, or install pnpm and add it to PATH. The launcher also supports Codex bundled pnpm.' }
        Write-Host "[$(Split-Path -Leaf $project)] Installing dependencies with $($manager.Name)..."
        # Invalidate before attempting installation. Failed or interrupted installs are never cached.
        if (Test-Path -LiteralPath $stampPath) { Remove-Item -LiteralPath $stampPath -Force }
        Push-Location -LiteralPath $project
        try {
            if ($manager.Name -eq 'npm') {
                Invoke-ToolsPackageManager -Manager $manager -Arguments @('ci', '--include=dev', '--no-audit', '--no-fund')
            } else {
                if (-not $preferPnpm) { Invoke-ToolsPackageManager -Manager $manager -Arguments @('import') }
                Invoke-ToolsPackageManager -Manager $manager -Arguments @('install', '--frozen-lockfile', '--prod=false')
            }
            if (-not (Test-ToolsDependencies -ProjectPath $project -Node $node)) { throw 'Dependency verification failed. Rerun the launcher to repair the installation.' }
            $fingerprint = Get-ToolsDependencyFingerprint -ProjectPath $project -Node $node
            Set-Content -LiteralPath $stampPath -Value $fingerprint -Encoding ascii
        } finally { Pop-Location }
    }
    Write-Host "[$(Split-Path -Leaf $project)] Node $(& $node -p 'process.versions.node') - dependencies ready."
    return $node
}
