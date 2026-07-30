param(
  [string]$DeviceName = $env:COMPUTERNAME,
  [string]$Home = ""
)
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ArgsList = @("$Root/scripts/bootstrap.mjs", "--device-name", $DeviceName)
if ($Home -ne "") { $ArgsList += @("--home", $Home) }
& node @ArgsList
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3) { exit $LASTEXITCODE }
& node "$Root/scripts/serve-browser.mjs"
# [VXG RealForever]
