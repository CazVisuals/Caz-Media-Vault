param(
  [switch]$RunNow,
  [switch]$Once,
  [string]$MediaRoot = "\\192.168.0.15\video",
  [string]$WorkRoot = "D:\ConstantsHub-Transcode",
  [int]$StartHour = 0,
  [int]$EndHour = 7,
  [int]$IdleMinutes = 15
)

$ErrorActionPreference = "Stop"
$VideoExtensions = @('.mp4','.mkv','.mov','.avi','.m4v','.webm')
$StateFile = Join-Path $WorkRoot 'worker-state.json'
$LogFile = Join-Path $WorkRoot 'worker.log'
$StopFile = Join-Path $WorkRoot 'STOP'
$PauseFile = Join-Path $WorkRoot 'PAUSE'

New-Item -ItemType Directory -Force $WorkRoot | Out-Null

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

function Save-State([hashtable]$State) {
  $State.updatedAt = (Get-Date).ToString('o')
  $State | ConvertTo-Json -Depth 5 | Set-Content -Path $StateFile -Encoding UTF8
}

function Get-IdleSeconds {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class IdleTime {
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint Seconds() {
    LASTINPUTINFO lii = new LASTINPUTINFO();
    lii.cbSize = (uint)Marshal.SizeOf(lii);
    GetLastInputInfo(ref lii);
    return ((uint)Environment.TickCount - lii.dwTime) / 1000;
  }
}
"@ -ErrorAction SilentlyContinue | Out-Null
  return [IdleTime]::Seconds()
}

function In-Schedule {
  $hour = (Get-Date).Hour
  if ($StartHour -lt $EndHour) { return $hour -ge $StartHour -and $hour -lt $EndHour }
  return $hour -ge $StartHour -or $hour -lt $EndHour
}

function Get-Probe([string]$Path) {
  $json = & ffprobe -v error -show_entries format=format_name:stream=index,codec_type,codec_name,pix_fmt -of json -- "$Path"
  if ($LASTEXITCODE -ne 0) { throw "ffprobe failed for $Path" }
  return $json | ConvertFrom-Json
}

function Get-Mode([string]$Path) {
  $probe = Get-Probe $Path
  $video = $probe.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
  $audio = $probe.streams | Where-Object codec_type -eq 'audio' | Select-Object -First 1
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  $videoOk = $video -and $video.codec_name -eq 'h264' -and (!$video.pix_fmt -or $video.pix_fmt -eq 'yuv420p')
  $audioOk = !$audio -or $audio.codec_name -eq 'aac'
  if ($extension -eq '.mp4' -and $videoOk -and $audioOk) { return 'skip' }
  if ($videoOk -and $audioOk) { return 'remux' }
  if ($videoOk) { return 'audio' }
  return 'transcode'
}

function Test-Output([string]$Path) {
  $probe = Get-Probe $Path
  $video = $probe.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
  $audio = $probe.streams | Where-Object codec_type -eq 'audio' | Select-Object -First 1
  return $video -and $video.codec_name -eq 'h264' -and (!$video.pix_fmt -or $video.pix_fmt -eq 'yuv420p') -and (!$audio -or $audio.codec_name -eq 'aac')
}

function Get-Candidates {
  Get-ChildItem -LiteralPath $MediaRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $VideoExtensions -contains $_.Extension.ToLowerInvariant() -and
      $_.FullName -notlike "$MediaRoot\.constants-hub\*" -and
      $_.Name -notlike '* - NVENC TEST.mp4' -and
      $_.Name -notlike '* - NVENC LOCAL TEST.mp4'
    } |
    Sort-Object LastWriteTime
}

function Convert-One([IO.FileInfo]$File) {
  $mode = Get-Mode $File.FullName
  if ($mode -eq 'skip') { return $false }

  $relative = $File.FullName.Substring($MediaRoot.Length).TrimStart('\')
  $relativeDir = Split-Path $relative -Parent
  $baseName = [IO.Path]::GetFileNameWithoutExtension($File.Name)
  $tempDir = Join-Path $WorkRoot ([Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $tempDir | Out-Null
  $tempOutput = Join-Path $tempDir "$baseName.mp4"
  $destDir = if ($relativeDir) { Join-Path $MediaRoot $relativeDir } else { $MediaRoot }
  $dest = Join-Path $destDir "$baseName.mp4"
  $archiveDir = if ($relativeDir) { Join-Path $MediaRoot (Join-Path '.constants-hub\originals' $relativeDir) } else { Join-Path $MediaRoot '.constants-hub\originals' }
  New-Item -ItemType Directory -Force $archiveDir | Out-Null

  if (Test-Path -LiteralPath $dest) {
    Write-Log "SKIP destination already exists: $dest"
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    return $false
  }

  Save-State @{ status='converting'; source=$File.FullName; mode=$mode; temp=$tempOutput; output=$dest }
  Write-Log "START [$mode] $($File.FullName)"

  $common = @('-hide_banner','-y','-i',$File.FullName,'-map','0:v:0','-map','0:a:0?','-sn')
  switch ($mode) {
    'remux' { $codec = @('-c:v','copy','-c:a','copy') }
    'audio' { $codec = @('-c:v','copy','-c:a','aac','-b:a','192k') }
    default { $codec = @('-hwaccel','cuda','-c:v','h264_nvenc','-preset','p4','-cq','21','-b:v','0','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k') }
  }
  if ($mode -eq 'transcode') {
    $args = @('-hide_banner','-y','-hwaccel','cuda','-i',$File.FullName,'-map','0:v:0','-map','0:a:0?','-sn') + $codec[2..($codec.Length-1)] + @('-movflags','+faststart',$tempOutput)
  } else {
    $args = $common + $codec + @('-movflags','+faststart',$tempOutput)
  }

  & ffmpeg @args
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $($File.FullName)" }
  if (!(Test-Output $tempOutput)) { throw "verification failed for $tempOutput" }

  Save-State @{ status='copying'; source=$File.FullName; temp=$tempOutput; output=$dest }
  Copy-Item -LiteralPath $tempOutput -Destination $dest -Force
  if (!(Test-Output $dest)) { Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue; throw "NAS copy verification failed for $dest" }

  $archived = Join-Path $archiveDir $File.Name
  if (Test-Path -LiteralPath $archived) { $archived = Join-Path $archiveDir ("{0}-{1}" -f (Get-Date -Format 'yyyyMMddHHmmss'),$File.Name) }
  Move-Item -LiteralPath $File.FullName -Destination $archived
  Remove-Item -LiteralPath $tempDir -Recurse -Force
  Save-State @{ status='completed'; source=$File.FullName; output=$dest; archived=$archived }
  Write-Log "DONE $dest"
  return $true
}

Write-Log "Worker starting. RunNow=$RunNow Once=$Once MediaRoot=$MediaRoot WorkRoot=$WorkRoot"
Save-State @{ status='idle'; source=$null }

while ($true) {
  if (Test-Path -LiteralPath $StopFile) { Write-Log 'STOP file detected. Exiting.'; Save-State @{status='stopped'}; break }
  if (Test-Path -LiteralPath $PauseFile) { Save-State @{status='paused'}; Start-Sleep -Seconds 30; continue }
  if (!$RunNow) {
    if (!(In-Schedule)) { Save-State @{status='waiting'; reason='outside schedule'}; if ($Once) { break }; Start-Sleep -Seconds 60; continue }
    if ((Get-IdleSeconds) -lt ($IdleMinutes * 60)) { Save-State @{status='waiting'; reason='PC active'}; if ($Once) { break }; Start-Sleep -Seconds 60; continue }
  }

  $converted = $false
  foreach ($file in Get-Candidates) {
    try {
      if (Convert-One $file) { $converted = $true; break }
    } catch {
      Write-Log "ERROR $($file.FullName): $($_.Exception.Message)"
      Save-State @{ status='failed'; source=$file.FullName; error=$_.Exception.Message }
      Start-Sleep -Seconds 10
    }
  }

  if ($Once) { break }
  if (!$converted) { Save-State @{status='idle'; reason='no incompatible files found'}; Start-Sleep -Seconds 300 }
}
