#requires -Version 5.1
param(
  [Parameter(Mandatory=$true)][string]$SourceTar,
  [string]$Out = 'windows-host-build'
)

$ErrorActionPreference = 'Stop'
$ExpectedSha256 = 'a09867eb2e827cb3f4ca84b11eae87420ba58738e4dec68de8b11cce3cd84eca'
$ExpectedBytes = 8765440
$ExpectedTarName = 'vexlife-source-3d2ef4c81a5b6b5a7ba717178fb3479511299e08.tar'
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$IExpress = Join-Path $env:SystemRoot 'System32\iexpress.exe'
if (-not (Test-Path -LiteralPath $IExpress -PathType Leaf)) { throw 'Windows IExpress is unavailable on this host.' }

$SourceTar = [System.IO.Path]::GetFullPath($SourceTar)
if (-not (Test-Path -LiteralPath $SourceTar -PathType Leaf)) { throw 'Source TAR is missing.' }
$ObservedBytes = (Get-Item -LiteralPath $SourceTar).Length
$ObservedSha256 = (Get-FileHash -LiteralPath $SourceTar -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ObservedBytes -ne $ExpectedBytes -or $ObservedSha256 -ne $ExpectedSha256) { throw 'Source TAR does not match the frozen R1/R2 candidate.' }

$PlanScript = Join-Path $RepoRoot 'scripts\release-bootstrap-package.mjs'
& $Node $PlanScript --platform windows --source-tar $SourceTar --out $Out
if ($LASTEXITCODE -ne 0) { throw 'Effect-free package planning failed.' }
$OutRoot = Join-Path $RepoRoot ('generated\release-bootstrap-packages\' + $Out)
$Stage = Join-Path $env:TEMP ('VexLife-ReleaseBootstrap-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Stage -Force | Out-Null
try {
  Copy-Item -LiteralPath $SourceTar -Destination (Join-Path $Stage $ExpectedTarName)
  Copy-Item -LiteralPath (Join-Path $RepoRoot 'release\windows\bootstrap.ps1') -Destination (Join-Path $Stage 'bootstrap.ps1')
  foreach ($receipt in @('package-plan.json','release-notice-receipt.json','source-archive-receipt.json')) {
    Copy-Item -LiteralPath (Join-Path $OutRoot $receipt) -Destination (Join-Path $Stage $receipt)
  }

  $Target = Join-Path $OutRoot 'VexLife-Setup-Windows-unsigned.exe'
  $Sed = Join-Path $Stage 'package.sed'
  $StageSlash = $Stage.TrimEnd('\') + '\'
  $SedText = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$Target
FriendlyName=VexLife Setup
AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -File bootstrap.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$StageSlash
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
%FILE3%=
%FILE4%=
[Strings]
FILE0="bootstrap.ps1"
FILE1="$ExpectedTarName"
FILE2="package-plan.json"
FILE3="release-notice-receipt.json"
FILE4="source-archive-receipt.json"
"@
  [System.IO.File]::WriteAllText($Sed, $SedText, (New-Object System.Text.UTF8Encoding($false)))
  & $IExpress /N /Q $Sed
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Target -PathType Leaf)) { throw 'IExpress did not form the unsigned Windows bootstrap candidate.' }

  $ArtifactSha256 = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant()
  $ArtifactBytes = (Get-Item -LiteralPath $Target).Length
  $Receipt = [ordered]@{
    schemaVersion = 'vexlife.release-bootstrap-build-receipt/v1'
    platform = 'windows'
    artifactClass = 'WINDOWS_UNSIGNED_DIRECT_BOOTSTRAP_CANDIDATE'
    containerClass = 'WINDOWS_IEXPRESS_SELF_EXTRACTING_EXE_CANDIDATE'
    artifactFilename = [System.IO.Path]::GetFileName($Target)
    artifactSha256 = $ArtifactSha256
    artifactBytes = $ArtifactBytes
    sourceTarSha256 = $ObservedSha256
    sourceTarBytes = $ObservedBytes
    containerDeterminismState = 'HOST_REPEAT_BUILD_QUALIFICATION_REQUIRED'
    signing = $false
    notarization = $false
    publication = $false
    githubReleaseCreation = $false
    officialVerifiedBuildPromotion = $false
  }
  $Receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutRoot 'build-receipt.json') -Encoding UTF8
  "$ArtifactSha256  $([System.IO.Path]::GetFileName($Target))" | Set-Content -LiteralPath (Join-Path $OutRoot 'SHA256SUMS') -Encoding ASCII
  Write-Host "VEXLIFE_UNSIGNED_WINDOWS_BOOTSTRAP_READY=$Target"
} finally {
  Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue
}

# [VXG RealForever]
