param(
  [string]$MediaRoot = "\\192.168.0.15\video",
  [string]$WorkRoot = "D:\ConstantsHub-Transcode"
)

$ErrorActionPreference = "Stop"
$MaintenanceVersion = "2026.09.06.1"
$VideoExtensions = @('.mp4','.mkv','.mov','.avi','.m4v','.webm')
$ControlRoot = Join-Path $MediaRoot '.constants-hub\pc-worker'
$ReportFile = Join-Path $ControlRoot 'maintenance.json'
$ProgressFile = Join-Path $ControlRoot 'maintenance-progress.json'
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

function Write-MaintenanceProgress(
  [string]$Status,
  [string]$Phase,
  [int]$Progress,
  [int]$Scanned,
  [int]$Total,
  [string]$CurrentFile = ''
) {
  Write-JsonFile $ProgressFile ([pscustomobject]@{
    status = $Status
    phase = $Phase
    progress = [Math]::Max(0,[Math]::Min(100,$Progress))
    scanned = $Scanned
    total = $Total
    currentFile = $CurrentFile
    startedAt = $startedAt
    updatedAt = (Get-Date).ToString('o')
  })
}

function Get-Probe([string]$Path) {
  $json = & ffprobe -v error -show_entries format=format_name,duration:stream=index,codec_type,codec_name,pix_fmt -of json -- "$Path"
  if($LASTEXITCODE -ne 0){ throw "ffprobe failed" }
  return $json | ConvertFrom-Json
}

function Test-MobileReady([string]$Path) {
  $probe = Get-Probe $Path
  $video = $probe.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
  $audio = $probe.streams | Where-Object codec_type -eq 'audio' | Select-Object -First 1
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  $duration = [double]$probe.format.duration
  return $duration -gt 0 -and $extension -in @('.mp4','.m4v') -and $video -and $video.codec_name -eq 'h264' -and (!$video.pix_fmt -or $video.pix_fmt -eq 'yuv420p') -and (!$audio -or $audio.codec_name -eq 'aac')
}

$startedAt = (Get-Date).ToString('o')
Write-Log "weekly full compatibility and duplicate sweep starting (version $MaintenanceVersion)"
Write-MaintenanceProgress 'running' 'Discovering media files' 0 0 0

$files = @(Get-ChildItem -LiteralPath $MediaRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $VideoExtensions -contains $_.Extension.ToLowerInvariant() -and $_.FullName -notlike "$MediaRoot\.constants-hub\*"
})

$ready = 0
$incompatible = New-Object System.Collections.Generic.List[object]
$probeErrors = New-Object System.Collections.Generic.List[object]
$scannedCount = 0
$lastProgressWrite = [DateTime]::MinValue
foreach($file in $files){
  try {
    $extension = $file.Extension.ToLowerInvariant()
    $supersededByReadyMp4 = $false
    if($extension -ne '.mp4'){
      $sameNameMp4 = Join-Path $file.DirectoryName (([IO.Path]::GetFileNameWithoutExtension($file.Name))+'.mp4')
      if(Test-Path -LiteralPath $sameNameMp4){$supersededByReadyMp4 = Test-MobileReady $sameNameMp4}
    }
    if($supersededByReadyMp4 -or (Test-MobileReady $file.FullName)){ $ready++ }
    else { $incompatible.Add([pscustomobject]@{ path=$file.FullName; size=$file.Length }) }
  } catch {
    $probeErrors.Add([pscustomobject]@{ path=$file.FullName; error=$_.Exception.Message })
  }
  $scannedCount++
  if($scannedCount -eq $files.Count -or ((Get-Date) - $lastProgressWrite).TotalSeconds -ge 1){
    $scanProgress = if($files.Count){ [int][Math]::Floor(($scannedCount / $files.Count) * 90) } else { 90 }
    Write-MaintenanceProgress 'running' 'Checking compatibility' $scanProgress $scannedCount $files.Count $file.FullName
    $lastProgressWrite = Get-Date
  }
}

$duplicatesRemoved = New-Object System.Collections.Generic.List[object]
$duplicateGroups = @($files | Group-Object Length | Where-Object { $_.Count -gt 1 -and [int64]$_.Name -gt 0 })
$duplicateGroupIndex = 0
Write-MaintenanceProgress 'running' 'Checking exact duplicates' 90 $scannedCount $files.Count
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
  $duplicateGroupIndex++
  $duplicateProgress = if($duplicateGroups.Count){ 90 + [int][Math]::Floor(($duplicateGroupIndex / $duplicateGroups.Count) * 9) } else { 99 }
  Write-MaintenanceProgress 'running' 'Checking exact duplicates' $duplicateProgress $scannedCount $files.Count
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
  incompatibleFiles = @($incompatible | ForEach-Object { $_ })
  errors = @($probeErrors | Select-Object -First 100)
  duplicates = @($duplicatesRemoved | Select-Object -First 250)
}
Write-JsonFile $ReportFile $report
Write-MaintenanceProgress 'completed' 'Maintenance complete' 100 $files.Count $files.Count
Write-Log "completed: scanned=$($files.Count) ready=$ready incompatible=$($incompatible.Count) duplicates=$($duplicatesRemoved.Count) errors=$($probeErrors.Count)"
