# Graph Studio's Windows bootstrap. Keep this file with the project.
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

function Find-GraphPackageManager {
    param([string]$NodePath)
    $nodeDirectory = Split-Path -Parent $NodePath
    $directories = @($nodeDirectory, (Split-Path -Parent $nodeDirectory), "$env:APPDATA/npm")
    foreach ($commandName in @('npm.cmd', 'pnpm.cmd')) {
        $directories += @(Get-Command $commandName -All -ErrorAction SilentlyContinue | ForEach-Object { Split-Path -Parent $_.Source })
    }
    $directories += "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node"
    foreach ($manager in @('npm', 'pnpm')) {
        $relativePaths = if ($manager -eq 'npm') { @('node_modules/npm/bin/npm-cli.js') } else { @('node_modules/pnpm/bin/pnpm.cjs', 'node_modules/pnpm/bin/pnpm.mjs') }
        foreach ($directory in ($directories | Select-Object -Unique)) {
            foreach ($relativePath in $relativePaths) {
                $candidate = Join-Path $directory $relativePath
                if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                    return @{ Name = $manager; Path = (Resolve-Path -LiteralPath $candidate).Path }
                }
            }
        }
    }
    throw 'npm or pnpm could not be found. Install Node.js LTS including npm, then reopen this launcher.'
}

function Test-GraphDependencies {
    param([string]$NodePath)
    # Check direct packages as well as the native esbuild binary, not just the Vite shim.
    $probe = @'
const fs = require('node:fs');
const path = require('node:path');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const name of Object.keys({...pkg.dependencies, ...pkg.devDependencies})) {
    if (!fs.existsSync(path.join('node_modules', name, 'package.json'))) process.exit(1);
  }
  for (const file of ['node_modules/vite/bin/vite.js', 'node_modules/typescript/bin/tsc']) {
    if (!fs.existsSync(file)) process.exit(1);
  }
  require('esbuild').transformSync('const value: number = 1', {loader: 'ts'});
  import('vite').catch(() => process.exit(1));
} catch { process.exit(1); }
'@
    & $NodePath -e $probe *> $null
    return $LASTEXITCODE -eq 0
}

function Initialize-GraphStudio {
    param([string]$ProjectPath)
    $nodePath = Find-GraphNode
    $env:Path = (Split-Path -Parent $nodePath) + [IO.Path]::PathSeparator + $env:Path
    $nodeVersion = & $nodePath --version
    Write-Host "Using Node.js $nodeVersion ($nodePath)"
    $manager = Find-GraphPackageManager -NodePath $nodePath
    $managerVersion = & $nodePath $manager.Path --version
    if ($LASTEXITCODE -ne 0) { throw "Could not run $($manager.Name)." }

    $fingerprintParts = @('graph-studio-bootstrap-v1', $nodeVersion, $manager.Name, $managerVersion, [Environment]::OSVersion.Platform, [IntPtr]::Size, $ProjectPath)
    foreach ($name in @('package.json', 'package-lock.json', '.npmrc')) {
        $file = Join-Path $ProjectPath $name
        if (Test-Path -LiteralPath $file) { $fingerprintParts += [IO.File]::ReadAllText($file) }
    }
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($fingerprintParts -join "`n")))) }
    finally { $hasher.Dispose() }
    $stamp = Join-Path $ProjectPath 'node_modules/.graph-studio-install'
    if ((Test-Path -LiteralPath $stamp) -and [IO.File]::ReadAllText($stamp) -eq $fingerprint -and (Test-GraphDependencies -NodePath $nodePath)) {
        Write-Host 'Dependencies are ready.'
        return $nodePath
    }

    # npm ci replaces node_modules; Windows cannot replace a running esbuild binary.
    $modulePrefix = (Join-Path $ProjectPath 'node_modules') + [IO.Path]::DirectorySeparatorChar
    $runningCompiler = Get-Process -Name esbuild -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and $_.Path.StartsWith($modulePrefix, [StringComparison]::OrdinalIgnoreCase)
    }
    if ($runningCompiler) { throw 'Close the running Graph Studio servers before installing or updating dependencies, then retry.' }

    # Invalidate the old success record before attempting a fresh installation.
    if (Test-Path -LiteralPath $stamp) { Remove-Item -LiteralPath $stamp }
    Write-Host "Installing dependencies with $($manager.Name)..."
    if ($manager.Name -eq 'npm') {
        & $nodePath $manager.Path ci --include=dev --no-audit --no-fund | Out-Host
    } else {
        & $nodePath $manager.Path import | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Could not import package-lock.json into pnpm.' }
        & $nodePath $manager.Path install --frozen-lockfile --prod=false | Out-Host
    }
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the error above and retry.' }
    if (-not (Test-GraphDependencies -NodePath $nodePath)) { throw 'Dependency verification failed. Retry the launcher to repair the installation.' }
    [IO.File]::WriteAllText($stamp, $fingerprint)
    return $nodePath
}
