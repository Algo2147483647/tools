param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path $PSScriptRoot -Parent
$lock = Get-Content -LiteralPath (Join-Path $root 'desktop\engine\runtime-lock.json') -Raw | ConvertFrom-Json
$target = Join-Path $root '.runtime\python-engine'
$cache = Join-Path $root '.runtime\math-downloads'
New-Item -ItemType Directory -Force -Path $target,$cache | Out-Null
function Fetch-Verified($Url, $Name, $Hash) {
    $file = Join-Path $cache $Name
    if (!(Test-Path -LiteralPath $file)) { Invoke-WebRequest -Uri $Url -OutFile $file }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Hash) { throw "Hash mismatch: $Name" }
    return $file
}
function Expand-Verified($Archive,$Destination) {
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try { foreach ($entry in $zip.Entries) {
        $dest = [IO.Path]::GetFullPath((Join-Path $Destination $entry.FullName))
        $prefix = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
        if (!$dest.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes target' }
        if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Force -Path $dest | Out-Null; continue }
        New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$dest,$true)
    }} finally { $zip.Dispose() }
}
$archive = Fetch-Verified $lock.python.url 'python-embed.zip' $lock.python.sha256
Expand-Verified $archive $target
$site = Join-Path $target 'Lib\site-packages'
foreach ($package in $lock.packages) {
    $metadata = Invoke-RestMethod "https://pypi.org/pypi/$($package.name)/$($package.version)/json"
    $wheel = $metadata.urls | Where-Object filename -eq $package.file | Select-Object -First 1
    if (!$wheel -or $wheel.digests.sha256 -ne $package.sha256) { throw "Locked wheel missing: $($package.file)" }
    $archive = Fetch-Verified $wheel.url $package.file $package.sha256
    Expand-Verified $archive $site
}
Set-Content -LiteralPath (Join-Path $target 'python312._pth') -Encoding Ascii -Value "python312.zip`n.`nLib/site-packages`nimport site"
& (Join-Path $target 'python.exe') -I -B -c "import sympy,numpy,scipy,pandas,matplotlib; print('Mathematics runtime ready')"
if ($LASTEXITCODE -ne 0) { throw 'Runtime verification failed' }
