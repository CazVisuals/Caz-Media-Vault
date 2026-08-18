param(
  [string]$MediaRoot = "\\192.168.0.15\video",
  [string]$WorkRoot = "D:\ConstantsHub-Transcode"
)

$ErrorActionPreference = "Stop"
$VideoExtensions = @('.mp4','.mkv','.mov','.avi','.m4v','.webm')
$ControlRoot = Join-Path $MediaRoot '.constants-hub\pc-worker'
$ReportFile = Join-Path $ControlRoot 'maintenance.json'
$DuplicateRoot = Join-Path $MediaRoot '.constants-hub\duplicates'
$LogFile = Join-Path $WorkRoot 'worker.log'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Force $WorkRoot,$ControlRoot,$DuplicateRoot | Out-Null

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') MAINTENANCE $Message"
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

function Write-JsonFile([string]$Path,[object]$Value) {
  $json = $Value | ConvertTo-Json -Depth 8
  $temp = "$Path.$PID.tmp"
  [IO.File]::WriteAllText($temp,$json,$Utf8NoBom)
  try {
    if(Test-Path -LiteralPath $Path){ [IO.File]::Replace($temp,$Path,$null,$true) }
    else { [IO.File]::Move($temp,$Path) }
  } catch {
    [IO.File]::WriteAllText($Path,$json,$Utf8NoBom)
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
  }
}

function Get-Probe([string]$Path) {
  $json = & ffprobe -v error -show_entries format=format_name:stream=index,codec_type,codec_name,pix_fmt -of json -- "$Path"
  if($LASTEXITCODE -ne 0){ throw "ffprobe failed" }
  return $json | ConvertFrom-Json
}

function Test-MobileReady([string]$Path) {
  $probe = Get-Probe $Path
  $video = $probe.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
  $audio = $probe.streams | Where-Object codec_type -eq 'audio' | Select-Object -First 1
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  return $extension -in @('.mp4','.m4v') -and $video -and $video.codec_name -eq 'h264' -and (!$video.pix_fmt -or $video.pix_fmt -eq 'yuv420p') -and (!$audio -or $audio.codec_name -eq 'aac')
}

$startedAt = (Get-Date).ToString('o')
Write-Log 'weekly full compatibility and duplicate sweep starting'

$files = @(Get-ChildItem -LiteralPath $MediaRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $VideoExtensions -contains $_.Extension.ToLowerInvariant() -and $_.FullName -notlike "$MediaRoot\.constants-hub\*"
})

$ready = 0
$incompatible = New-Object System.Collections.Generic.List[object]
$probeErrors = New-Object System.Collections.Generic.List[object]
foreach($file in $files){
  try {
    if(Test-MobileReady $file.FullName){ $ready++ }
    else { $incompatible.Add([pscustomobject]@{ path=$file.FullName; size=$file.Length }) }
  } catch {
    $probeErrors.Add([pscustomobject]@{ path=$file.FullName; error=$_.Exception.Message })
  }
}

$duplicatesRemoved = New-Object System.Collections.Generic.List[object]
$duplicateGroups = @($files | Group-Object Length | Where-Object { $_.Count -gt 1 -and [int64]$_.Name -gt 0 })
foreach($sizeGroup in $duplicateGroups){
  $hashed = foreach($file in $sizeGroup.Group){
    try { [pscustomobject]@{ file=$file; hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash } }
    catch { $null }
  }
  foreach($hashGroup in @($hashed | Where-Object { $_ } | Group-Object hash | Where-Object Count -gt 1)){
    $ordered = @($hashGroup.Group | Sort-Object @{Expression={$_.file.FullName.Length}}, @{Expression={$_.file.FullName}})
    $keeper = $ordered[0].file
    foreach($entry in $ordered | Select-Object -Skip 1){
      $duplicate = $entry.file
      $relative = $duplicate.FullName.Substring($MediaRoot.Length).TrimStart('\')
      $quarantine = Join-Path $DuplicateRoot $relative
      $quarantineDir = Split-Path $quarantine -Parent
      New-Item -ItemType Directory -Force $quarantineDir | Out-Null
      if(Test-Path -LiteralPath $quarantine){
        $quarantine = Join-Path $quarantineDir ("{0}-{1}" -f (Get-Date -Format 'yyyyMMddHHmmss'),$duplicate.Name)
      }
      Move-Item -LiteralPath $duplicate.FullName -Destination $quarantine
      $duplicatesRemoved.Add([pscustomobject]@{ kept=$keeper.FullName; removed=$duplicate.FullName; quarantined=$quarantine; sha256=$entry.hash; size=$duplicate.Length })
      Write-Log "exact duplicate quarantined: $($duplicate.FullName)"
    }
  }
}

$report = [pscustomobject]@{
  status = 'completed'
  startedAt = $startedAt
  completedAt = (Get-Date).ToString('o')
  scanned = $files.Count
  mobileReady = $ready
  incompatible = $incompatible.Count
  probeErrors = $probeErrors.Count
  exactDuplicatesRemoved = $duplicatesRemoved.Count
  duplicatePolicy = 'Exact same size + SHA256 only; extra copies moved out of the active library to .constants-hub\duplicates for recovery.'
  incompatibleFiles = @($incompatible | Select-Object -First 250)
  errors = @($probeErrors | Select-Object -First 100)
  duplicates = @($duplicatesRemoved | Select-Object -First 250)
}
Write-JsonFile $ReportFile $report
Write-Log "completed: scanned=$($files.Count) ready=$ready incompatible=$($incompatible.Count) duplicates=$($duplicatesRemoved.Count) errors=$($probeErrors.Count)"
