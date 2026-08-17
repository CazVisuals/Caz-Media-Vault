param(
  [string]$InstallRoot = "D:\ConstantsHub-Worker",
  [string]$WorkRoot = "D:\ConstantsHub-Transcode",
  [string]$MediaRoot = "\\192.168.0.15\video",
  [string]$RepoRawBase = "https://raw.githubusercontent.com/CazVisuals/Caz-Media-Vault/agent/media-vault-foundation/tools/windows-transcode"
)
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force $InstallRoot,$WorkRoot | Out-Null
$worker = Join-Path $InstallRoot 'worker.ps1'
Invoke-WebRequest "$RepoRawBase/worker.ps1" -OutFile $worker
if (!(Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'FFmpeg is not available in PATH.' }
if (!(Test-Path -LiteralPath $MediaRoot)) { throw "NAS media share is unavailable: $MediaRoot" }
$nvenc = (& ffmpeg -hide_banner -encoders 2>&1 | Out-String)
if ($nvenc -notmatch 'h264_nvenc') { throw 'h264_nvenc is not available.' }
$taskName='Constants Hub Overnight Converter'
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$worker`" -MediaRoot `"$MediaRoot`" -WorkRoot `"$WorkRoot`" -StartHour 0 -EndHour 7 -IdleMinutes 15"
$trigger=New-ScheduledTaskTrigger -Daily -At 12:00AM
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 7) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Constant Hub RTX/NVENC overnight media conversion worker.' -Force | Out-Null
Write-Host "Installed: $taskName"
Write-Host "Worker: $worker"
Write-Host "Temp: $WorkRoot"
Write-Host 'The task is allowed to wake a sleeping PC. Power-on from a full shutdown still requires BIOS RTC wake or Wake-on-LAN.'
