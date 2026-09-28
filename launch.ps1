param(
    [Parameter(Position = 0)][ValidateSet('svg-studio', 'service-flow-editor', 'form-studio', 'asset-dashboard')][string]$Project,
    [switch]$Dev, [switch]$Preview, [switch]$InstallOnly, [switch]$BuildOnly, [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
if (-not $Project) {
    Write-Host 'Usage: .\launch.cmd <project> [-Dev] [-Preview] [-InstallOnly] [-BuildOnly] [-NoBrowser]'
    Write-Host 'Projects: svg-studio, service-flow-editor, form-studio, asset-dashboard'
    exit 0
}
$launcher = Join-Path $PSScriptRoot "$Project/launch.ps1"
$options = @{}
foreach ($entry in $PSBoundParameters.GetEnumerator()) {
    if ($entry.Key -ne 'Project' -and $entry.Value) { $options[$entry.Key] = $entry.Value }
}
& $launcher @options
exit $LASTEXITCODE
