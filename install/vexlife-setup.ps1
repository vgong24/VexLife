#requires -Version 5.1
<#
  VexLife guided setup (Windows)

  Normal-user path:
    Node.js -> exact local source -> Vex Home bootstrap/preserve -> release-qualified
    Vex operational profile -> verified local runtime/model -> loopback browser companion.

  The setup never asks the user to choose model URLs, hashes, runtimes or license refs.
  Those belong to the source-managed operational profile. Candidate qualification can be
  enabled only by internal relay environment bindings and is not a documented user route.
#>
param(
  [string]$RepoRoot = "",
  [string]$VexHome = ""
)

$ErrorActionPreference = "Stop"
$script:StartedUtc = (Get-Date).ToUniversalTime().ToString("o")
$script:InstallPort = 18110
$script:InstallUrl = "http://127.0.0.1:18110"

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host ("== " + $Text) -ForegroundColor Cyan
}

function Read-WithDefault([string]$Question, [string]$DefaultValue) {
  $answer = Read-Host ($Question + " [" + $DefaultValue + "]")
  if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultValue }
  return $answer.Trim()
}

function Read-YesNo([string]$Question, [bool]$DefaultYes) {
  $hint = "y/N"
  if ($DefaultYes) { $hint = "Y/n" }
  $answer = Read-Host ($Question + " [" + $hint + "]")
  if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
  $normalized = $answer.Trim().ToLowerInvariant()
  return ($normalized -eq "y" -or $normalized -eq "yes")
}

function Get-NodeMajorVersion {
  try { $v = ((& node --version 2>$null) + "").Trim() } catch { return $null }
  if ($v -match '^v(\d+)\.') { return [int]$Matches[1] }
  return $null
}

function Get-NodeVersionString {
  try { return ((& node --version 2>$null) + "").Trim() } catch { return $null }
}

function Find-RepoRoot([string]$StartDir) {
  if ([string]::IsNullOrWhiteSpace($StartDir)) { return $null }
  $dir = [System.IO.Path]::GetFullPath($StartDir)
  while (-not [string]::IsNullOrWhiteSpace($dir)) {
    if ((Test-Path -LiteralPath (Join-Path $dir "scripts\bootstrap.mjs") -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $dir "scripts\initialize-vex.mjs") -PathType Leaf)) {
      return $dir
    }
    $parent = Split-Path -Parent $dir
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $dir) { break }
    $dir = $parent
  }
  return $null
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

function Read-InstallReceiptMachineBlock([string]$ReceiptPath) {
  if (-not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) { return $null }
  try {
    $raw = Get-Content -LiteralPath $ReceiptPath -Raw
    $match = [regex]::Match($raw, 'BEGIN-INSTALL-RECEIPT-JSON\s*(.*?)\s*END-INSTALL-RECEIPT-JSON', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $match.Success) { return $null }
    return ($match.Groups[1].Value | ConvertFrom-Json)
  } catch { return $null }
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

Write-Step "Checking Node.js 20 or newer"
$nodeSource = "preinstalled"
$nodeMajor = Get-NodeMajorVersion
if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($null -eq $winget) {
    Write-Host "VexLife needs Node.js 20 or newer. Install the current Node.js LTS release, then run setup again." -ForegroundColor Yellow
    exit 1
  }
  Write-Host "Node.js 20+ is missing. I can install the LTS release using Microsoft's winget."
  if (-not (Read-YesNo "May I install Node.js LTS now?" $true)) {
    Write-Host "Stopping before any Vex Home or model/runtime change."
    exit 0
  }
  & winget install --id OpenJS.NodeJS.LTS -e --source winget
  if ($LASTEXITCODE -ne 0) { throw "Node.js installation did not complete successfully" }
  $nodeSource = "installed-via-winget"
  $nodeMajor = Get-NodeMajorVersion
  if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
    Write-Host "Node.js was installed, but this PowerShell window cannot see the refreshed PATH yet." -ForegroundColor Yellow
    Write-Host "Close this window, open a new PowerShell window, and run the same setup command again."
    exit 0
  }
}
$nodeVersion = Get-NodeVersionString
Write-Host ("Found " + $nodeVersion + ".")

Write-Step "Finding the exact VexLife folder"
if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Find-RepoRoot $RepoRoot
} else {
  $RepoRoot = Find-RepoRoot $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = Find-RepoRoot (Get-Location).Path }
}
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  Write-Host "I could not find a complete VexLife source folder containing scripts\bootstrap.mjs and scripts\initialize-vex.mjs." -ForegroundColor Red
  Write-Host "Use the repository's Download ZIP, extract it, open PowerShell in that folder, and run setup again."
  exit 1
}
$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
Write-Host ("VexLife folder: " + $RepoRoot)

Write-Step "Choosing Vex Home"
$defaultHome = Join-Path $HOME ".vexlife"
if ([string]::IsNullOrWhiteSpace($VexHome)) {
  $VexHome = Read-WithDefault "Where should Vex live? Press Enter for the default" $defaultHome
}
$VexHome = [System.IO.Path]::GetFullPath($VexHome)
Write-Host ("Vex Home: " + $VexHome)

Write-Step "Establishing or preserving Vex Home"
$bootstrapArgs = @((Join-Path $RepoRoot "scripts\bootstrap.mjs"), "--device-name", $env:COMPUTERNAME, "--home", $VexHome)
& node @bootstrapArgs
$bootstrapExit = $LASTEXITCODE
$bootstrapOutcome = "FAILED"
if ($bootstrapExit -eq 0) {
  $bootstrapOutcome = "CREATED_NEW_HOME"
} elseif ($bootstrapExit -eq 3) {
  $bootstrapOutcome = "EXISTING_HOME_PRESERVED"
  Write-Host "Existing Vex Home preserved; setup will not delete, move, or automatically migrate it." -ForegroundColor Yellow
} else {
  Write-Host ("Bootstrap stopped with exit code " + $bootstrapExit + ".") -ForegroundColor Red
  exit $bootstrapExit
}

Write-Step "Preparing Vex's verified local model"
$candidateProfileRef = [string]$env:VEXLIFE_CANDIDATE_PROFILE_REF
$candidateAuthorityRef = [string]$env:VEXLIFE_CANDIDATE_AUTHORITY_REF
$internalCandidate = (-not [string]::IsNullOrWhiteSpace($candidateProfileRef) -or -not [string]::IsNullOrWhiteSpace($candidateAuthorityRef))
if ($internalCandidate -and ([string]::IsNullOrWhiteSpace($candidateProfileRef) -or [string]::IsNullOrWhiteSpace($candidateAuthorityRef))) {
  throw "Internal candidate qualification requires both VEXLIFE_CANDIDATE_PROFILE_REF and VEXLIFE_CANDIDATE_AUTHORITY_REF"
}

$runtimeConsent = $false
if ($internalCandidate -and [string]$env:VEXLIFE_SETUP_RUNTIME_CONSENT -eq "GRANTED_BY_QUALIFIED_RELAY") {
  $runtimeConsent = $true
} else {
  Write-Host "VexLife will use the current source-managed operational profile. It may download several GB,"
  Write-Host "verify every artifact by SHA-256, and start a local-only model runtime on 127.0.0.1."
  Write-Host "You do not need to choose a model URL, checksum, runtime, or license."
  $runtimeConsent = Read-YesNo "Continue with the verified local model/runtime?" $true
}
if (-not $runtimeConsent) {
  Write-Host "Stopping before model/runtime download. Vex Home remains preserved."
  exit 0
}

$initArgs = @((Join-Path $RepoRoot "scripts\initialize-vex.mjs"), "--home", $VexHome, "--yes")
if ($internalCandidate) {
  $initArgs += @("--mode", "candidate-qualification", "--profile-ref", $candidateProfileRef, "--candidate-authority-ref", $candidateAuthorityRef)
}
& node @initArgs
$initializeExit = $LASTEXITCODE
if ($initializeExit -ne 0) {
  Write-Host ("Vex model/runtime initialization stopped safely with exit code " + $initializeExit + ".") -ForegroundColor Red
  Write-Host "The browser will not start without a BOUND_QUALIFIED local model configuration."
  exit $initializeExit
}

$modelConfigPath = Join-Path $VexHome "config\model.json"
if (-not (Test-Path -LiteralPath $modelConfigPath -PathType Leaf)) { throw "Qualified model configuration was not written" }
$modelConfig = Get-Content -LiteralPath $modelConfigPath -Raw | ConvertFrom-Json
if ([string]$modelConfig.state -ne "BOUND_QUALIFIED") { throw "Vex model configuration is not BOUND_QUALIFIED" }
if ([string]::IsNullOrWhiteSpace([string]$modelConfig.profileRef) -or
    [string]::IsNullOrWhiteSpace([string]$modelConfig.endpoint) -or
    [string]::IsNullOrWhiteSpace([string]$modelConfig.requestModel)) {
  throw "Qualified model configuration is incomplete"
}
$endpointUri = [Uri]([string]$modelConfig.endpoint)
if ($endpointUri.Scheme -ne "http" -or $endpointUri.Host -ne "127.0.0.1") { throw "Qualified companion endpoint must be numeric loopback" }

Write-Step "Starting the local VexLife browser"
$runtimeDir = Join-Path $VexHome "runtime"
if (-not (Test-Path -LiteralPath $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null }
$recoveryDir = Join-Path $VexHome "recovery"
if (-not (Test-Path -LiteralPath $recoveryDir)) { New-Item -ItemType Directory -Path $recoveryDir -Force | Out-Null }
$receiptPath = Join-Path $recoveryDir "install-receipt.txt"
$browserProcessReceiptPath = Join-Path $recoveryDir "browser-process.json"
$serverScript = Join-Path $RepoRoot "scripts\serve-browser.mjs"
$serverLogOut = Join-Path $runtimeDir "serve-browser.log"
$serverLogErr = Join-Path $runtimeDir "serve-browser.err.log"

$env:VEXLIFE_HOME = $VexHome
$env:VEXLIFE_COMPANION_ENDPOINT = [string]$modelConfig.endpoint
$env:VEXLIFE_COMPANION_MODEL = [string]$modelConfig.requestModel
$env:VEXLIFE_OPERATIONAL_PROFILE_REF = [string]$modelConfig.profileRef

$serverPid = 0
$serverPidStatus = "not-started"
$serverOwnerToken = ""
$serverProcessInstanceRef = ""
$serverUp = Test-LocalPort $script:InstallPort 500
$ownedBeforeStart = Get-OwnedBrowserServer $browserProcessReceiptPath $RepoRoot $VexHome
if ($serverUp) {
  if ($null -eq $ownedBeforeStart) {
    throw "Something is already answering at $($script:InstallUrl), but setup cannot prove it is the exact current VexLife browser process. Refusing to reuse or stop it."
  }
  $serverPid = [int]$ownedBeforeStart.pid
  $serverOwnerToken = [string]$ownedBeforeStart.ownerToken
  $serverProcessInstanceRef = [string]$ownedBeforeStart.processInstanceRef
  $serverPidStatus = "reused-exact-current-process-instance"
} elseif ($null -ne $ownedBeforeStart) {
  if (-not (Wait-ForLocalPort -Port $script:InstallPort -Seconds 5)) {
    throw "The exact current VexLife browser process is active but is not answering on its bounded loopback port; refusing duplicate start"
  }
  $serverUp = $true
  $serverPid = [int]$ownedBeforeStart.pid
  $serverOwnerToken = [string]$ownedBeforeStart.ownerToken
  $serverProcessInstanceRef = [string]$ownedBeforeStart.processInstanceRef
  $serverPidStatus = "reused-exact-current-process-instance"
} else {
  $startedBrowser = Start-OwnedBrowserServer $browserProcessReceiptPath $RepoRoot $VexHome $serverScript $serverLogOut $serverLogErr
  $serverPid = [int]$startedBrowser.pid
  $serverOwnerToken = [string]$startedBrowser.ownerToken
  $serverProcessInstanceRef = [string]$startedBrowser.processInstanceRef
  $serverUp = Wait-ForLocalPort -Port $script:InstallPort -Seconds 15
  $startedBrowser.process.Refresh()
  if ($startedBrowser.process.HasExited) { $serverPidStatus = "exited" } else { $serverPidStatus = "running-exact-current-process-instance" }
  if (-not $serverUp) {
    if (-not $startedBrowser.process.HasExited) { Stop-Process -Id $serverPid -ErrorAction SilentlyContinue }
    Set-BrowserProcessReceiptStopped $browserProcessReceiptPath "START_FAILED"
    throw "The VexLife browser server did not answer within 15 seconds. See $serverLogErr"
  }
}
Start-Process $script:InstallUrl
$browserOpened = $true
Write-Host ("VexLife is ready at " + $script:InstallUrl) -ForegroundColor Green

Write-Step "Writing the setup receipt"
$finishedUtc = (Get-Date).ToUniversalTime().ToString("o")
$human = @"
==============================================================
VexLife setup receipt
==============================================================
When: $script:StartedUtc  (finished: $finishedUtc)

WHAT HAPPENED
- Node.js $nodeVersion was available ($nodeSource).
- VexLife source: $RepoRoot
- Vex Home: $VexHome
- Bootstrap: $bootstrapOutcome
- Local model binding: BOUND_QUALIFIED
- Operational profile: $($modelConfig.profileRef)
- Companion endpoint: $($modelConfig.endpoint)
- Browser: $($script:InstallUrl)

No model URL, checksum, runtime package, or license choice was delegated to you.
The source-managed operational profile supplied those exact inputs and the initializer
verified them before browser startup.

TO START VEX NEXT TIME
- Run start-vexlife.cmd, or:
  powershell -ExecutionPolicy Bypass -File .\start-vexlife.ps1

TO UNINSTALL THE RUNNING PRODUCT WHILE PRESERVING VEX HOME
- powershell -ExecutionPolicy Bypass -File .\start-vexlife.ps1 -Operation uninstall-preserve -Home "$VexHome"

The uninstall-preserve route does not delete Vex Home, Memory, conversations, Score,
recovery material, or model artifacts.
==============================================================
"@

$machine = [ordered]@{
  schemaVersion = "vextreme.install-receipt/v1"
  marker = "[VXG RealForever]"
  timestamps = [ordered]@{ startedUtc = $script:StartedUtc; finishedUtc = $finishedUtc }
  platform = [ordered]@{ os = "windows"; powershell = $PSVersionTable.PSVersion.ToString(); computerName = $env:COMPUTERNAME }
  node = [ordered]@{ version = $nodeVersion; source = $nodeSource }
  repo = [ordered]@{ root = $RepoRoot; obtainedVia = "user-supplied-source-folder" }
  vexHome = [ordered]@{ path = $VexHome; existingHomePolicy = "PRESERVE_AND_CLASSIFY" }
  bootstrap = [ordered]@{ exitCode = $bootstrapExit; outcome = $bootstrapOutcome; migrationFlowImplemented = $false }
  model = [ordered]@{
    state = [string]$modelConfig.state
    profileRef = [string]$modelConfig.profileRef
    endpoint = [string]$modelConfig.endpoint
    requestModel = [string]$modelConfig.requestModel
    activeArtifactRef = [string]$modelConfig.activeArtifactRef
    runtimeDependencyRef = [string]$modelConfig.runtimeDependencyRef
    runtimePid = $modelConfig.runtimePid
    qualificationReceiptRef = [string]$modelConfig.qualificationReceiptRef
    userSelectedArtifactPlumbing = $false
  }
  server = [ordered]@{
    url = $script:InstallUrl
    pid = $serverPid
    pidStatus = $serverPidStatus
    respondedWithin15s = $serverUp
    browserOpened = $browserOpened
    stdoutLog = $serverLogOut
    stderrLog = $serverLogErr
    browserProcessReceipt = $browserProcessReceiptPath
    processInstanceRef = $serverProcessInstanceRef
    ownerToken = $serverOwnerToken
    stopCommand = ("Use start-vexlife.ps1 -Operation uninstall-preserve for exact-owned stop; current PID " + $serverPid)
  }
  exitCodes = [ordered]@{ bootstrap = $bootstrapExit; initializeVex = $initializeExit }
  effects = [ordered]@{
    repositoryWrite = $false
    publicEffect = $false
    MemoryCanonicalWrite = $false
    training = $false
    companionNetwork = "NUMERIC_LOOPBACK_ONLY"
  }
}

$machineJson = $machine | ConvertTo-Json -Depth 8
$machineBlock = @"

---------------- machine block (for Vex and tools) ----------------
BEGIN-INSTALL-RECEIPT-JSON
$machineJson
END-INSTALL-RECEIPT-JSON
[VXG RealForever]
"@

Set-Content -LiteralPath $receiptPath -Value ($human + $machineBlock) -Encoding UTF8
Write-Host ("Receipt written: " + $receiptPath)
Write-Host "Setup complete." -ForegroundColor Green
exit 0

# [VXG RealForever]
