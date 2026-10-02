$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
$testsPassed = 0
function Assert-RuntimeTest {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "FAIL: $Message" }
    $script:testsPassed++
    Write-Host "PASS: $Message"
}

$originalPath = $env:Path
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('tools-runtime-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $node = Resolve-ToolsNode
    Assert-RuntimeTest (Test-Path -LiteralPath $node) 'resolves a compatible Node executable'
    $pnpm = Find-ToolsPackageManager -Node $node -Name pnpm
    Assert-RuntimeTest ($null -ne $pnpm) 'resolves pnpm without requiring npm.cmd'
    $bundledNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    if (Test-Path -LiteralPath $bundledNode) {
        $env:Path = Join-Path $env:SystemRoot 'System32'
        $fallback = Resolve-ToolsNode
        $fallbackPnpm = Find-ToolsPackageManager -Node $fallback -Name pnpm
        Assert-RuntimeTest ((Test-Path -LiteralPath $fallback) -and $null -ne $fallbackPnpm) 'works with Node, npm and pnpm absent from PATH'
        $env:Path = $originalPath
    }
    $fixture = Join-Path $testRoot 'project with spaces'
    New-Item -ItemType Directory -Path $fixture | Out-Null
    $manifestPath = Join-Path $fixture 'package.json'
    Set-Content -LiteralPath $manifestPath -Encoding ascii -Value '{"name":"runtime-fixture","version":"1.0.0"}'
    Set-Content -LiteralPath (Join-Path $fixture 'package-lock.json') -Encoding ascii -Value '{"lockfileVersion":3}'
    $before = Get-ToolsDependencyFingerprint -ProjectPath $fixture -Node $node
    Set-Content -LiteralPath $manifestPath -Encoding ascii -Value '{"name":"runtime-fixture","version":"1.0.1"}'
    $after = Get-ToolsDependencyFingerprint -ProjectPath $fixture -Node $node
    Assert-RuntimeTest ($before -ne $after) 'invalidates cache when package.json changes'

    # Stub only installation. No test downloads packages or modifies a real project.
    $script:installCalls = @()
    $script:failInstall = $false
    function Find-ToolsPackageManager {
        param([string]$Node, [string]$Name)
        if ($Name -eq 'pnpm') { return [pscustomobject]@{ Name = 'pnpm'; Executable = $Node; Prefix = @() } }
        return $null
    }
    function Invoke-ToolsPackageManager {
        param($Manager, [string[]]$Arguments)
        $script:installCalls += $Arguments -join ' '
        if ($script:failInstall) { throw 'Simulated failed installation' }
        if ($Arguments[0] -eq 'install') { New-Item -ItemType Directory -Path (Join-Path $fixture 'node_modules') -Force | Out-Null }
    }
    $null = Initialize-ToolsProject -ProjectPath $fixture
    Assert-RuntimeTest ($installCalls.Count -eq 2 -and $installCalls[0] -eq 'import' -and $installCalls[1] -eq 'install --frozen-lockfile --prod=false') 'npm project falls back to pnpm import and frozen install'
    $null = Initialize-ToolsProject -ProjectPath $fixture
    Assert-RuntimeTest ($installCalls.Count -eq 2) 'unchanged healthy dependencies skip installation'
    Set-Content -LiteralPath (Join-Path $fixture 'package-lock.json') -Encoding ascii -Value '{"lockfileVersion":3,"name":"updated"}'
    $script:simulateBusy = $true
    function Get-ToolsDependencyUsers {
        param([string]$ProjectPath)
        if ($script:simulateBusy) { [pscustomobject]@{ Name = 'esbuild.exe'; ProcessId = 123; ParentProcessId = 100 } }
    }
    try { $null = Initialize-ToolsProject -ProjectPath $fixture; throw 'Busy process was not detected' } catch {
        Assert-RuntimeTest ($_.Exception.Message -like '*files are in use*PID 123*No dependencies were removed*') 'reports the project process holding dependencies before installation'
    }
    Assert-RuntimeTest ($installCalls.Count -eq 2 -and (Test-Path -LiteralPath (Join-Path $fixture 'node_modules/.tools-install-ready'))) 'busy dependencies leave the installation and its stamp untouched'
    $script:simulateBusy = $false
    $script:failInstall = $true
    try { $null = Initialize-ToolsProject -ProjectPath $fixture; throw 'Failure was not propagated' } catch {
        Assert-RuntimeTest ($_.Exception.Message -eq 'Simulated failed installation') 'failed package-manager commands propagate errors'
    }
    Assert-RuntimeTest (-not (Test-Path -LiteralPath (Join-Path $fixture 'node_modules/.tools-install-ready'))) 'failed install cannot leave a success stamp'
    $script:failInstall = $false
    $null = Initialize-ToolsProject -ProjectPath $fixture
    Assert-RuntimeTest (Test-Path -LiteralPath (Join-Path $fixture 'node_modules/.tools-install-ready')) 'next launch retries and repairs failed installation'
    Set-Content -LiteralPath $manifestPath -Encoding ascii -Value '{"name":"runtime-fixture","dependencies":{"missing-package":"1.0.0"}}'
    Assert-RuntimeTest (-not (Test-ToolsDependencies -ProjectPath $fixture -Node $node)) 'detects incomplete node_modules'
    Write-Host "$testsPassed runtime tests passed."
} finally {
    $env:Path = $originalPath
    $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
    $expectedParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolvedTestRoot.StartsWith($expectedParent, [System.StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedTestRoot) -like 'tools-runtime-test-*') {
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}
