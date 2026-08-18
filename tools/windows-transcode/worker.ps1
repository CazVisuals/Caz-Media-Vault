param(
  [switch]$RunNow,
  [switch]$ForceWhenBusy,
  [switch]$Once,
  [string]$MediaRoot = "\\192.168.0.15\video",
  [string]$WorkRoot = "D:\ConstantsHub-Transcode",
  [int]$StartHour = 0,
  [int]$EndHour = 7,
  [int]$IdleMinutes = 15,
  [int]$GpuBusyThreshold = 65
)

$ErrorActionPreference = "Stop"
$WorkerVersion = "2026.08.18.1"
$VideoExtensions = @('.mp4','.mkv','.mov','.avi','.m4v','.webm')
$StateFile = Join-Path $WorkRoot 'worker-state.json'
$LogFile = Join-Path $WorkRoot 'worker.log'
$ControlRoot = Join-Path $MediaRoot '.constants-hub\pc-worker'
$ControlStatus = Join-Path $ControlRoot 'status.json'
$HistoryFile = Join-Path $ControlRoot 'history.json'
$LocalStopFile = Join-Path $WorkRoot 'STOP'
$LocalPauseFile = Join-Path $WorkRoot 'PAUSE'
$RemoteStopFile = Join-Path $ControlRoot 'STOP'
$RemotePauseFile = Join-Path $ControlRoot 'PAUSE'
$RemoteRunFile = Join-Path $ControlRoot 'RUN_NOW'
$RemoteEndOverrideFile = Join-Path $ControlRoot 'END_OVERRIDE'
$RemoteMaintenanceFile = Join-Path $ControlRoot 'RUN_MAINTENANCE'
$MaintenanceMarker = Join-Path $WorkRoot 'weekly-maintenance-date.txt'
$MaintenanceScript = Join-Path $PSScriptRoot 'maintenance.ps1'

New-Item -ItemType Directory -Force $WorkRoot,$ControlRoot | Out-Null
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:HeartbeatSequence = 0

function Write-Log([string]$Message) { $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"; Add-Content -Path $LogFile -Value $line; Write-Host $line }
function Write-JsonFile([string]$Path,[string]$Json) {
  $temp = "$Path.$PID.tmp"; [IO.File]::WriteAllText($temp,$Json,$Utf8NoBom)
  try { if(Test-Path -LiteralPath $Path){ [IO.File]::Replace($temp,$Path,$null,$true) } else { [IO.File]::Move($temp,$Path) } }
  catch { [IO.File]::WriteAllText($Path,$Json,$Utf8NoBom); Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
}
function Save-State([hashtable]$State) {
  $script:HeartbeatSequence++; $State.updatedAt=(Get-Date).ToString('o'); $State.computer=$env:COMPUTERNAME; $State.heartbeat=$script:HeartbeatSequence; $State.workerVersion=$WorkerVersion
  $json=$State|ConvertTo-Json -Depth 6; [IO.File]::WriteAllText($StateFile,$json,$Utf8NoBom); try { Write-JsonFile $ControlStatus $json } catch { Write-Log "WARN could not publish status: $($_.Exception.Message)" }
}
function Read-History { try { if(!(Test-Path -LiteralPath $HistoryFile)){return @()}; $raw=Get-Content -LiteralPath $HistoryFile -Raw; if([string]::IsNullOrWhiteSpace($raw)){return @()}; return @($raw|ConvertFrom-Json) } catch { return @() } }
function Update-History([hashtable]$Job) {
  try { $history=@(Read-History); $existing=$history|Where-Object {$_.id -eq $Job.id}|Select-Object -First 1; if($existing){ foreach($key in $Job.Keys){$existing|Add-Member -NotePropertyName $key -NotePropertyValue $Job[$key] -Force}; $existing|Add-Member -NotePropertyName updatedAt -NotePropertyValue ((Get-Date).ToString('o')) -Force } else { $record=[pscustomobject]$Job; $record|Add-Member -NotePropertyName updatedAt -NotePropertyValue ((Get-Date).ToString('o')) -Force; $history=@($record)+$history }; Write-JsonFile $HistoryFile ((@($history|Select-Object -First 250)|ConvertTo-Json -Depth 6)) } catch { Write-Log "WARN could not update history: $($_.Exception.Message)" }
}
function Get-IdleSeconds {
  Add-Type @"
using System; using System.Runtime.InteropServices;
public static class IdleTime { [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; } [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii); public static uint Seconds(){ LASTINPUTINFO lii=new LASTINPUTINFO(); lii.cbSize=(uint)Marshal.SizeOf(lii); GetLastInputInfo(ref lii); return ((uint)Environment.TickCount-lii.dwTime)/1000; } }
"@ -ErrorAction SilentlyContinue | Out-Null
  return [IdleTime]::Seconds()
}
function Get-GpuUtilization { try { $value=& nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>$null|Select-Object -First 1; if($LASTEXITCODE -ne 0){return 0}; return [int]($value.Trim()) } catch { return 0 } }
function Test-GpuBusy { if($ForceWhenBusy){return $false}; $samples=@(); 1..3|ForEach-Object {$samples+=Get-GpuUtilization; if($_ -lt 3){Start-Sleep -Seconds 2}}; return ($samples|Where-Object {$_ -ge $GpuBusyThreshold}).Count -eq 3 }
function In-Schedule { $hour=(Get-Date).Hour; if($StartHour -lt $EndHour){return $hour -ge $StartHour -and $hour -lt $EndHour}; return $hour -ge $StartHour -or $hour -lt $EndHour }
function Get-Probe([string]$Path) { $json=& ffprobe -v error -show_entries format=format_name:stream=index,codec_type,codec_name,pix_fmt -of json -- "$Path"; if($LASTEXITCODE -ne 0){throw "ffprobe failed for $Path"}; return $json|ConvertFrom-Json }
function Get-Mode([string]$Path) { $probe=Get-Probe $Path; $video=$probe.streams|Where-Object codec_type -eq 'video'|Select-Object -First 1; $audio=$probe.streams|Where-Object codec_type -eq 'audio'|Select-Object -First 1; $ext=[IO.Path]::GetExtension($Path).ToLowerInvariant(); $videoOk=$video -and $video.codec_name -eq 'h264' -and (!$video.pix_fmt -or $video.pix_fmt -eq 'yuv420p'); $audioOk=!$audio -or $audio.codec_name -eq 'aac'; if($ext -eq '.mp4' -and $videoOk -and $audioOk){return 'skip'}; if($videoOk -and $audioOk){return 'remux'}; if($videoOk){return 'audio'}; return 'transcode' }
function Test-Output([string]$Path) { $probe=Get-Probe $Path; $video=$probe.streams|Where-Object codec_type -eq 'video'|Select-Object -First 1; $audio=$probe.streams|Where-Object codec_type -eq 'audio'|Select-Object -First 1; return $video -and $video.codec_name -eq 'h264' -and (!$video.pix_fmt -or $video.pix_fmt -eq 'yuv420p') -and (!$audio -or $audio.codec_name -eq 'aac') }
function Get-Candidates { Get-ChildItem -LiteralPath $MediaRoot -Recurse -File -ErrorAction SilentlyContinue|Where-Object { if($VideoExtensions -notcontains $_.Extension.ToLowerInvariant()){return $false}; if($_.FullName -like "$MediaRoot\.constants-hub\*"){return $false}; if($_.Name -like '* - NVENC TEST.mp4' -or $_.Name -like '* - NVENC LOCAL TEST.mp4'){return $false}; if($_.Extension.ToLowerInvariant() -ne '.mp4'){ $sameNameMp4=Join-Path $_.DirectoryName (([IO.Path]::GetFileNameWithoutExtension($_.Name))+'.mp4'); if(Test-Path -LiteralPath $sameNameMp4){return $false} }; return $true }|Sort-Object LastWriteTime }
function Quote-ProcessArgument([string]$Value) { if($null -eq $Value){return '""'}; return '"'+($Value -replace '(\\*)"','$1$1\"' -replace '(\\+)$','$1$1')+'"' }
function Invoke-FfmpegWithHeartbeat([string[]]$Arguments,[hashtable]$State) {
  $psi=New-Object System.Diagnostics.ProcessStartInfo; $psi.FileName='ffmpeg.exe'; $psi.Arguments=(($Arguments|ForEach-Object {Quote-ProcessArgument $_}) -join ' '); $psi.UseShellExecute=$false; $psi.CreateNoWindow=$false; $process=New-Object System.Diagnostics.Process; $process.StartInfo=$psi; if(!$process.Start()){throw 'Could not start ffmpeg.exe'}
  try { while(!$process.WaitForExit(3000)){Save-State $State}; $process.WaitForExit(); $exitCode=[int]$process.ExitCode; if($exitCode -ne 0){throw "ffmpeg exited with code $exitCode"} } finally { if(!$process.HasExited){try{$process.Kill()}catch{}}; $process.Dispose() }
}
function Convert-One([IO.FileInfo]$File,[bool]$OverrideActive) {
  $mode=Get-Mode $File.FullName; if($mode -eq 'skip'){return $false}; $relative=$File.FullName.Substring($MediaRoot.Length).TrimStart('\'); $relativeDir=Split-Path $relative -Parent; $baseName=[IO.Path]::GetFileNameWithoutExtension($File.Name); $tempDir=Join-Path $WorkRoot ([Guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Force $tempDir|Out-Null; $tempOutput=Join-Path $tempDir "$baseName.mp4"; $destDir=if($relativeDir){Join-Path $MediaRoot $relativeDir}else{$MediaRoot}; $dest=Join-Path $destDir "$baseName.mp4"; $archiveDir=if($relativeDir){Join-Path $MediaRoot (Join-Path '.constants-hub\originals' $relativeDir)}else{Join-Path $MediaRoot '.constants-hub\originals'}; New-Item -ItemType Directory -Force $archiveDir|Out-Null; if(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue; return $false}
  $jobId=[Guid]::NewGuid().ToString('N'); Update-History @{id=$jobId;source=$File.FullName;output=$dest;mode=$mode;status='converting';startedAt=(Get-Date).ToString('o')}; $active=@{status='converting';source=$File.FullName;mode=$mode;temp=$tempOutput;output=$dest;override=$OverrideActive;jobId=$jobId}; Save-State $active; Write-Log "START [$mode] $($File.FullName)"
  try {
    if($mode -eq 'transcode'){$args=@('-hide_banner','-y','-hwaccel','cuda','-i',$File.FullName,'-map','0:v:0','-map','0:a:0?','-sn','-c:v','h264_nvenc','-preset','p4','-cq','21','-b:v','0','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',$tempOutput)} elseif($mode -eq 'audio'){$args=@('-hide_banner','-y','-i',$File.FullName,'-map','0:v:0','-map','0:a:0?','-sn','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',$tempOutput)} else {$args=@('-hide_banner','-y','-i',$File.FullName,'-map','0:v:0','-map','0:a:0?','-sn','-c:v','copy','-c:a','copy','-movflags','+faststart',$tempOutput)}
    Invoke-FfmpegWithHeartbeat $args $active; if(!(Test-Output $tempOutput)){throw "verification failed for $tempOutput"}; Update-History @{id=$jobId;status='copying'}; Save-State @{status='copying';source=$File.FullName;mode=$mode;temp=$tempOutput;output=$dest;override=$OverrideActive;jobId=$jobId}; Copy-Item -LiteralPath $tempOutput -Destination $dest -Force; if(!(Test-Output $dest)){Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue; throw "NAS copy verification failed for $dest"}; $archived=Join-Path $archiveDir $File.Name; if(Test-Path -LiteralPath $archived){$archived=Join-Path $archiveDir ("{0}-{1}" -f (Get-Date -Format 'yyyyMMddHHmmss'),$File.Name)}; Move-Item -LiteralPath $File.FullName -Destination $archived; Remove-Item -LiteralPath $tempDir -Recurse -Force; Update-History @{id=$jobId;status='completed';completedAt=(Get-Date).ToString('o')}; Save-State @{status='completed';source=$File.FullName;mode=$mode;output=$dest;archived=$archived;override=$OverrideActive;jobId=$jobId}; Write-Log "DONE $dest"; return $true
  } catch { $message=$_.Exception.Message; Update-History @{id=$jobId;status='failed';error=$message}; Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue; throw }
}
function Invoke-Maintenance {
  if(!(Test-Path -LiteralPath $MaintenanceScript)){Write-Log 'WARN maintenance.ps1 missing'; return}
  Save-State @{status='maintenance';reason='Weekly compatibility and duplicate sweep';override=$false}; Write-Log 'Starting maintenance sweep.'
  try { & powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $MaintenanceScript -MediaRoot $MediaRoot -WorkRoot $WorkRoot; if($LASTEXITCODE -ne 0){throw "maintenance exited with code $LASTEXITCODE"}; Write-Log 'Maintenance sweep finished.' } catch { Write-Log "ERROR maintenance: $($_.Exception.Message)" }
}
function Test-WeeklyMaintenanceDue {
  $now=Get-Date; if($now.DayOfWeek -ne [DayOfWeek]::Sunday -or $now.Hour -lt 4 -or $now.Hour -ge 5){return $false}; $today=$now.ToString('yyyy-MM-dd'); try { if((Get-Content -LiteralPath $MaintenanceMarker -Raw -ErrorAction Stop).Trim() -eq $today){return $false} } catch {}; return $true
}

Write-Log "Worker $WorkerVersion starting. RunNow=$RunNow ForceWhenBusy=$ForceWhenBusy Once=$Once MediaRoot=$MediaRoot WorkRoot=$WorkRoot"
$siteOverride=[bool]$RunNow; Save-State @{status='idle';source=$null;override=$siteOverride}
while($true){
  if((Test-Path -LiteralPath $LocalStopFile) -or (Test-Path -LiteralPath $RemoteStopFile)){Remove-Item -LiteralPath $RemoteStopFile -Force -ErrorAction SilentlyContinue; Write-Log 'STOP command detected. Exiting.'; Save-State @{status='stopped';override=$false}; break}
  if(Test-Path -LiteralPath $RemoteEndOverrideFile){Remove-Item -LiteralPath $RemoteEndOverrideFile -Force -ErrorAction SilentlyContinue; $siteOverride=$false; Write-Log 'Daytime override ended; normal overnight rules restored.'; Save-State @{status='waiting';reason='daytime override ended';override=$false}}
  if(Test-Path -LiteralPath $RemoteRunFile){Remove-Item -LiteralPath $RemoteRunFile -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath $RemotePauseFile -Force -ErrorAction SilentlyContinue; $siteOverride=$true; Write-Log 'Convert Now command detected. Daytime override enabled.'}
  if(Test-Path -LiteralPath $RemoteMaintenanceFile){Remove-Item -LiteralPath $RemoteMaintenanceFile -Force -ErrorAction SilentlyContinue; $siteOverride=$false; Invoke-Maintenance; continue}
  if((Test-Path -LiteralPath $LocalPauseFile) -or (Test-Path -LiteralPath $RemotePauseFile)){$siteOverride=$false; Save-State @{status='paused';override=$false}; Start-Sleep -Seconds 5; continue}
  if(Test-GpuBusy){$gpu=Get-GpuUtilization; Save-State @{status='waiting';reason="Gaming protection: sustained GPU load ($gpu%)";override=$siteOverride}; if($Once){break}; Start-Sleep -Seconds 10; continue}
  if(!$siteOverride){ if(!(In-Schedule)){Save-State @{status='waiting';reason='outside schedule';override=$false}; if($Once){break}; Start-Sleep -Seconds 5; continue}; if((Get-IdleSeconds) -lt ($IdleMinutes*60)){Save-State @{status='waiting';reason='PC active';override=$false}; if($Once){break}; Start-Sleep -Seconds 10; continue} }
  $converted=$false; foreach($file in Get-Candidates){ try { if(Convert-One $file $siteOverride){$converted=$true;break} } catch { Write-Log "ERROR $($file.FullName): $($_.Exception.Message)"; Save-State @{status='failed';source=$file.FullName;error=$_.Exception.Message;override=$siteOverride}; Start-Sleep -Seconds 10 } }
  if($Once){break}
  if(!$converted){ if(!$siteOverride -and (Test-WeeklyMaintenanceDue)){Invoke-Maintenance; (Get-Date).ToString('yyyy-MM-dd')|Set-Content -LiteralPath $MaintenanceMarker -Encoding ASCII}; Save-State @{status='idle';reason='no incompatible files found';override=$siteOverride}; Start-Sleep -Seconds 10 }
}
