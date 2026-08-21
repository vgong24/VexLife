#requires -Version 5.1
<#
  VexLife source-local windowed setup controller (Windows)

  This script is a thin WPF projection over install\vexlife-setup.ps1.
  It does not select model artifacts, implement downloads, bootstrap Home,
  start/stop Vex processes, or claim a signed/public distribution.
#>
param(
  [string]$RepoRoot = "",
  [string]$VexHome = "",
  [switch]$ProofNoEffect
)

$ErrorActionPreference = "Stop"
$script:BackendProcess = $null
$script:Timer = $null
$script:TempRoot = $null
$script:TerminalExitCode = 0

function ConvertTo-QuotedProcessArgument([string]$Value) {
  if ([string]$Value -match '"') { throw "Process argument contains an unsupported quote" }
  return '"' + [string]$Value + '"'
}

function Find-RepoRoot([string]$StartDir) {
  if ([string]::IsNullOrWhiteSpace($StartDir)) { return $null }
  $dir = [System.IO.Path]::GetFullPath($StartDir)
  while (-not [string]::IsNullOrWhiteSpace($dir)) {
    if (Test-Path -LiteralPath (Join-Path $dir "install\vexlife-setup.ps1") -PathType Leaf) { return $dir }
    $parent = Split-Path -Parent $dir
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $dir) { break }
    $dir = $parent
  }
  return $null
}

function Get-NodeMajorVersion {
  try { $v = ((& node --version 2>$null) + "").Trim() } catch { return $null }
  if ($v -match '^v(\d+)\.') { return [int]$Matches[1] }
  return $null
}

function Read-TextFileSafe([string]$Path) {
  try {
    if (Test-Path -LiteralPath $Path -PathType Leaf) { return [System.IO.File]::ReadAllText($Path) }
  } catch {}
  return ""
}

$RepoRoot = if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  Find-RepoRoot (Split-Path -Parent $PSScriptRoot)
} else {
  Find-RepoRoot $RepoRoot
}
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { throw "Could not find the VexLife source folder." }
$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)

$BackendPath = Join-Path $RepoRoot "install\vexlife-setup.ps1"
if (-not (Test-Path -LiteralPath $BackendPath -PathType Leaf)) { throw "Accepted setup backend is missing." }

if ([string]::IsNullOrWhiteSpace($VexHome)) { $VexHome = Join-Path $HOME ".vexlife" }
$VexHome = [System.IO.Path]::GetFullPath($VexHome)

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Continue with Vex" Height="650" Width="690"
        WindowStartupLocation="CenterScreen" ResizeMode="CanMinimize"
        Background="#FFF7F7F7">
  <Grid Margin="24">
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="*"/>
      <RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>

    <TextBlock Grid.Row="0" Text="Continue with Vex" FontSize="28" FontWeight="SemiBold" Margin="0,0,0,8"/>
    <TextBlock Grid.Row="1" TextWrapping="Wrap" Margin="0,0,0,18"
               Text="This source-local Windows setup uses the current release-qualified VexLife profile. Model and runtime artifacts stay external and are selected and verified by the accepted setup engine."/>

    <StackPanel Grid.Row="2" Margin="0,0,0,14">
      <TextBlock Text="Vex Home" FontWeight="SemiBold"/>
      <TextBox Name="HomePathBox" Margin="0,6,0,0" MinHeight="30"/>
      <TextBlock Margin="0,5,0,0" Foreground="#FF555555" TextWrapping="Wrap"
                 Text="Existing Vex Home is preserved and classified; this window does not delete or migrate it."/>
    </StackPanel>

    <StackPanel Grid.Row="3" Margin="0,0,0,14">
      <CheckBox Name="NodeConsentCheck" Margin="0,0,0,8"
                Content="If Node.js 20+ is missing, allow the accepted setup to install Node.js LTS with winget."/>
      <CheckBox Name="RuntimeConsentCheck"
                Content="Continue with the verified local model/runtime. This may acquire about 4.0 GiB and start a numeric-loopback-only runtime."/>
      <TextBlock Margin="20,7,0,0" Foreground="#FF555555" TextWrapping="Wrap"
                 Text="Advanced local-model changes stay separate. This setup does not ask you to choose model URLs, hashes, runtime packages, or license references."/>
    </StackPanel>

    <Border Grid.Row="4" Background="#FFFFFFFF" BorderBrush="#FFE0E0E0" BorderThickness="1" Padding="12" Margin="0,0,0,12">
      <TextBlock Name="StatusText" TextWrapping="Wrap" Text="Checking this computer..."/>
    </Border>

    <TextBox Grid.Row="5" Name="ProgressText" IsReadOnly="True" TextWrapping="Wrap"
             VerticalScrollBarVisibility="Auto" Background="#FF111111" Foreground="#FFF0F0F0"
             FontFamily="Consolas" FontSize="12" Padding="10"/>

    <StackPanel Grid.Row="6" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,16,0,0">
      <Button Name="CancelButton" Content="Not now" MinWidth="96" Margin="0,0,10,0" Padding="14,7"/>
      <Button Name="ContinueButton" Content="Continue" MinWidth="110" Padding="14,7" IsDefault="True"/>
    </StackPanel>
  </Grid>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)
$homeBox = $window.FindName("HomePathBox")
$nodeConsent = $window.FindName("NodeConsentCheck")
$runtimeConsent = $window.FindName("RuntimeConsentCheck")
$statusText = $window.FindName("StatusText")
$progressText = $window.FindName("ProgressText")
$continueButton = $window.FindName("ContinueButton")
$cancelButton = $window.FindName("CancelButton")

$homeBox.Text = $VexHome
$nodeMajor = Get-NodeMajorVersion
$wingetAvailable = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)

if ($null -ne $nodeMajor -and $nodeMajor -ge 20) {
  $nodeConsent.IsChecked = $true
  $nodeConsent.IsEnabled = $false
  $nodeConsent.Content = "Node.js 20+ is already available; no Node.js installation permission is needed."
  $statusText.Text = "Ready for your choices. No Vex Home or model/runtime effect has happened."
} elseif ($wingetAvailable) {
  $nodeConsent.IsChecked = $false
  $statusText.Text = "Node.js 20+ is not available. You can allow the accepted setup to install Node.js LTS with winget."
} else {
  $nodeConsent.IsChecked = $false
  $nodeConsent.IsEnabled = $false
  $continueButton.IsEnabled = $false
  $statusText.Text = "Node.js 20+ is not available and winget is unavailable. Install Node.js LTS, then open this setup again. Nothing was changed."
}

if ($ProofNoEffect) {
  $proof = [ordered]@{
    schemaVersion = "vexlife.windowed-setup-proof/v1"
    state = "WINDOWED_SETUP_UI_READY_NO_EFFECT"
    repoRoot = $RepoRoot
    backendPath = $BackendPath
    vexHome = $VexHome
    nodeMajor = $nodeMajor
    wingetAvailable = $wingetAvailable
    requiredControls = @("HomePathBox", "NodeConsentCheck", "RuntimeConsentCheck", "StatusText", "ProgressText", "ContinueButton", "CancelButton")
    backendInvoked = $false
    modelRuntimeEffect = $false
    homeMutationEffect = $false
  }
  Write-Output ($proof | ConvertTo-Json -Compress -Depth 4)
  exit 0
}

$cancelButton.Add_Click({
  if ($null -eq $script:BackendProcess) { $window.Close() }
})

$window.Add_Closing({
  if ($null -ne $script:BackendProcess) {
    try {
      $script:BackendProcess.Refresh()
      if (-not $script:BackendProcess.HasExited) {
        $_.Cancel = $true
        $statusText.Text = "Setup is already running through the accepted backend. Wait for it to finish before closing this window."
      }
    } catch {}
  }
})

$continueButton.Add_Click({
  try {
    $selectedHome = [string]$homeBox.Text
    if ([string]::IsNullOrWhiteSpace($selectedHome)) {
      $statusText.Text = "Choose a Vex Home before continuing."
      return
    }
    $selectedHome = [System.IO.Path]::GetFullPath($selectedHome)

    $nodeNow = Get-NodeMajorVersion
    $nodeMissing = ($null -eq $nodeNow -or $nodeNow -lt 20)
    if ($nodeMissing -and $nodeConsent.IsChecked -ne $true) {
      $statusText.Text = "Node.js installation permission was not granted. Nothing was changed."
      return
    }
    if ($runtimeConsent.IsChecked -ne $true) {
      $statusText.Text = "Model/runtime permission was not granted. Nothing was changed."
      return
    }

    $continueButton.IsEnabled = $false
    $cancelButton.IsEnabled = $false
    $homeBox.IsEnabled = $false
    $nodeConsent.IsEnabled = $false
    $runtimeConsent.IsEnabled = $false
    $statusText.Text = "Setup is running through the accepted VexLife setup engine. The browser opens only after qualification succeeds."
    $progressText.Text = "Starting source-local setup..." + [Environment]::NewLine

    $script:TempRoot = Join-Path $env:TEMP ("VexLife-WindowedSetup-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $script:TempRoot -Force | Out-Null
    $stdinPath = Join-Path $script:TempRoot "stdin.txt"
    $stdoutPath = Join-Path $script:TempRoot "stdout.txt"
    $stderrPath = Join-Path $script:TempRoot "stderr.txt"

    $inputLines = New-Object System.Collections.Generic.List[string]
    if ($nodeMissing) { $inputLines.Add("yes") }
    $inputLines.Add("yes")
    [System.IO.File]::WriteAllLines($stdinPath, $inputLines.ToArray())

    $argumentLine = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", (ConvertTo-QuotedProcessArgument $BackendPath),
      "-RepoRoot", (ConvertTo-QuotedProcessArgument $RepoRoot),
      "-VexHome", (ConvertTo-QuotedProcessArgument $selectedHome)
    ) -join " "

    $savedCandidateProfile = [string]$env:VEXLIFE_CANDIDATE_PROFILE_REF
    $savedCandidateAuthority = [string]$env:VEXLIFE_CANDIDATE_AUTHORITY_REF
    $savedRelayConsent = [string]$env:VEXLIFE_SETUP_RUNTIME_CONSENT
    $env:VEXLIFE_CANDIDATE_PROFILE_REF = ""
    $env:VEXLIFE_CANDIDATE_AUTHORITY_REF = ""
    $env:VEXLIFE_SETUP_RUNTIME_CONSENT = ""
    $script:TerminalExitCode = 1
    try {
      $script:BackendProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $argumentLine `
        -RedirectStandardInput $stdinPath -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath `
        -WindowStyle Hidden -PassThru
    } finally {
      $env:VEXLIFE_CANDIDATE_PROFILE_REF = $savedCandidateProfile
      $env:VEXLIFE_CANDIDATE_AUTHORITY_REF = $savedCandidateAuthority
      $env:VEXLIFE_SETUP_RUNTIME_CONSENT = $savedRelayConsent
    }

    $script:Timer = New-Object Windows.Threading.DispatcherTimer
    $script:Timer.Interval = [TimeSpan]::FromMilliseconds(500)
    $script:Timer.Add_Tick({
      $stdout = Read-TextFileSafe $stdoutPath
      $stderr = Read-TextFileSafe $stderrPath
      $combined = ($stdout + [Environment]::NewLine + $stderr).Trim()
      if ($combined.Length -gt 12000) { $combined = $combined.Substring($combined.Length - 12000) }
      if (-not [string]::IsNullOrWhiteSpace($combined)) {
        $progressText.Text = $combined
        $progressText.ScrollToEnd()
      }

      $script:BackendProcess.Refresh()
      if ($script:BackendProcess.HasExited) {
        $script:Timer.Stop()
        $exitCode = [int]$script:BackendProcess.ExitCode
        $script:TerminalExitCode = $exitCode
        if ($exitCode -eq 0) {
          $statusText.Text = "Setup finished safely. If qualification completed, Vex is opening in your browser."
        } else {
          $statusText.Text = "Setup stopped safely (exit code $exitCode). The details below explain the exact boundary."
        }
        $cancelButton.Content = "Close"
        $cancelButton.IsEnabled = $true
        $cancelButton.Add_Click({ $window.Close() })
      }
    })
    $script:Timer.Start()
  } catch {
    $script:TerminalExitCode = 1
    $statusText.Text = "Setup could not start: " + $_.Exception.Message
    $continueButton.IsEnabled = $true
    $cancelButton.IsEnabled = $true
  }
})

[void]$window.ShowDialog()
exit $script:TerminalExitCode

# [VXG RealForever]
