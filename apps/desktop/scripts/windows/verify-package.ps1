#Requires -Version 5.1
<#
.SYNOPSIS
    Checks an unpacked Windows package before it is published.

.DESCRIPTION
    Runs the checks that catch the packaging mistakes a user would otherwise find:
    the shell is present, the runtime can import the backend, the media tools run,
    and the data directory is not inside the install directory (so an update or an
    uninstall cannot delete a project).

.PARAMETER Root
    Unpacked application directory. Defaults to release\win-unpacked.
#>
[CmdletBinding()]
param(
    [string]$Root = (Join-Path $PSScriptRoot '..\..\release\win-unpacked')
)

$ErrorActionPreference = 'Continue'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Root))
$problems = 0

function Test-Condition([string]$name, [bool]$condition, [string]$detail = '') {
    if ($condition) {
        Write-Host "  PASS  $name" -ForegroundColor Green
    }
    else {
        Write-Host "  FAIL  $name $detail" -ForegroundColor Red
        $script:problems++
    }
}

Write-Host "Verifying $root`n"

Test-Condition 'application directory exists' (Test-Path $root) $root
if (-not (Test-Path $root)) { exit 1 }

$exe = Join-Path $root 'OpenDirector.exe'
Test-Condition 'OpenDirector.exe present' (Test-Path $exe)

$resources = Join-Path $root 'resources'
$appAsar = Join-Path $resources 'app.asar'
Test-Condition 'app.asar present' (Test-Path $appAsar)

$mainScript = Join-Path $resources 'app.asar\dist\src\main\index.js'
$asarList = $null
if (Test-Path $appAsar) {
    $asarTool = Join-Path $root '..\..\node_modules\@electron\asar\bin\asar.js'
    if (Test-Path $asarTool) {
        $asarList = & node $asarTool list $appAsar 2>$null
    }
}
if ($asarList) {
    Test-Condition 'compiled main process inside asar' ($asarList -match 'dist/src/main/index\.js')
    Test-Condition 'preload bridges inside asar' (($asarList -match 'dist/src/preload/index\.js') -and ($asarList -match 'dist/src/preload/failure\.js'))
}
else {
    Write-Host '  SKIP  asar listing (asar tool unavailable)' -ForegroundColor Yellow
}

$python = Join-Path $resources 'python-runtime\python.exe'
Test-Condition 'bundled python present' (Test-Path $python)
if (Test-Path $python) {
    $import = & $python -c 'import opendirector_api, opendirector; print("ok")' 2>$null
    Test-Condition 'backend imports from the bundled runtime' ($import -eq 'ok') "output=$import"
    $web = & $python -c 'from opendirector.installation import web_root; print((web_root() / "index.html").is_file())' 2>$null
    Test-Condition 'workspace bundle is inside the runtime' ($web -eq 'True') "output=$web"
}

$ffmpeg = Join-Path $resources 'bin\ffmpeg.exe'
$ffprobe = Join-Path $resources 'bin\ffprobe.exe'
Test-Condition 'ffmpeg.exe bundled' (Test-Path $ffmpeg)
Test-Condition 'ffprobe.exe bundled' (Test-Path $ffprobe)
if (Test-Path $ffmpeg) {
    $encoders = & $ffmpeg -hide_banner -encoders 2>$null
    Test-Condition 'libx264 encoder available' ($encoders -match 'libx264')
}

# Projects must never live in the install directory.
$installData = Join-Path $resources 'data'
Test-Condition 'no project data inside the install directory' (-not (Test-Path $installData))

Write-Host ''
if ($problems -gt 0) {
    Write-Host "$problems check(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host 'All package checks passed.' -ForegroundColor Green
