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
$trigger = New-ScheduledTaskTrigger -Daily -At 12:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 7) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Constants Hub RTX NVENC overnight media conversion worker.' -Force | Out-Null

Write-Host "Installed: $taskName"
Write-Host "Worker: $worker"
Write-Host "Temp: $WorkRoot"
Write-Host 'The scheduled task can wake Windows from sleep. Starting from a full shutdown requires BIOS RTC wake or Wake-on-LAN.'
