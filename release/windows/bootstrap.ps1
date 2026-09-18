#requires -Version 5.1
param()

$ErrorActionPreference = 'Stop'
$ExpectedCommit = '3d2ef4c81a5b6b5a7ba717178fb3479511299e08'
$ExpectedTree = '8f8f945e8a448b191f85dfc327c135f54a296398'
$ExpectedTarSha256 = 'a09867eb2e827cb3f4ca84b11eae87420ba58738e4dec68de8b11cce3cd84eca'
$ExpectedTarBytes = 8765440
$TarName = 'vexlife-source-3d2ef4c81a5b6b5a7ba717178fb3479511299e08.tar'

function Stop-Held([string]$Message) {
  throw "VexLife setup package stopped: $Message"
}

function Assert-SafeTarEntries([string]$TarPath) {
  $TarExe = Get-Command tar.exe -ErrorAction SilentlyContinue
  if ($null -eq $TarExe) { Stop-Held 'Windows tar.exe is unavailable.' }
  $entries = & $TarExe.Source -tf $TarPath
  if ($LASTEXITCODE -ne 0) { Stop-Held 'The embedded source archive could not be listed safely.' }
  if ($null -eq $entries -or @($entries).Count -eq 0) { Stop-Held 'The embedded source archive is empty.' }
  foreach ($entryRaw in @($entries)) {
    $entry = ([string]$entryRaw).Replace('\','/')
    if ([string]::IsNullOrWhiteSpace($entry)) { Stop-Held 'The embedded source archive contains an empty path.' }
    if ($entry.StartsWith('/') -or $entry.StartsWith('//') -or $entry -match '^[A-Za-z]:/') {
      Stop-Held "The embedded source archive contains an absolute path: $entry"
    }
    $segments = @($entry.Split('/') | Where-Object { $_ -ne '' })
    if ($segments.Count -eq 0 -or $segments -contains '..' -or $segments -contains '.') {
      Stop-Held "The embedded source archive contains a traversal path: $entry"
    }
  }
}

$PackageRoot = Split-Path -Parent $PSCommandPath
$SourceTar = Join-Path $PackageRoot $TarName
if (-not (Test-Path -LiteralPath $SourceTar -PathType Leaf)) { Stop-Held "embedded source archive is missing: $TarName" }
$observedBytes = (Get-Item -LiteralPath $SourceTar).Length
if ($observedBytes -ne $ExpectedTarBytes) { Stop-Held "embedded source byte length mismatch: $observedBytes" }
$observedSha256 = (Get-FileHash -LiteralPath $SourceTar -Algorithm SHA256).Hash.ToLowerInvariant()
if ($observedSha256 -ne $ExpectedTarSha256) { Stop-Held "embedded source SHA-256 mismatch: $observedSha256" }
Assert-SafeTarEntries $SourceTar

$SourceParent = Join-Path $env:LOCALAPPDATA "VexLife\source-packages\$ExpectedCommit"
New-Item -ItemType Directory -Path $SourceParent -Force | Out-Null
$RunRoot = Join-Path $SourceParent ('run-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $RunRoot -Force | Out-Null

$TarExe = (Get-Command tar.exe -ErrorAction Stop).Source
& $TarExe -xf $SourceTar -C $RunRoot
if ($LASTEXITCODE -ne 0) { Stop-Held 'The exact embedded source could not be materialized.' }

$Setup = Join-Path $RunRoot 'setup-vexlife.cmd'
$Projection = Join-Path $RunRoot 'install\vexlife-setup-window.ps1'
$Backend = Join-Path $RunRoot 'install\vexlife-setup.ps1'
foreach ($required in @($Setup, $Projection, $Backend)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { Stop-Held "accepted setup source is missing after extraction: $required" }
}

$ReceiptRoot = Join-Path $env:LOCALAPPDATA 'VexLife\release-bootstrap-receipts'
New-Item -ItemType Directory -Path $ReceiptRoot -Force | Out-Null
$ReceiptPath = Join-Path $ReceiptRoot ("windows-bootstrap-$ExpectedCommit-" + [Guid]::NewGuid().ToString('N') + '.json')
$Receipt = [ordered]@{
  schemaVersion = 'vexlife.release-bootstrap-launch-receipt/v1'
  platform = 'windows'
  sourceCommit = $ExpectedCommit
  sourceTree = $ExpectedTree
  sourceTarSha256 = $observedSha256
  sourceTarBytes = $observedBytes
  materializedSourceRoot = $RunRoot
  acceptedEntryPath = $Setup
  signing = $false
  notarization = $false
  publication = $false
  officialVerifiedBuildPromotion = $false
  modelRuntimeBundled = $false
  HomeBundled = $false
  MemoryBundled = $false
}
$Receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8

Write-Host 'VexLife exact source verified. Opening the accepted Windows setup.'
& cmd.exe /d /c "`"$Setup`""
exit $LASTEXITCODE

# [VXG RealForever]
