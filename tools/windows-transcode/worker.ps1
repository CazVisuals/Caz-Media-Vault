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
$VideoExtensions = @('.mp4','.mkv','.mov','.avi','.m4v','.webm')
$StateFile = Join-Path $WorkRoot 'worker-state.json'
$LogFile = Join-Path $WorkRoot 'worker.log'
$ControlRoot = Join-Path $MediaRoot '.constants-hub\pc-worker'
$ControlStatus = Join-Path $ControlRoot 'status.json'
$LocalStopFile = Join-Path $WorkRoot 'STOP'
$LocalPauseFile = Join-Path $WorkRoot 'PAUSE'
$RemoteStopFile = Join-Path $ControlRoot 'STOP'
$RemotePauseFile = Join-Path $ControlRoot 'PAUSE'
$RemoteRunFile = Join-Path $ControlRoot 'RUN_NOW'

New-Item -ItemType Directory -Force $WorkRoot,$ControlRoot | Out-Null

function Write-Log([string]$Message) { $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"; Add-Content -Path $LogFile -Value $line; Write-Host $line }
function Save-State([hashtable]$State) {
  $State.updatedAt = (Get-Date).ToString('o'); $State.computer = $env:COMPUTERNAME
  $json = $State | ConvertTo-Json -Depth 5
  $json | Set-Content -Path $StateFile -Encoding UTF8
  try { $json | Set-Content -Path $ControlStatus -Encoding UTF8 } catch {}
}
function Get-IdleSeconds {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class IdleTime {
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint Seconds() { LASTINPUTINFO lii = new LASTINPUTINFO(); lii.cbSize = (uint)Marshal.SizeOf(lii); GetLastInputInfo(ref lii); return ((uint)Environment.TickCount - lii.dwTime) / 1000; }
}
"@ -ErrorAction SilentlyContinue | Out-Null
  return [IdleTime]::Seconds()
}
function Get-GpuUtilization { try { $value = & nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1; if ($LASTEXITCODE -ne 0) { return 0 }; return [int]($value.Trim()) } catch { return 0 } }
function Test-GpuBusy {
  if($ForceWhenBusy){return $false}
  # Ignore brief browser/video/desktop GPU spikes. Treat the PC as gaming only
  # when GPU load stays high for three samples across roughly four seconds.
  $samples=@()
  1..3 | ForEach-Object { $samples += Get-GpuUtilization; if($_ -lt 3){Start-Sleep -Seconds 2} }
  $busy = ($samples | Where-Object { $_ -ge $GpuBusyThreshold }).Count -eq 3
  return $busy
}
function In-Schedule { $hour=(Get-Date).Hour; if($StartHour -lt $EndHour){return $hour -ge $StartHour -and $hour -lt $EndHour}; return $hour -ge $StartHour -or $hour -lt $EndHour }
function Get-Probe([string]$Path) { $json=& ffprobe -v error -show_entries format=format_name:stream=index,codec_type,codec_name,pix_fmt -of json -- "$Path"; if($LASTEXITCODE -ne 0){throw "ffprobe failed for $Path"}; return $json|ConvertFrom-Json }
function Get-Mode([string]$Path) { $probe=Get-Probe $Path; $video=$probe.streams|Where-Object codec_type -eq 'video'|Select-Object -First 1; $audio=$probe.streams|Where-Object codec_type -eq 'audio'|Select-Object -First 1; $extension=[IO.Path]::GetExtension($Path).ToLowerInvariant(); $videoOk=$video -and $video.codec_name -eq 'h264' -and (!$video.pix_fmt -or $video.pix_fmt -eq 'yuv420p'); $audioOk=!$audio -or $audio.codec_name -eq 'aac'; if($extension -eq '.mp4' -and $videoOk -and $audioOk){return 'skip'}; if($videoOk -and $audioOk){return 'remux'}; if($videoOk){return 'audio'}; return 'transcode' }
function Test-Output([string]$Path) { $probe=Get-Probe $Path; $video=$probe.streams|Where-Object codec_type -eq 'video'|Select-Object -First 1; $audio=$probe.streams|Where-Object codec_type -eq 'audio'|Select-Object -First 1; return $video -and $video.codec_name -eq 'h264' -and (!$video.pix_fmt -or $video.pix_fmt -eq 'yuv420p') -and (!$audio -or $audio.codec_name -eq 'aac') }
function Get-Candidates {
  Get-ChildItem -LiteralPath $MediaRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
    if($VideoExtensions -notcontains $_.Extension.ToLowerInvariant()){return $false}; if($_.FullName -like "$MediaRoot\.constants-hub\*"){return $false}; if($_.Name -like '* - NVENC TEST.mp4' -or $_.Name -like '* - NVENC LOCAL TEST.mp4'){return $false}; if($_.Extension.ToLowerInvariant() -ne '.mp4'){ $sameNameMp4=Join-Path $_.DirectoryName (([IO.Path]::GetFileNameWithoutExtension($_.Name))+'.mp4'); if(Test-Path -LiteralPath $sameNameMp4){return $false} }; return $true
  } | Sort-Object LastWriteTime
}
function Convert-One([IO.FileInfo]$File) {
  $mode=Get-Mode $File.FullName; if($mode -eq 'skip'){return $false}; $relative=$File.FullName.Substring($MediaRoot.Length).TrimStart('\'); $relativeDir=Split-Path $relative -Parent; $baseName=[IO.Path]::GetFileNameWithoutExtension($File.Name); $tempDir=Join-Path $WorkRoot ([Guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Force $tempDir|Out-Null; $tempOutput=Join-Path $tempDir "$baseName.mp4"; $destDir=if($relativeDir){Join-Path $MediaRoot $relativeDir}else{$MediaRoot}; $dest=Join-Path $destDir "$baseName.mp4"; $archiveDir=if($relativeDir){Join-Path $MediaRoot (Join-Path '.constants-hub\originals' $relativeDir)}else{Join-Path $MediaRoot '.constants-hub\originals'}; New-Item -ItemType Directory -Force $archiveDir|Out-Null
  if(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue; return $false}
  Save-State @{status='converting';source=$File.FullName;mode=$mode;temp=$tempOutput;output=$dest}; Write-Log "START [$mode] $($File.FullName)"
  if($mode -eq 'transcode'){$args=@('-hide_banner','-y','-hwaccel','cuda','-i',$File.FullName,'-map','0:v:0','-map','0:a:0?','-sn','-c:v','h264_nvenc','-preset','p4','-cq','21','-b:v','0','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',$tempOutput)}elseif($mode -eq 'audio'){$args=@('-hide_banner','-y','-i',$File.FullName,'-map','0:v:0','-map','0:a:0?','-sn','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',$tempOutput)}else{$args=@('-hide_banner','-y','-i',$File.FullName,'-map','0:v:0','-map','0:a:0?','-sn','-c:v','copy','-c:a','copy','-movflags','+faststart',$tempOutput)}
  & ffmpeg @args; if($LASTEXITCODE -ne 0){throw "ffmpeg failed for $($File.FullName)"}; if(!(Test-Output $tempOutput)){throw "verification failed for $tempOutput"}; Save-State @{status='copying';source=$File.FullName;temp=$tempOutput;output=$dest}; Copy-Item -LiteralPath $tempOutput -Destination $dest -Force; if(!(Test-Output $dest)){Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue; throw "NAS copy verification failed for $dest"}
  $archived=Join-Path $archiveDir $File.Name; if(Test-Path -LiteralPath $archived){$archived=Join-Path $archiveDir ("{0}-{1}" -f (Get-Date -Format 'yyyyMMddHHmmss'),$File.Name)}; Move-Item -LiteralPath $File.FullName -Destination $archived; Remove-Item -LiteralPath $tempDir -Recurse -Force; Save-State @{status='completed';source=$File.FullName;output=$dest;archived=$archived}; Write-Log "DONE $dest"; return $true
}

Write-Log "Worker starting. RunNow=$RunNow ForceWhenBusy=$ForceWhenBusy Once=$Once MediaRoot=$MediaRoot WorkRoot=$WorkRoot"
$siteOverride = [bool]$RunNow
Save-State @{status='idle';source=$null;override=$siteOverride}
while($true){
  if((Test-Path -LiteralPath $LocalStopFile) -or (Test-Path -LiteralPath $RemoteStopFile)){Remove-Item -LiteralPath $RemoteStopFile -Force -ErrorAction SilentlyContinue; Write-Log 'STOP command detected. Exiting.'; Save-State @{status='stopped';override=$false}; break}
  if(Test-Path -LiteralPath $RemoteRunFile){Remove-Item -LiteralPath $RemoteRunFile -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath $RemotePauseFile -Force -ErrorAction SilentlyContinue; $siteOverride=$true; Write-Log 'Convert Now command detected. Daytime override enabled.'}
  if((Test-Path -LiteralPath $LocalPauseFile) -or (Test-Path -LiteralPath $RemotePauseFile)){$siteOverride=$false; Save-State @{status='paused';override=$false}; Start-Sleep -Seconds 5; continue}
  if(Test-GpuBusy){$gpu=Get-GpuUtilization; Save-State @{status='waiting';reason="Gaming protection: sustained GPU load ($gpu%)";override=$siteOverride}; if($Once){break}; Start-Sleep -Seconds 10; continue}
  if(!$siteOverride){ if(!(In-Schedule)){Save-State @{status='waiting';reason='outside schedule';override=$false}; if($Once){break}; Start-Sleep -Seconds 5; continue}; if((Get-IdleSeconds) -lt ($IdleMinutes*60)){Save-State @{status='waiting';reason='PC active';override=$false}; if($Once){break}; Start-Sleep -Seconds 10; continue} }
  $converted=$false; foreach($file in Get-Candidates){try{if(Convert-One $file){$converted=$true;break}}catch{Write-Log "ERROR $($file.FullName): $($_.Exception.Message)"; Save-State @{status='failed';source=$file.FullName;error=$_.Exception.Message;override=$siteOverride}; Start-Sleep -Seconds 10}}
  if($Once){break}; if(!$converted){Save-State @{status='idle';reason='no incompatible files found';override=$siteOverride}; Start-Sleep -Seconds 10}
}
