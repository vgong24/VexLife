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

function Test-LocalPort([int]$Port, [int]$TimeoutMilliseconds = 500) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne($TimeoutMilliseconds)
    if ($ok -and $client.Connected) {
      $client.EndConnect($async)
      $client.Close()
      return $true
    }
    $client.Close()
  } catch {}
  return $false
}

function Wait-ForLocalPort([int]$Port, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalPort $Port 500) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function ConvertTo-ProcessIdentity([string]$Value) {
  return ([string]$Value).Replace('/', '\').Trim().Trim('"').ToLowerInvariant()
}

function Split-ProcessCommandLine([string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return @() }
  return @([regex]::Matches($CommandLine, '"[^"]*"|\S+') | ForEach-Object { $_.Value.Trim('"') })
}

function ConvertTo-QuotedProcessArgument([string]$Value) {
  if ([string]$Value -match '"') { throw "Process identity argument contains an unsupported quote" }
  return '"' + [string]$Value + '"'
}

function Read-BrowserProcessReceipt([string]$ReceiptPath) {
  if (-not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) { return $null }
  $item = Get-Item -LiteralPath $ReceiptPath -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Browser process receipt must be a regular non-reparse file" }
  try { return (Get-Content -LiteralPath $ReceiptPath -Raw | ConvertFrom-Json) }
  catch { throw "Browser process receipt is not valid JSON" }
}

function Write-BrowserProcessReceipt([string]$ReceiptPath, [string]$RepoPath, [string]$HomePath, [string]$NodeExecutablePath, [string]$ServerScriptPath, [int]$ProcessId, [string]$OwnerToken, [string]$State = "RUNNING") {
  $parent = Split-Path -Parent $ReceiptPath
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $receipt = [ordered]@{
    schemaVersion = "vexlife.browser-process-receipt/v1"
    state = $State
    processInstanceRef = ("browser-process." + $OwnerToken)
    ownerToken = $OwnerToken
    pid = $ProcessId
    nodeExecutablePath = [System.IO.Path]::GetFullPath($NodeExecutablePath)
    serverScriptPath = [System.IO.Path]::GetFullPath($ServerScriptPath)
    vexHomePath = [System.IO.Path]::GetFullPath($HomePath)
    repoRootPath = [System.IO.Path]::GetFullPath($RepoPath)
    formedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  }
  $temporary = $ReceiptPath + ".partial-" + [Guid]::NewGuid().ToString("N")
  $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -LiteralPath $temporary -Destination $ReceiptPath -Force
  return $receipt
}

function Set-BrowserProcessReceiptStopped([string]$ReceiptPath, [string]$Disposition) {
  $receipt = Read-BrowserProcessReceipt $ReceiptPath
  if ($null -eq $receipt) { return }
  $receipt.state = $Disposition
  $receipt | Add-Member -NotePropertyName stoppedAtUtc -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
  $temporary = $ReceiptPath + ".partial-" + [Guid]::NewGuid().ToString("N")
  $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -LiteralPath $temporary -Destination $ReceiptPath -Force
}

function Get-OwnedBrowserServer([string]$ReceiptPath, [string]$RepoPath, [string]$HomePath) {
  $receipt = Read-BrowserProcessReceipt $ReceiptPath
  if ($null -eq $receipt -or [string]$receipt.state -ne "RUNNING") { return $null }
  if ([string]$receipt.schemaVersion -ne "vexlife.browser-process-receipt/v1") { throw "Browser process receipt schema is not current" }
  $repoIdentity = [System.IO.Path]::GetFullPath($RepoPath).TrimEnd('\')
  $homeIdentity = [System.IO.Path]::GetFullPath($HomePath).TrimEnd('\')
  $scriptIdentity = [System.IO.Path]::GetFullPath((Join-Path $repoIdentity "scripts\serve-browser.mjs"))
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFullPath([string]$receipt.repoRootPath).TrimEnd('\'), $repoIdentity)) { throw "Browser process receipt repo identity does not match this source root" }
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFullPath([string]$receipt.vexHomePath).TrimEnd('\'), $homeIdentity)) { throw "Browser process receipt Home identity does not match this Vex Home" }
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFullPath([string]$receipt.serverScriptPath), $scriptIdentity)) { throw "Browser process receipt script identity does not match this source" }
  $ownedPid = 0
  try { $ownedPid = [int]$receipt.pid } catch { $ownedPid = 0 }
  $ownerToken = ([string]$receipt.ownerToken).ToLowerInvariant()
  if ($ownedPid -le 0 -or $ownerToken -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { throw "Browser process receipt identity is incomplete" }
  $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $ownedPid) -ErrorAction SilentlyContinue
  if ($null -eq $process) { return $null }
  $tokens = Split-ProcessCommandLine ([string]$process.CommandLine)
  $expected = @(
    [System.IO.Path]::GetFullPath([string]$receipt.nodeExecutablePath),
    $scriptIdentity,
    "--vexlife-browser-owner-token", $ownerToken,
    "--vexlife-home", $homeIdentity,
    "--vexlife-repo", $repoIdentity
  )
  $matched = ($tokens.Count -eq $expected.Count)
  if ($matched) {
    for ($index = 0; $index -lt $expected.Count; $index++) {
      if ((ConvertTo-ProcessIdentity ([string]$tokens[$index])) -ne (ConvertTo-ProcessIdentity ([string]$expected[$index]))) { $matched = $false; break }
    }
  }
  $processName = ([string]$process.Name).ToLowerInvariant()
  $actualExecutablePath = [System.IO.Path]::GetFullPath([string]$process.ExecutablePath)
  $expectedExecutablePath = [System.IO.Path]::GetFullPath([string]$receipt.nodeExecutablePath)
  if (($processName -ne "node.exe" -and $processName -ne "node") -or -not [StringComparer]::OrdinalIgnoreCase.Equals($actualExecutablePath, $expectedExecutablePath) -or -not $matched) {
    throw "Browser receipt PID is active but does not prove the exact Home/repo/process instance; refusing reuse or stop"
  }
  return [ordered]@{ pid = $ownedPid; process = $process; ownerToken = $ownerToken; processInstanceRef = [string]$receipt.processInstanceRef }
}

function Start-OwnedBrowserServer([string]$ReceiptPath, [string]$RepoPath, [string]$HomePath, [string]$ServerScriptPath, [string]$StdoutPath, [string]$StderrPath) {
  $nodeCommand = Get-Command node -ErrorAction Stop
  $nodeExecutablePath = [System.IO.Path]::GetFullPath([string]$nodeCommand.Source)
  $ownerToken = [Guid]::NewGuid().ToString("D").ToLowerInvariant()
  $arguments = @(
    [System.IO.Path]::GetFullPath($ServerScriptPath),
    "--vexlife-browser-owner-token", $ownerToken,
    "--vexlife-home", [System.IO.Path]::GetFullPath($HomePath),
    "--vexlife-repo", [System.IO.Path]::GetFullPath($RepoPath)
  )
  $argumentLine = ($arguments | ForEach-Object { ConvertTo-QuotedProcessArgument ([string]$_) }) -join ' '
  $process = Start-Process -FilePath $nodeExecutablePath -ArgumentList $argumentLine -WorkingDirectory $RepoPath -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
  $receipt = Write-BrowserProcessReceipt $ReceiptPath $RepoPath $HomePath $nodeExecutablePath $ServerScriptPath $process.Id $ownerToken
  return [ordered]@{ pid = $process.Id; process = $process; ownerToken = $ownerToken; processInstanceRef = [string]$receipt.processInstanceRef }
}

function Get-ExactQualifiedRuntimeOwnership([string]$HomeRoot, [string]$RepoRoot) {
  $modelPath = Assert-PathWithin $HomeRoot (Join-Path $HomeRoot "config\model.json") "qualified model configuration"
  if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) { return [ordered]@{ disposition = "NO_MODEL_CONFIGURATION"; pid = 0 } }
  $modelItem = Get-Item -LiteralPath $modelPath -Force
  if (($modelItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Qualified model configuration must be a regular non-reparse file" }
  $model = Get-Content -LiteralPath $modelPath -Raw | ConvertFrom-Json
  $runtimePid = 0
  try { $runtimePid = [int]$model.runtimePid } catch { $runtimePid = 0 }
  if ($runtimePid -le 0) { return [ordered]@{ disposition = "NO_OWNED_RUNTIME_PID"; pid = 0 } }
  $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $runtimePid) -ErrorAction SilentlyContinue
  if ($null -eq $process) { return [ordered]@{ disposition = "ALREADY_STOPPED"; pid = $runtimePid } }

  $registryPath = Assert-PathWithin $RepoRoot (Join-Path $RepoRoot "blueprint\vex-operational-profiles.json") "operational profile registry"
  if (-not (Test-Path -LiteralPath $registryPath -PathType Leaf)) { throw "Operational profile registry is missing" }
  $registry = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
  $profiles = @($registry.profiles | Where-Object { [string]$_.profileRef -eq [string]$model.profileRef })
  if ($profiles.Count -ne 1) { throw "Qualified runtime profile identity is not unique in source" }
  $profile = $profiles[0]
  if ([string]$model.state -ne "BOUND_QUALIFIED" -or [string]$model.endpoint -ne [string]$profile.endpoint.origin -or [string]$model.requestModel -ne [string]$profile.endpoint.requestModel -or [string]$model.runtimeDependencyRef -ne [string]$profile.runtime.dependencyRef) {
    throw "Qualified model configuration does not match the exact source-managed profile"
  }
  $argumentTemplate = @($profile.runtime.argumentTemplate | ForEach-Object { [string]$_ })
  $requiredBoundedTail = @("--n-predict", "256", "--reasoning-budget", "128")
  if ($argumentTemplate.Count -lt $requiredBoundedTail.Count) { throw "Qualified runtime argument template is missing the bounded generation tail" }
  for ($tailIndex = 0; $tailIndex -lt $requiredBoundedTail.Count; $tailIndex++) {
    $observedTail = [string]$argumentTemplate[$argumentTemplate.Count - $requiredBoundedTail.Count + $tailIndex]
    if ($observedTail -ne [string]$requiredBoundedTail[$tailIndex]) { throw "Qualified runtime bounded generation arguments do not match the exact source contract" }
  }
  $modelArtifacts = @($profile.modelArtifacts)
  if ($modelArtifacts.Count -lt 2 -or [string]$model.activeArtifactRef -ne [string]$modelArtifacts[0].artifactRef) { throw "Qualified model/projector identity is incomplete" }
  $runtimeDirectory = Assert-PathWithin $HomeRoot (Join-Path $HomeRoot ([string]$profile.runtime.extraction.subdirectory).Replace('/', '\')) "qualified runtime directory"
  if (-not (Test-Path -LiteralPath $runtimeDirectory -PathType Container)) { throw "Qualified runtime directory is missing" }
  $executables = @(Get-ChildItem -LiteralPath $runtimeDirectory -Filter ([string]$profile.runtime.executableName) -File -Force -Recurse)
  if ($executables.Count -ne 1) { throw "Qualified runtime materialization must contain exactly one source-named executable" }
  $expectedExecutablePath = [System.IO.Path]::GetFullPath($executables[0].FullName)
  $expectedExecutableSha256 = ([string]$profile.runtime.executableSha256).ToLowerInvariant()
  $actualExecutableSha256 = (Get-FileHash -LiteralPath $expectedExecutablePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualExecutableSha256 -ne $expectedExecutableSha256) { throw "Qualified runtime executable SHA-256 does not match source" }
  $expectedModelPath = Assert-PathWithin $HomeRoot (Join-Path $HomeRoot ("models\" + [string]$modelArtifacts[0].filename)) "qualified model artifact"
  $expectedProjectorPath = Assert-PathWithin $HomeRoot (Join-Path $HomeRoot ("models\" + [string]$modelArtifacts[1].filename)) "qualified projector artifact"
  if (-not (Test-Path -LiteralPath $expectedModelPath -PathType Leaf) -or -not (Test-Path -LiteralPath $expectedProjectorPath -PathType Leaf)) { throw "Qualified model/projector artifact is missing" }

  $runtimeReceiptPath = Assert-PathWithin $HomeRoot (Join-Path $HomeRoot "runtime\initialization\receipt.json") "runtime initialization receipt"
  if (-not (Test-Path -LiteralPath $runtimeReceiptPath -PathType Leaf)) { throw "Exact runtime initialization receipt is missing" }
  $runtimeReceipt = Get-Content -LiteralPath $runtimeReceiptPath -Raw | ConvertFrom-Json
  $receiptPid = 0
  try { $receiptPid = [int]$runtimeReceipt.runtime.pid } catch { $receiptPid = 0 }
  if ([string]$runtimeReceipt.state -ne "RUNTIME_QUALIFIED" -or [string]$runtimeReceipt.profileRef -ne [string]$profile.profileRef -or $receiptPid -ne $runtimePid -or [string]$runtimeReceipt.endpoint.origin -ne [string]$profile.endpoint.origin -or ([string]$runtimeReceipt.materialization.executableSha256).ToLowerInvariant() -ne $expectedExecutableSha256) {
    throw "Runtime receipt does not bind the exact qualified process materialization"
  }

  $replacements = @{
    "{MODEL_PATH}" = $expectedModelPath
    "{PROJECTOR_PATH}" = $expectedProjectorPath
    "{ENDPOINT_PORT}" = ([Uri]([string]$profile.endpoint.origin)).Port.ToString()
    "{REQUEST_MODEL}" = [string]$profile.endpoint.requestModel
  }
  $expectedArguments = @()
  foreach ($argument in $argumentTemplate) {
    $text = [string]$argument
    if ($replacements.ContainsKey($text)) { $text = [string]$replacements[$text] }
    $expectedArguments += $text
  }
  $actualTokens = Split-ProcessCommandLine ([string]$process.CommandLine)
  $expectedTokens = @($expectedExecutablePath) + $expectedArguments
  $tokensMatched = ($actualTokens.Count -eq $expectedTokens.Count)
  if ($tokensMatched) {
    for ($index = 0; $index -lt $expectedTokens.Count; $index++) {
      if ((ConvertTo-ProcessIdentity ([string]$actualTokens[$index])) -ne (ConvertTo-ProcessIdentity ([string]$expectedTokens[$index]))) { $tokensMatched = $false; break }
    }
  }
  $processName = ([string]$process.Name).ToLowerInvariant()
  $actualExecutablePath = [System.IO.Path]::GetFullPath([string]$process.ExecutablePath)
  if ($processName -ne "llama-server.exe" -or -not [StringComparer]::OrdinalIgnoreCase.Equals($actualExecutablePath, $expectedExecutablePath) -or -not $tokensMatched) {
    throw "Configured runtime PID is active but does not prove the exact executable/model/projector/loopback/bounded argument identity; refusing to stop it"
  }
  return [ordered]@{
    disposition = "EXACT_QUALIFIED_RUNTIME_OWNED"
    pid = $runtimePid
    executablePath = $expectedExecutablePath
    executableSha256 = $actualExecutableSha256
    modelPath = $expectedModelPath
    projectorPath = $expectedProjectorPath
    expectedArgumentCount = $expectedArguments.Count
  }
}

function Stop-ExactQualifiedRuntime([string]$HomeRoot, [string]$RepoRoot) {
  $runtimeOwnership = Get-ExactQualifiedRuntimeOwnership $HomeRoot $RepoRoot
  if ([string]$runtimeOwnership.disposition -ne "EXACT_QUALIFIED_RUNTIME_OWNED") { return $runtimeOwnership }
  Stop-Process -Id ([int]$runtimeOwnership.pid) -ErrorAction Stop
  return [ordered]@{ disposition = "EXACT_QUALIFIED_RUNTIME_STOPPED"; pid = [int]$runtimeOwnership.pid; executableSha256 = [string]$runtimeOwnership.executableSha256 }
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
  $browserProcessReceiptPath = Assert-PathWithin $homeRoot (Join-Path $recoveryRoot "browser-process.json") "browser process receipt"
  $ownedBrowser = Get-OwnedBrowserServer $browserProcessReceiptPath $repoRoot $homeRoot
  if ($null -ne $ownedBrowser) {
    $serverPid = [int]$ownedBrowser.pid
    Stop-Process -Id $serverPid -ErrorAction Stop
    Set-BrowserProcessReceiptStopped $browserProcessReceiptPath "STOPPED_BY_UNINSTALL_PRESERVE"
    $serverDisposition = "EXACT_CURRENT_BROWSER_PROCESS_INSTANCE_STOPPED"
  }

  $qualifiedRuntime = Stop-ExactQualifiedRuntime $homeRoot $repoRoot
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
$browserPort = 18110
$browserUrl = "http://127.0.0.1:18110"
$runtimeDirectory = Join-Path $resolvedHomeInput "runtime"
if (-not (Test-Path -LiteralPath $runtimeDirectory -PathType Container)) { New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null }
$recoveryDirectory = Join-Path $resolvedHomeInput "recovery"
if (-not (Test-Path -LiteralPath $recoveryDirectory -PathType Container)) { New-Item -ItemType Directory -Path $recoveryDirectory -Force | Out-Null }
$browserProcessReceiptPath = Join-Path $recoveryDirectory "browser-process.json"
$serverScript = Join-Path $Root "scripts\serve-browser.mjs"
$serverLogOut = Join-Path $runtimeDirectory "serve-browser.log"
$serverLogErr = Join-Path $runtimeDirectory "serve-browser.err.log"
$serverUp = Test-LocalPort $browserPort 500
$ownedBeforeStart = Get-OwnedBrowserServer $browserProcessReceiptPath $Root $resolvedHomeInput
if ($serverUp) {
  if ($null -eq $ownedBeforeStart) { throw "Something is already answering at $browserUrl, but start cannot prove exact VexLife Home/repo/process-instance ownership" }
  $serverPid = [int]$ownedBeforeStart.pid
} elseif ($null -ne $ownedBeforeStart) {
  if (-not (Wait-ForLocalPort -Port $browserPort -Seconds 5)) { throw "The exact current VexLife browser process is active but not answering; refusing duplicate start" }
  $serverPid = [int]$ownedBeforeStart.pid
} else {
  $startedBrowser = Start-OwnedBrowserServer $browserProcessReceiptPath $Root $resolvedHomeInput $serverScript $serverLogOut $serverLogErr
  $serverPid = [int]$startedBrowser.pid
  if (-not (Wait-ForLocalPort -Port $browserPort -Seconds 15)) {
    $startedBrowser.process.Refresh()
    if (-not $startedBrowser.process.HasExited) { Stop-Process -Id $serverPid -ErrorAction SilentlyContinue }
    Set-BrowserProcessReceiptStopped $browserProcessReceiptPath "START_FAILED"
    throw "The VexLife browser server did not answer within 15 seconds"
  }
}
Start-Process $browserUrl
Write-Host ("VexLife is ready at " + $browserUrl)
Write-Host ("Exact current browser process PID: " + $serverPid)
exit 0
# [VXG RealForever]
