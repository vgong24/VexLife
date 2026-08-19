#requires -Version 5.1
param(
  [ValidateSet("start", "uninstall-preserve")]
  [string]$Operation = "start",
  [string]$DeviceName = $env:COMPUTERNAME,
  [Alias("Home")]
  [string]$VexHome = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-TextSha256([string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Assert-CanonicalDirectory([string]$PathValue, [string]$Label) {
  $full = [System.IO.Path]::GetFullPath($PathValue)
  if (-not (Test-Path -LiteralPath $full -PathType Container)) {
    throw "$Label does not exist as a directory: $full"
  }
  $cursor = $full
  while (-not [string]::IsNullOrWhiteSpace($cursor)) {
    $item = Get-Item -LiteralPath $cursor -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "$Label traverses a symbolic link or junction: $cursor"
    }
    $parent = Split-Path -Parent $cursor
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $cursor) { break }
    $cursor = $parent
  }
  $resolved = (Resolve-Path -LiteralPath $full).Path
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals($full.TrimEnd('\'), $resolved.TrimEnd('\'))) {
    throw "$Label is not its canonical filesystem identity: requested=$full resolved=$resolved"
  }
  return $resolved
}

function Assert-PathWithin([string]$RootPath, [string]$CandidatePath, [string]$Label) {
  $rootFull = [System.IO.Path]::GetFullPath($RootPath).TrimEnd('\')
  $candidateFull = [System.IO.Path]::GetFullPath($CandidatePath)
  $prefix = $rootFull + [System.IO.Path]::DirectorySeparatorChar
  if (-not $candidateFull.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label escapes its admitted root: $candidateFull"
  }
  return $candidateFull
}

function Get-RelativeForwardPath([string]$RootPath, [string]$CandidatePath) {
  $rootFull = [System.IO.Path]::GetFullPath($RootPath).TrimEnd('\')
  $candidateFull = Assert-PathWithin $rootFull $CandidatePath "relative path"
  return $candidateFull.Substring($rootFull.Length + 1).Replace('\', '/')
}

function Assert-NoReparseDescendants([string]$HomeRoot) {
  foreach ($entry in Get-ChildItem -LiteralPath $HomeRoot -Force -Recurse -ErrorAction Stop) {
    if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Vex Home contains a symbolic-link/junction/reparse entry; uninstall-preserve fails closed: $($entry.FullName)"
    }
  }
}

function Get-ProtectedHomeSnapshot([string]$HomeRoot, [string]$UninstallReceiptPath) {
  Assert-NoReparseDescendants $HomeRoot
  $runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $HomeRoot "runtime")).TrimEnd('\')
  $receiptFull = [System.IO.Path]::GetFullPath($UninstallReceiptPath)
  $records = @()
  foreach ($file in Get-ChildItem -LiteralPath $HomeRoot -File -Force -Recurse -ErrorAction Stop) {
    $full = [System.IO.Path]::GetFullPath($file.FullName)
    $runtimePrefix = $runtimeRoot + [System.IO.Path]::DirectorySeparatorChar
    if ($full.StartsWith($runtimePrefix, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    if ([StringComparer]::OrdinalIgnoreCase.Equals($full, $receiptFull)) { continue }
    $records += [ordered]@{
      path = Get-RelativeForwardPath $HomeRoot $full
      sha256 = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
      bytes = $file.Length
    }
  }
  $records = @($records | Sort-Object -Property path)
  $json = $records | ConvertTo-Json -Depth 5 -Compress
  if ($null -eq $json) { $json = "[]" }
  return [ordered]@{
    fileCount = $records.Count
    fingerprintSha256 = Get-TextSha256 $json
  }
}

function Get-ConversationHeadSnapshot([string]$HomeRoot) {
  $conversationRoot = Join-Path $HomeRoot "conversations"
  if (-not (Test-Path -LiteralPath $conversationRoot -PathType Container)) {
    return [ordered]@{ count = 0; fingerprintSha256 = Get-TextSha256 "[]" }
  }
  $records = @()
  foreach ($file in Get-ChildItem -LiteralPath $conversationRoot -Filter "head.json" -File -Force -Recurse -ErrorAction Stop) {
    if (($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "conversation head evidence is a reparse entry: $($file.FullName)"
    }
    $records += [ordered]@{
      path = Get-RelativeForwardPath $HomeRoot $file.FullName
      sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  $records = @($records | Sort-Object -Property path)
  $json = $records | ConvertTo-Json -Depth 4 -Compress
  if ($null -eq $json) { $json = "[]" }
  return [ordered]@{ count = $records.Count; fingerprintSha256 = Get-TextSha256 $json }
}

function Read-InstallReceiptMachineBlock([string]$ReceiptPath) {
  if (-not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) {
    throw "The accepted Frontdoor install receipt is required before uninstall-preserve: $ReceiptPath"
  }
  $item = Get-Item -LiteralPath $ReceiptPath -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "The install receipt must be a regular non-reparse file"
  }
  $raw = Get-Content -LiteralPath $ReceiptPath -Raw
  $match = [regex]::Match($raw, 'BEGIN-INSTALL-RECEIPT-JSON\s*(.*?)\s*END-INSTALL-RECEIPT-JSON', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $match.Success) { throw "The install receipt machine block is missing" }
  return ($match.Groups[1].Value | ConvertFrom-Json)
}

function Stop-ExactQualifiedRuntime([string]$HomeRoot) {
  $modelPath = Join-Path $HomeRoot "config\model.json"
  if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) {
    return [ordered]@{ disposition = "NO_MODEL_CONFIGURATION"; pid = 0 }
  }
  $model = Get-Content -LiteralPath $modelPath -Raw | ConvertFrom-Json
  $pid = 0
  try { $pid = [int]$model.runtimePid } catch { $pid = 0 }
  if ($pid -le 0) { return [ordered]@{ disposition = "NO_OWNED_RUNTIME_PID"; pid = 0 } }
  $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $pid) -ErrorAction SilentlyContinue
  if ($null -eq $process) { return [ordered]@{ disposition = "ALREADY_STOPPED"; pid = $pid } }
  $commandLine = [string]$process.CommandLine
  $processName = [string]$process.Name
  if (($processName -ne "llama-server.exe") -or
      [string]::IsNullOrWhiteSpace($commandLine) -or
      $commandLine.IndexOf($HomeRoot, [System.StringComparison]::OrdinalIgnoreCase) -lt 0 -or
      $commandLine.IndexOf("--host 127.0.0.1", [System.StringComparison]::OrdinalIgnoreCase) -lt 0 -or
      $commandLine.IndexOf("--port 18080", [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "Configured runtime PID is active but is not the exact qualified VexLife loopback runtime; refusing to stop it"
  }
  Stop-Process -Id $pid -ErrorAction Stop
  return [ordered]@{ disposition = "EXACT_QUALIFIED_RUNTIME_STOPPED"; pid = $pid }
}

function Invoke-UninstallPreserveContinuity {
  $resolvedHomeInput = $VexHome
  if ([string]::IsNullOrWhiteSpace($resolvedHomeInput)) { $resolvedHomeInput = Join-Path $HOME ".vexlife" }
  $homeRoot = Assert-CanonicalDirectory $resolvedHomeInput "Vex Home"
  $repoRoot = Assert-CanonicalDirectory $Root "VexLife source root"
  $recoveryRoot = Assert-CanonicalDirectory (Join-Path $homeRoot "recovery") "Vex Home recovery directory"
  $installReceiptPath = Assert-PathWithin $homeRoot (Join-Path $recoveryRoot "install-receipt.txt") "install receipt"
  $uninstallReceiptPath = Assert-PathWithin $homeRoot (Join-Path $recoveryRoot "uninstall-preserve-receipt.json") "uninstall receipt"
  $machine = Read-InstallReceiptMachineBlock $installReceiptPath

  if ([string]::IsNullOrWhiteSpace([string]$machine.vexHome.path) -or
      -not [StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFullPath([string]$machine.vexHome.path).TrimEnd('\'), $homeRoot.TrimEnd('\'))) {
    throw "Install receipt Vex Home identity does not match the requested canonical Home"
  }
  if ([string]::IsNullOrWhiteSpace([string]$machine.repo.root) -or
      -not [StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFullPath([string]$machine.repo.root).TrimEnd('\'), $repoRoot.TrimEnd('\'))) {
    throw "Install receipt source root does not match this exact VexLife source root"
  }

  $homeIdentityPath = Assert-PathWithin $homeRoot (Join-Path $homeRoot "config\home.json") "Home identity"
  if (-not (Test-Path -LiteralPath $homeIdentityPath -PathType Leaf)) { throw "Canonical Home identity is missing" }
  $homeIdentityBefore = (Get-FileHash -LiteralPath $homeIdentityPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $protectedBefore = Get-ProtectedHomeSnapshot $homeRoot $uninstallReceiptPath
  $headsBefore = Get-ConversationHeadSnapshot $homeRoot

  $serverDisposition = "ALREADY_STOPPED"
  $serverPid = 0
  if ($null -ne $machine.server.pid) {
    try { $serverPid = [int]$machine.server.pid } catch { $serverPid = 0 }
  }
  if ($serverPid -gt 0) {
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $serverPid) -ErrorAction SilentlyContinue
    if ($null -ne $process) {
      $serverScript = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "scripts\serve-browser.mjs"))
      $commandLine = [string]$process.CommandLine
      $processName = [string]$process.Name
      if (($processName -ne "node.exe" -and $processName -ne "node") -or
          [string]::IsNullOrWhiteSpace($commandLine) -or
          $commandLine.IndexOf($serverScript, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "Install receipt PID is active but is not the exact Frontdoor-owned VexLife browser process; refusing to stop it"
      }
      Stop-Process -Id $serverPid -ErrorAction Stop
      $serverDisposition = "EXACT_FRONTDOOR_SERVER_STOPPED"
    }
  }

  $qualifiedRuntime = Stop-ExactQualifiedRuntime $homeRoot
  $removedRuntimeArtifacts = @()
  foreach ($relative in @("runtime/serve-browser.log", "runtime/serve-browser.err.log")) {
    $candidate = Assert-PathWithin $homeRoot (Join-Path $homeRoot ($relative.Replace('/', '\'))) "runtime artifact"
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $item = Get-Item -LiteralPath $candidate -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.PSIsContainer) {
      throw "Setup-owned runtime artifact is not one regular non-reparse file: $candidate"
    }
    Remove-Item -LiteralPath $candidate -Force -ErrorAction Stop
    $removedRuntimeArtifacts += $relative
  }

  $homeIdentityAfter = (Get-FileHash -LiteralPath $homeIdentityPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $protectedAfter = Get-ProtectedHomeSnapshot $homeRoot $uninstallReceiptPath
  $headsAfter = Get-ConversationHeadSnapshot $homeRoot
  $continuityPreserved = (
    $homeIdentityBefore -eq $homeIdentityAfter -and
    $protectedBefore.fingerprintSha256 -eq $protectedAfter.fingerprintSha256 -and
    $protectedBefore.fileCount -eq $protectedAfter.fileCount -and
    $headsBefore.fingerprintSha256 -eq $headsAfter.fingerprintSha256 -and
    $headsBefore.count -eq $headsAfter.count
  )

  $state = "UNINSTALL_PRESERVE_CONTINUITY_COMPLETED"
  if ($serverDisposition -eq "ALREADY_STOPPED" -and $qualifiedRuntime.disposition -eq "ALREADY_STOPPED" -and $removedRuntimeArtifacts.Count -eq 0) {
    $state = "ALREADY_UNINSTALLED_PRESERVE_CONTINUITY"
  }
  if (-not $continuityPreserved) { $state = "UNINSTALL_RUNTIME_REMOVED_CONTINUITY_MISMATCH" }

  $receipt = [ordered]@{
    schemaVersion = "vexlife.uninstall-preserve-receipt/v1"
    marker = "[VXG RealForever]"
    routeRef = "route.vexlife.windows.uninstall-preserve-continuity.001"
    actionClass = "UNINSTALL_PRESERVE_CONTINUITY"
    state = $state
    platform = "windows"
    formedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    source = [ordered]@{
      repoRootSha256 = Get-TextSha256 $repoRoot.ToLowerInvariant()
      sourcePackageDisposition = "PRESERVED_USER_MANAGED_SOURCE"
      sourcePackageRemoved = $false
    }
    Home = [ordered]@{
      canonicalPathSha256 = Get-TextSha256 $homeRoot.ToLowerInvariant()
      identitySha256Before = $homeIdentityBefore
      identitySha256After = $homeIdentityAfter
      protectedFileCountBefore = $protectedBefore.fileCount
      protectedFileCountAfter = $protectedAfter.fileCount
      protectedFingerprintBefore = $protectedBefore.fingerprintSha256
      protectedFingerprintAfter = $protectedAfter.fingerprintSha256
      continuityPreserved = $continuityPreserved
      localDataDeleted = $false
      MemoryPreserved = $true
      recoveryMaterialPreserved = $true
      modelArtifactsPreserved = $true
    }
    conversationHeads = [ordered]@{
      countBefore = $headsBefore.count
      countAfter = $headsAfter.count
      fingerprintBefore = $headsBefore.fingerprintSha256
      fingerprintAfter = $headsAfter.fingerprintSha256
      preserved = ($headsBefore.count -eq $headsAfter.count -and $headsBefore.fingerprintSha256 -eq $headsAfter.fingerprintSha256)
    }
    runtime = [ordered]@{
      serverDisposition = $serverDisposition
      serverPid = $serverPid
      qualifiedRuntimeDisposition = $qualifiedRuntime.disposition
      qualifiedRuntimePid = $qualifiedRuntime.pid
      removedArtifacts = @($removedRuntimeArtifacts)
      boundedArtifactSet = @("runtime/serve-browser.log", "runtime/serve-browser.err.log")
    }
    authority = [ordered]@{
      destructiveLocalDataRemovalAvailable = $false
      HomeDeletionAuthority = $false
      MemoryDeletionAuthority = $false
      modelArtifactRemoval = $false
      uninstallReceiptGrantsDestructiveAuthority = $false
    }
  }

  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $uninstallReceiptPath -Encoding UTF8
  Write-Host ("VexLife uninstall-preserve receipt: " + $uninstallReceiptPath)
  Write-Host ("State: " + $state)
  Write-Host "The Vex Home, lineage, conversation heads, Memory, recovery material and model artifacts were not selected for deletion."
  Write-Host "UNINSTALL_AND_REMOVE_LOCAL_DATA is a separate destructive authority class and is not available from this route."
  if (-not $continuityPreserved) { exit 17 }
  exit 0
}

if ($Operation -eq "uninstall-preserve") {
  Invoke-UninstallPreserveContinuity
}

$resolvedHomeInput = $VexHome
if ([string]::IsNullOrWhiteSpace($resolvedHomeInput)) { $resolvedHomeInput = Join-Path $HOME ".vexlife" }
$resolvedHomeInput = [System.IO.Path]::GetFullPath($resolvedHomeInput)

$ArgsList = @("$Root/scripts/bootstrap.mjs", "--device-name", $DeviceName)
if ($VexHome -ne "") { $ArgsList += @("--home", $resolvedHomeInput) }
& node @ArgsList
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3) { exit $LASTEXITCODE }

$initArgs = @("$Root/scripts/initialize-vex.mjs", "--home", $resolvedHomeInput)
$candidateProfileRef = [string]$env:VEXLIFE_CANDIDATE_PROFILE_REF
$candidateAuthorityRef = [string]$env:VEXLIFE_CANDIDATE_AUTHORITY_REF
if (-not [string]::IsNullOrWhiteSpace($candidateProfileRef) -or -not [string]::IsNullOrWhiteSpace($candidateAuthorityRef)) {
  if ([string]::IsNullOrWhiteSpace($candidateProfileRef) -or [string]::IsNullOrWhiteSpace($candidateAuthorityRef)) {
    throw "Internal candidate qualification requires both VEXLIFE_CANDIDATE_PROFILE_REF and VEXLIFE_CANDIDATE_AUTHORITY_REF"
  }
  $initArgs += @("--mode", "candidate-qualification", "--profile-ref", $candidateProfileRef, "--candidate-authority-ref", $candidateAuthorityRef)
}
& node @initArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$modelConfigPath = Join-Path $resolvedHomeInput "config\model.json"
if (-not (Test-Path -LiteralPath $modelConfigPath -PathType Leaf)) { throw "Qualified model configuration was not written" }
$modelConfig = Get-Content -LiteralPath $modelConfigPath -Raw | ConvertFrom-Json
if ([string]$modelConfig.state -ne "BOUND_QUALIFIED") { throw "Vex model binding is not BOUND_QUALIFIED" }
if ([string]::IsNullOrWhiteSpace([string]$modelConfig.endpoint) -or [string]::IsNullOrWhiteSpace([string]$modelConfig.requestModel)) {
  throw "Qualified model configuration is incomplete"
}
$endpointUri = [Uri]([string]$modelConfig.endpoint)
if ($endpointUri.Scheme -ne "http" -or $endpointUri.Host -ne "127.0.0.1") { throw "Qualified model endpoint must remain numeric loopback" }

$env:VEXLIFE_HOME = $resolvedHomeInput
$env:VEXLIFE_COMPANION_ENDPOINT = [string]$modelConfig.endpoint
$env:VEXLIFE_COMPANION_MODEL = [string]$modelConfig.requestModel
$env:VEXLIFE_OPERATIONAL_PROFILE_REF = [string]$modelConfig.profileRef
& node "$Root/scripts/serve-browser.mjs"
# [VXG RealForever]
