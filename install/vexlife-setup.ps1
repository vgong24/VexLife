#requires -Version 5.1
<#
  VexLife zero-context setup (Windows)

  What this script does, in plain words:
    1. Checks that Node.js 20 or newer is on this PC (offers to install it, with your permission).
    2. Finds the VexLife folder (the extracted repository).
    3. Asks where Vex should keep its home (default: a folder called .vexlife in your user folder).
    4. Runs the VexLife bootstrap, which creates Vex's home. If Vex already has a home there,
       bootstrap leaves it in place without deleting, moving, or migrating it; setup then continues.
    5. Asks ONE optional question about model weights. Skipping is fine and safe.
    6. Starts the local VexLife page and opens it in your browser.
    7. Writes a plain-English receipt next to Vex's own bootstrap receipt.

  This script downloads nothing except, with your explicit permission:
    - Node.js itself (via winget), if it is missing.
    - The VexLife source zip, only if you ran this script without the repository present
      (that only works once the repository is public).
    - A model artifact, only if you say yes and supply a URL plus a SHA-256 checksum,
      a source reference and a license reference. VexLife never downloads model weights
      without a checksum and those references.
#>
param(
  # Optional: full path to the extracted VexLife folder, if auto-detection fails.
  [string]$RepoRoot = "",
  # Optional: full path for Vex's home. Leave empty to be asked (default is ~/.vexlife).
  [string]$VexHome = ""
)

$ErrorActionPreference = "Stop"
$script:StartedUtc = (Get-Date).ToUniversalTime().ToString("o")
$script:InstallPort = 18110
$script:InstallUrl = "http://127.0.0.1:18110"

# ---------- small helpers ----------

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
  return ($answer.Trim().ToLowerInvariant() -eq "y" -or $answer.Trim().ToLowerInvariant() -eq "yes")
}

function Get-NodeMajorVersion {
  try {
    $v = (& node --version 2>$null)
  } catch {
    return $null
  }
  if ($v -match '^v(\d+)\.') { return [int]$Matches[1] }
  return $null
}

function Get-NodeVersionString {
  try { return ((& node --version 2>$null) + "").Trim() } catch { return $null }
}

function Find-RepoRoot([string]$StartDir) {
  if ([string]::IsNullOrWhiteSpace($StartDir)) { return $null }
  $dir = $StartDir
  while (-not [string]::IsNullOrWhiteSpace($dir)) {
    if (Test-Path (Join-Path $dir "scripts\bootstrap.mjs")) { return $dir }
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  return $null
}

function Wait-ForLocalPort([int]$Port, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
      $ok = $async.AsyncWaitHandle.WaitOne(500)
      if ($ok -and $client.Connected) { $client.EndConnect($async); $client.Close(); return $true }
      $client.Close()
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  return $false
}

# ---------- step 1: Node.js ----------

Write-Step "Checking for Node.js 20 or newer"
$nodeSource = "preinstalled"
$nodeMajor = Get-NodeMajorVersion
if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
  if ($null -eq $nodeMajor) {
    Write-Host "Node.js is not installed on this PC. VexLife needs Node.js 20 or newer to run."
  } else {
    Write-Host ("This PC has Node.js v" + $nodeMajor + ", but VexLife needs Node.js 20 or newer.")
  }
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($null -ne $winget) {
    Write-Host ""
    Write-Host "I can install it for you with this one command (Microsoft's winget tool):"
    Write-Host "    winget install --id OpenJS.NodeJS.LTS -e --source winget"
    $ok = Read-YesNo "May I run that command now? (one-time permission)" $true
    if ($ok) {
      & winget install --id OpenJS.NodeJS.LTS -e --source winget
      if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "The Node.js install command did not finish successfully." -ForegroundColor Red
        Write-Host "You can install Node.js 20+ yourself from https://nodejs.org/ and then run this script again."
        exit 1
      }
      $nodeSource = "installed-via-winget"
      $nodeMajor = Get-NodeMajorVersion
      if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
        Write-Host ""
        Write-Host "Node.js was installed, but this window cannot see it yet (PATH refresh)." -ForegroundColor Yellow
        Write-Host "Please CLOSE this window, open a new PowerShell window, and run this script again."
        Write-Host "Nothing else is needed - Vex has not been changed."
        exit 0
      }
    } else {
      Write-Host ""
      Write-Host "No problem. Install Node.js 20 or newer from https://nodejs.org/ and run this script again."
      exit 0
    }
  } else {
    Write-Host ""
    Write-Host "This PC does not have winget, so I cannot install Node.js for you." -ForegroundColor Yellow
    Write-Host "Please install Node.js 20 or newer from https://nodejs.org/ (the LTS button is fine),"
    Write-Host "then run this script again."
    exit 0
  }
}
$nodeVersion = Get-NodeVersionString
Write-Host ("Found Node.js " + $nodeVersion + " - good.")

# ---------- step 2: find the VexLife folder ----------

Write-Step "Finding the VexLife folder"
$repoObtainedVia = "unknown"
$repoDownloadUrl = $null
if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
  if (-not (Test-Path $RepoRoot)) {
    Write-Host ("The folder you gave me does not exist: " + $RepoRoot) -ForegroundColor Red
    exit 1
  }
  $RepoRoot = (Resolve-Path $RepoRoot).Path
  if (-not (Test-Path (Join-Path $RepoRoot "scripts\bootstrap.mjs"))) {
    Write-Host ("The folder you gave me does not look like VexLife: " + $RepoRoot) -ForegroundColor Red
    Write-Host "I expected to find scripts\bootstrap.mjs inside it."
    exit 1
  }
  $repoObtainedVia = "parameter"
} else {
  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $candidates += $PSScriptRoot }
  $candidates += (Get-Location).Path
  foreach ($c in $candidates) {
    $found = Find-RepoRoot $c
    if ($null -ne $found) { $RepoRoot = $found; break }
  }
  if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
    $repoObtainedVia = "found-near-script"
  }
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  Write-Host "I could not find the VexLife folder next to this script or in the current folder."
  Write-Host ""
  Write-Host "This can happen when the script is run by itself (not from an extracted VexLife zip)."
  Write-Host "Once the VexLife repository is PUBLIC, I can download it for you. If the repository"
  Write-Host "is still private, please download the zip from the repository page (Code -> Download ZIP),"
  Write-Host "extract it, and run this script from inside the extracted folder."
  $ok = Read-YesNo "Try to download the VexLife source now? (only works once the repository is public)" $false
  if (-not $ok) {
    Write-Host "Stopping. Nothing was installed or changed."
    exit 0
  }
  $repoDownloadUrl = "https://codeload.github.com/vgong24/VexLife/zip/refs/heads/main"
  $zipPath = Join-Path $env:TEMP ("vexlife-main-" + [Guid]::NewGuid().ToString("N") + ".zip")
  $extractParent = $HOME
  try {
    Write-Host ("Downloading " + $repoDownloadUrl + " ...")
    Invoke-WebRequest -Uri $repoDownloadUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "Extracting..."
    Expand-Archive -Path $zipPath -DestinationPath $extractParent -Force
  } catch {
    Write-Host ""
    Write-Host "The download did not work. Most likely the repository is still private." -ForegroundColor Red
    Write-Host "Download the zip from the repository page (Code -> Download ZIP), extract it,"
    Write-Host "and run this script from inside the extracted folder."
    exit 1
  } finally {
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }
  }
  $RepoRoot = Join-Path $extractParent "VexLife-main"
  if (-not (Test-Path (Join-Path $RepoRoot "scripts\bootstrap.mjs"))) {
    Write-Host ("The downloaded archive did not contain what I expected at " + $RepoRoot) -ForegroundColor Red
    exit 1
  }
  $repoObtainedVia = "downloaded-zip"
  Write-Host ("VexLife source is now at: " + $RepoRoot)
}
Write-Host ("VexLife folder: " + $RepoRoot)

# ---------- step 3: choose Vex's home ----------

Write-Step "Choosing where Vex lives (VexHome)"
$defaultHome = Join-Path $HOME ".vexlife"
$vexHomeDefaultUsed = $true
if ([string]::IsNullOrWhiteSpace($VexHome)) {
  Write-Host "By default, Vex keeps its home (memories, settings, receipts) outside the VexLife folder. You may choose another path."
  $VexHome = Read-WithDefault "Where should Vex's home be? Press Enter for the default" $defaultHome
}
$VexHome = [System.IO.Path]::GetFullPath($VexHome)
if ($VexHome -ne [System.IO.Path]::GetFullPath($defaultHome)) { $vexHomeDefaultUsed = $false }
Write-Host ("VexHome: " + $VexHome)

# ---------- step 4: bootstrap ----------

Write-Step "Creating Vex's home (bootstrap)"
$bootstrapArgs = @((Join-Path $RepoRoot "scripts\bootstrap.mjs"), "--device-name", $env:COMPUTERNAME)
if (-not $vexHomeDefaultUsed) {
  $bootstrapArgs += @("--home", $VexHome)
}
& node @bootstrapArgs
$bootstrapExit = $LASTEXITCODE
$bootstrapOutcome = "FAILED"
if ($bootstrapExit -eq 0) {
  $bootstrapOutcome = "CREATED_NEW_HOME"
  Write-Host "Vex's home was created."
} elseif ($bootstrapExit -eq 3) {
  $bootstrapOutcome = "EXISTING_HOME_PRESERVED"
  Write-Host ""
  Write-Host "Vex already has a home here. Bootstrap left it in place; setup is resuming without deleting, moving, or migrating it." -ForegroundColor Yellow
  Write-Host "(Setup may add or refresh its own runtime logs and install receipt inside this Home.)"
} else {
  Write-Host ""
  Write-Host ("Bootstrap stopped with exit code " + $bootstrapExit + ".") -ForegroundColor Red
  Write-Host "Vex's home could not be set up. The message above is the exact reason."
  Write-Host "Nothing else was started. You can fix the cause and run this script again - it is safe to re-run."
  exit $bootstrapExit
}

# ---------- step 5: optional model provisioning ----------

Write-Step "Model weights (optional - skipping is completely fine)"
if ($bootstrapOutcome -eq "EXISTING_HOME_PRESERVED") {
  Write-Host "This existing Home's prior model configuration was left in place. This setup run has not established whether a model endpoint or artifact is already configured."
} else {
  Write-Host "This freshly created Home starts with its AI model UNCONFIGURED."
}
Write-Host "No model weights ever ship with VexLife or this installer. A model artifact downloaded by this setup is stored only as PROVISIONED_INACTIVE (present, verified, not activated)."
Write-Host ""
Write-Host "If you already have a download URL plus its SHA-256 checksum, source reference and"
Write-Host "license reference, I can fetch and verify one model file now. I will never download"
Write-Host "model weights without a checksum and those references."
$modelChoice = "no"
$modelState = "UNCONFIGURED"
if ($bootstrapOutcome -eq "EXISTING_HOME_PRESERVED") { $modelState = "EXISTING_HOME_MODEL_STATE_UNINSPECTED" }
$provisionExit = $null
$provUrl = $null; $provSha = $null; $provName = $null; $provSourceRef = $null; $provLicenseRef = $null
$provRuntime = $null; $provHardware = $null
$wantProvision = Read-YesNo "Provision a model artifact now?" $false
if ($wantProvision) {
  $modelChoice = "yes"
  $provUrl = ((Read-Host "Model download URL (must start with https://)") + "").Trim()
  $provSha = ((Read-Host "Expected SHA-256 checksum (64 hex characters)") + "").Trim().ToLowerInvariant()
  $urlName = ""
  if ($provUrl -match '/([^/?#]+)$') { $urlName = $Matches[1] }
  if ([string]::IsNullOrWhiteSpace($urlName)) { $urlName = "local-model.gguf" }
  $provName = Read-WithDefault "File name to store it as" $urlName
  $provSourceRef = ((Read-Host "Source reference (where this artifact came from, e.g. source.model.example)") + "").Trim()
  $provLicenseRef = ((Read-Host "License reference (e.g. license.model.example)") + "").Trim()
  $provRuntime = Read-WithDefault "Runtime family (e.g. llama.cpp)" "llama.cpp"
  $provHardware = Read-WithDefault "Hardware profile reference" "hardware.local-device"
  $shaOk = ($provSha -match '^[0-9a-f]{64}$')
  $urlOk = ($provUrl -match '^https://')
  if (-not $shaOk -or -not $urlOk -or [string]::IsNullOrWhiteSpace($provSourceRef) -or [string]::IsNullOrWhiteSpace($provLicenseRef)) {
    Write-Host ""
    Write-Host "That information was incomplete or not in the right shape, so I am NOT downloading anything." -ForegroundColor Yellow
    if ($bootstrapOutcome -eq "EXISTING_HOME_PRESERVED") {
      Write-Host "No model artifact was downloaded by this setup run. This existing Home's prior model configuration remains in place and unclassified by this run. You can provision a new model artifact later with scripts\provision-model.mjs."
    } else {
      Write-Host "No model artifact was downloaded. This fresh Home remains UNCONFIGURED. You can provision a model later with scripts\provision-model.mjs."
    }
    $modelState = "SKIPPED_INCOMPLETE_INPUT"
  } else {
    $provArgs = @((Join-Path $RepoRoot "scripts\provision-model.mjs"),
      "--url", $provUrl, "--sha256", $provSha, "--name", $provName,
      "--source-ref", $provSourceRef, "--license-ref", $provLicenseRef,
      "--runtime-family", $provRuntime, "--hardware-profile", $provHardware,
      "--home", $VexHome)
    & node @provArgs
    $provisionExit = $LASTEXITCODE
    if ($provisionExit -eq 0) {
      $modelState = "PROVISIONED_INACTIVE"
      Write-Host ""
      Write-Host "Model file downloaded, checksum verified, and stored as PROVISIONED_INACTIVE."
      Write-Host "That means: present and verified, NOT activated."
    } else {
      $modelState = "PROVISION_FAILED"
      Write-Host ""
      Write-Host ("Model provisioning did not succeed (exit code " + $provisionExit + ").") -ForegroundColor Red
      if ($bootstrapOutcome -eq "EXISTING_HOME_PRESERVED") {
        Write-Host "Provisioning did not complete. This setup run still does not classify the existing Home's prior model configuration; review the exact error above before retrying."
      } else {
        Write-Host "Provisioning did not complete, so this fresh Home remains UNCONFIGURED. Review the exact error above before retrying."
      }
      Write-Host "Setup will continue."
    }
  }
} else {
  if ($bootstrapOutcome -eq "EXISTING_HOME_PRESERVED") {
    Write-Host "Skipping. This setup leaves the existing Home's model configuration in place; this run does not classify it as UNCONFIGURED."
  } else {
    Write-Host "Skipping. This fresh Home remains UNCONFIGURED until you or your Home Node supplies a model."
  }
}

# ---------- step 6: start the browser server and open it ----------

Write-Step "Starting VexLife in your browser"
$runtimeDir = Join-Path $VexHome "runtime"
if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null }
$serverLogOut = Join-Path $runtimeDir "serve-browser.log"
$serverLogErr = Join-Path $runtimeDir "serve-browser.err.log"
$serverScript = Join-Path $RepoRoot "scripts\serve-browser.mjs"
$serverProc = Start-Process -FilePath "node" -ArgumentList ('"' + $serverScript + '"') `
  -WorkingDirectory $RepoRoot -PassThru `
  -RedirectStandardOutput $serverLogOut -RedirectStandardError $serverLogErr
$serverPid = $serverProc.Id
$serverUp = Wait-ForLocalPort -Port $script:InstallPort -Seconds 15
$serverProc.Refresh()
$serverAlive = (-not $serverProc.HasExited)
$serverPidStatus = "running"
if (-not $serverAlive) { $serverPidStatus = "exited" }
$browserOpened = $false
if ($serverUp -and -not $serverAlive) {
  Write-Host ("Something is already answering at " + $script:InstallUrl + " - a VexLife server may already be running.")
  Write-Host ("(The new server process I started exited; see " + $serverLogErr + ".) Opening your browser to the running one.")
  Start-Process $script:InstallUrl
  $browserOpened = $true
  $serverPidStatus = "exited-port-already-in-use"
} elseif ($serverUp) {
  Write-Host ("VexLife is being served at " + $script:InstallUrl)
  Write-Host "Opening your browser now..."
  Start-Process $script:InstallUrl
  $browserOpened = $true
} else {
  Write-Host ""
  Write-Host ("The local server did not come up within 15 seconds (PID " + $serverPid + ").") -ForegroundColor Yellow
  Write-Host ("Check the log: " + $serverLogErr)
  Write-Host ("You can try opening " + $script:InstallUrl + " yourself in a moment.")
}

# ---------- step 7: receipt ----------

Write-Step "Writing your receipt"
$finishedUtc = (Get-Date).ToUniversalTime().ToString("o")
$recoveryDir = Join-Path $VexHome "recovery"
if (-not (Test-Path $recoveryDir)) { New-Item -ItemType Directory -Path $recoveryDir -Force | Out-Null }
$receiptPath = Join-Path $recoveryDir "install-receipt.txt"

$modelLine = "Fresh Home model state: UNCONFIGURED; this setup run provisioned no model artifact."
if ($bootstrapOutcome -eq "EXISTING_HOME_PRESERVED") {
  $modelLine = "Existing Home model state: left in place and not established by this setup run; this run provisioned no model artifact."
}
if ($modelState -eq "PROVISIONED_INACTIVE") {
  $modelLine = ("Model weights: one file was downloaded, checksum-verified and stored as PROVISIONED_INACTIVE (present, not activated). SHA-256: " + $provSha)
} elseif ($modelState -eq "PROVISION_FAILED") {
  if ($bootstrapOutcome -eq "EXISTING_HOME_PRESERVED") {
    $modelLine = ("Model provisioning did not complete (exit code " + $provisionExit + "); this setup run does not classify the existing Home's prior model configuration. This receipt does not claim that no artifact bytes remain; review the provisioning error before retrying.")
  } else {
    $modelLine = ("Model provisioning did not complete (exit code " + $provisionExit + "); this fresh Home remains UNCONFIGURED. This receipt does not claim that no artifact bytes remain; review the provisioning error before retrying.")
  }
} elseif ($modelState -eq "SKIPPED_INCOMPLETE_INPUT") {
  if ($bootstrapOutcome -eq "EXISTING_HOME_PRESERVED") {
    $modelLine = "Model provisioning was requested but the details were incomplete; this setup run downloaded no new model artifact and did not classify the existing Home's prior model configuration."
  } else {
    $modelLine = "Model provisioning was requested but the details were incomplete; no model artifact was downloaded and this fresh Home remains UNCONFIGURED."
  }
}

$bootstrapLine = "Vex's home was created fresh."
if ($bootstrapOutcome -eq "EXISTING_HOME_PRESERVED") {
  $bootstrapLine = "Vex already had a home here. Bootstrap did not delete, move, migrate, or rewrite the existing bootstrap receipt (exit code 3 = preserve and resume). Setup then continued in place and may have added or refreshed setup-owned runtime logs and this install receipt."
}

$serverLine = ("The local VexLife page is running at " + $script:InstallUrl + " (server process id " + $serverPid + ") and your browser was opened to it.")
if ($serverUp -and -not $serverAlive) {
  $serverLine = ("Port 18110 was already answering (a VexLife server is likely already running from before); the new server process (" + $serverPid + ") exited, and your browser was opened to the running one.")
}
if (-not $serverUp) {
  $serverLine = ("The local server was started (process id " + $serverPid + ") but did not answer within 15 seconds. Try opening " + $script:InstallUrl + " yourself; the log is at " + $serverLogErr + ".")
}

$human = @"
==============================================================
VexLife setup receipt (plain English)
==============================================================
When: $script:StartedUtc  (finished: $finishedUtc)

WHAT HAPPENED
- Node.js $nodeVersion was found ($nodeSource).
- VexLife folder used: $RepoRoot ($repoObtainedVia).
- $bootstrapLine
- $modelLine
- $serverLine

WHERE VEX LIVES
- VexHome: $VexHome
- Vex's own bootstrap receipt: $recoveryDir\bootstrap-receipt.json
  (note: on a preserved existing home, VexLife does not rewrite that receipt)
- This receipt: $receiptPath

MODEL STATE
- $modelState
- Model weights never ship inside VexLife or this installer.

DREAM SYNC
- Dream sync is manual, on your command. Nothing in this setup (or in
  VexLife today) runs dream sync automatically.

TO START VEX NEXT TIME
- Easiest: run this setup script again (it does not delete, move, or automatically migrate an existing Home; setup-owned logs and this install receipt may be refreshed).
- Or run start-vexlife.ps1 in the VexLife folder, then open
  $($script:InstallUrl) yourself (that launcher does not open the browser for you).

TO STOP VEX
- Run:  Stop-Process -Id $serverPid
- (That stops the local page server. Vex's home stays exactly as it is.)

TIP
- You can ask Vex to summarize this receipt.
==============================================================
"@

$machine = [ordered]@{
  schemaVersion = "vextreme.install-receipt/v0"
  marker = "[VXG RealForever]"
  timestamps = [ordered]@{ startedUtc = $script:StartedUtc; finishedUtc = $finishedUtc }
  platform = [ordered]@{
    os = "windows"
    powershell = $PSVersionTable.PSVersion.ToString()
    computerName = $env:COMPUTERNAME
  }
  node = [ordered]@{
    version = $nodeVersion
    source = $nodeSource
    wingetCommand = "winget install --id OpenJS.NodeJS.LTS -e --source winget"
  }
  repo = [ordered]@{
    root = $RepoRoot
    obtainedVia = $repoObtainedVia
    downloadUrl = $repoDownloadUrl
  }
  vexHome = [ordered]@{
    path = $VexHome
    defaultUsed = $vexHomeDefaultUsed
    passedAsFlag = (-not $vexHomeDefaultUsed)
  }
  bootstrap = [ordered]@{
    exitCode = $bootstrapExit
    outcome = $bootstrapOutcome
    existingHomePolicy = "PRESERVE_AND_CLASSIFY"
    migrationFlowImplemented = $false
    bootstrapReceiptPath = (Join-Path $recoveryDir "bootstrap-receipt.json")
    bootstrapReceiptRewrittenOnPreserve = $false
  }
  model = [ordered]@{
    provisionOffered = $true
    userChoice = $modelChoice
    state = $modelState
    stateScope = "SETUP_OBSERVATION_OR_PROVISIONING_OUTCOME"
    existingHomePriorStateInspected = $false
    provisionExitCode = $provisionExit
    sha256 = $provSha
    sourceRef = $provSourceRef
    licenseRef = $provLicenseRef
    name = $provName
    runtimeFamily = $provRuntime
    hardwareProfileRef = $provHardware
    weightsShipInRepoOrInstaller = $false
  }
  dreamSync = [ordered]@{
    mode = "manual"
    automatic = $false
    note = "dream sync: manual, on your command"
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
  exitCodes = [ordered]@{
    bootstrap = $bootstrapExit
    provisionModel = $provisionExit
  }
  unknowns = @(
    "whether the server kept running after this script exited (check the url or the pid)",
    "license/source reference contents (references were recorded, not verified)"
  )
}

$machineJson = $machine | ConvertTo-Json -Depth 8
$machineBlock = @"

---------------- machine block (for Vex and tools) ----------------
BEGIN-INSTALL-RECEIPT-JSON
$machineJson
END-INSTALL-RECEIPT-JSON
[VXG RealForever]
"@

Set-Content -Path $receiptPath -Value ($human + $machineBlock) -Encoding UTF8
Write-Host ("Receipt written: " + $receiptPath)
Write-Host ""
Write-Host "All done. Vex is set up and (if all went well) open in your browser." -ForegroundColor Green
Write-Host "Keep this window or close it - the server keeps running until you stop it."
exit 0

# [VXG RealForever]
