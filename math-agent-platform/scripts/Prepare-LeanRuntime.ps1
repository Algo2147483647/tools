param()
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$lock=Get-Content (Join-Path $root 'desktop\engine\lean-lock.json') -Raw | ConvertFrom-Json
$cache=Join-Path $root '.runtime\lean-downloads'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$zip=Join-Path $cache "lean-$($lock.version)-windows.zip"
if(!(Test-Path -LiteralPath $zip)){Invoke-WebRequest $lock.url -OutFile $zip}
if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $lock.sha256){throw 'Lean archive SHA-256 mismatch'}
$destination=Join-Path $root '.runtime\lean-runtime'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($zip)
try {foreach($entry in $archive.Entries){
 $relative=($entry.FullName -split '/',2)[1]
 if(!$relative -or $relative.EndsWith('/')){continue}
 $target=[IO.Path]::GetFullPath((Join-Path $destination $relative))
 if(!$target.StartsWith([IO.Path]::GetFullPath($destination)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid archive path'}
 New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
 [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
}}finally{$archive.Dispose()}
& (Join-Path $destination 'bin\lean.exe') --version
if($LASTEXITCODE -ne 0){throw 'Lean runtime validation failed'}
