param(
  [string]$InstallRoot = "D:\ConstantsHub-Worker",
  [string]$WorkRoot = "D:\ConstantsHub-Transcode",
  [string]$MediaRoot = "\\192.168.0.15\video"
)
$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force $InstallRoot,$WorkRoot | Out-Null
$worker = Join-Path $InstallRoot 'worker.ps1'
$sourceWorker = Join-Path $PSScriptRoot 'worker.ps1'
$sourceMaintenance = Join-Path $PSScriptRoot 'maintenance.ps1'
if (!(Test-Path -LiteralPath $sourceWorker)) { throw "worker.ps1 is missing beside install.ps1: $sourceWorker" }
if (([IO.Path]::GetFullPath($sourceWorker)) -ne ([IO.Path]::GetFullPath($worker))) {
  Copy-Item -LiteralPath $sourceWorker -Destination $worker -Force
}
if (Test-Path -LiteralPath $sourceMaintenance) {
  $maintenance = Join-Path $InstallRoot 'maintenance.ps1'
  if (([IO.Path]::GetFullPath($sourceMaintenance)) -ne ([IO.Path]::GetFullPath($maintenance))) {
    Copy-Item -LiteralPath $sourceMaintenance -Destination $maintenance -Force
  }
}
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
Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $taskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
Write-Host "Installed and started: $taskName"
Write-Host "Worker: $worker"
Write-Host "Temp: $WorkRoot"
Write-Host "Task state: $($task.State)"
Write-Host "Last task result: $($taskInfo.LastTaskResult)"
Write-Host 'The listener now starts at Windows startup/logon, retries after crashes, and stays alive so the website controls are one-click.'
Write-Host 'Conversion still follows midnight-7AM idle rules unless the site enables a daytime override.'
