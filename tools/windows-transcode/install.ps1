param(
  [string]$InstallRoot = "D:\ConstantsHub-Worker",
  [string]$WorkRoot = "D:\ConstantsHub-Transcode",
  [string]$MediaRoot = "\\192.168.0.15\video"
)
$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force $InstallRoot,$WorkRoot | Out-Null
$worker = Join-Path $InstallRoot 'worker.ps1'
if (!(Test-Path -LiteralPath $worker)) { throw "worker.ps1 must already exist at $worker" }
if (!(Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'FFmpeg is not available in PATH.' }
if (!(Test-Path -LiteralPath $MediaRoot)) { throw "NAS media share is unavailable: $MediaRoot" }

$nvenc = (& ffmpeg -hide_banner -encoders 2>&1 | Out-String)
if ($nvenc -notmatch 'h264_nvenc') { throw 'h264_nvenc is not available.' }

Unblock-File -LiteralPath $worker -ErrorAction SilentlyContinue
$taskName = 'Constants Hub Overnight Converter'
$arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File `"$worker`" -MediaRoot `"$MediaRoot`" -WorkRoot `"$WorkRoot`" -StartHour 0 -EndHour 7 -IdleMinutes 15"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$midnightSafetyTrigger = New-ScheduledTaskTrigger -Daily -At 12:00AM
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -WakeToRun `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 10 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger @($startupTrigger,$logonTrigger,$midnightSafetyTrigger) `
  -Settings $settings `
  -Description 'Constants Hub always-on CAZ-PC media conversion listener. Conversion work still follows overnight/idle rules unless Convert Now is requested.' `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Host "Installed and started: $taskName"
Write-Host "Worker: $worker"
Write-Host "Temp: $WorkRoot"
Write-Host 'The listener now starts at Windows startup/logon, retries after crashes, and stays alive so the website controls are one-click.'
Write-Host 'Conversion still follows midnight-7AM idle rules unless the site enables a daytime override.'
