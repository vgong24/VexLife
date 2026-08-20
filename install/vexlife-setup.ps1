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

function Get-OwnedBrowserServer([string]$ReceiptPath, [string]$RepoPath, [string]$HomePath) {
  $machine = Read-InstallReceiptMachineBlock $ReceiptPath
  if ($null -eq $machine) { return $null }
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFullPath([string]$machine.repo.root).TrimEnd('\'), $RepoPath.TrimEnd('\'))) { return $null }
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFullPath([string]$machine.vexHome.path).TrimEnd('\'), $HomePath.TrimEnd('\'))) { return $null }
  $ownedPid = 0
  try { $ownedPid = [int]$machine.server.pid } catch { $ownedPid = 0 }
  if ($ownedPid -le 0) { return $null }
  $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $ownedPid) -ErrorAction SilentlyContinue
  if ($null -eq $process) { return $null }
  $serverScript = [System.IO.Path]::GetFullPath((Join-Path $RepoPath "scripts\serve-browser.mjs"))
  $commandLine = [string]$process.CommandLine
  $processName = [string]$process.Name
  $serverScriptIdentity = $serverScript.Replace('/', '\')
  $commandLineIdentity = $commandLine.Replace('/', '\')
  $commandLineTokens = @([regex]::Matches($commandLineIdentity, '"[^"]*"|\S+') | ForEach-Object { $_.Value.Trim('"') })
  $serverScriptMatched = ($commandLineTokens.Count -ge 2 -and [StringComparer]::OrdinalIgnoreCase.Equals([string]$commandLineTokens[1], $serverScriptIdentity))
  if (($processName -ne "node.exe" -and $processName -ne "node") -or
      [string]::IsNullOrWhiteSpace($commandLine) -or
      -not $serverScriptMatched) {
    return $null
  }
  return [ordered]@{ pid = $ownedPid; process = $process }
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
$serverScript = Join-Path $RepoRoot "scripts\serve-browser.mjs"
$serverLogOut = Join-Path $runtimeDir "serve-browser.log"
$serverLogErr = Join-Path $runtimeDir "serve-browser.err.log"

$env:VEXLIFE_HOME = $VexHome
$env:VEXLIFE_COMPANION_ENDPOINT = [string]$modelConfig.endpoint
$env:VEXLIFE_COMPANION_MODEL = [string]$modelConfig.requestModel
$env:VEXLIFE_OPERATIONAL_PROFILE_REF = [string]$modelConfig.profileRef

$serverPid = 0
$serverPidStatus = "not-started"
$serverUp = Test-LocalPort $script:InstallPort 500
if ($serverUp) {
  $owned = Get-OwnedBrowserServer $receiptPath $RepoRoot $VexHome
  if ($null -eq $owned) {
    throw "Something is already answering at $($script:InstallUrl), but setup cannot prove it is the exact prior VexLife browser process. Refusing to reuse or stop it."
  }
  $serverPid = [int]$owned.pid
  $serverPidStatus = "reused-owned"
} else {
  $serverProc = Start-Process -FilePath "node" -ArgumentList ('"' + $serverScript + '"') `
    -WorkingDirectory $RepoRoot -PassThru `
    -RedirectStandardOutput $serverLogOut -RedirectStandardError $serverLogErr
  $serverPid = $serverProc.Id
  $serverUp = Wait-ForLocalPort -Port $script:InstallPort -Seconds 15
  $serverProc.Refresh()
  if ($serverProc.HasExited) { $serverPidStatus = "exited" } else { $serverPidStatus = "running" }
  if (-not $serverUp) {
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
    stopCommand = ("Stop-Process -Id " + $serverPid)
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
