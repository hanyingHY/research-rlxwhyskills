#Requires -Version 5.1
<#
.SYNOPSIS
    Downloads the Windows media tools bundled with the desktop client.

.DESCRIPTION
    OpenDirector needs ffmpeg with libx264 and ffprobe for probing and encoding.
    This script fetches a static Windows build and places both executables in
    resources\bin, which the shell prepends to the backend's PATH.

    The default source is the gyan.dev "essentials" build, which is licensed under
    the GPL v3. Distributing it with an installer is a licensing decision for the
    release owner: switch -Uri to an LGPL build if that is required.

.PARAMETER Uri
    Zip archive containing bin\ffmpeg.exe and bin\ffprobe.exe.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\windows\fetch-ffmpeg.ps1
#>
[CmdletBinding()]
param(
    [string]$Uri = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$target = Join-Path $root 'resources\bin'

function Write-Step([string]$message) { Write-Host "==> $message" -ForegroundColor Cyan }

Write-Step "Downloading FFmpeg from $Uri"
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("od-ffmpeg-" + [guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    $zip = Join-Path $temp 'ffmpeg.zip'
    Invoke-WebRequest -Uri $Uri -OutFile $zip -UseBasicParsing
    Write-Step 'Extracting'
    Expand-Archive -Path $zip -DestinationPath $temp -Force

    $ffmpeg = Get-ChildItem -Path $temp -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
    $ffprobe = Get-ChildItem -Path $temp -Recurse -Filter 'ffprobe.exe' | Select-Object -First 1
    if (-not $ffmpeg -or -not $ffprobe) { throw 'The archive does not contain ffmpeg.exe and ffprobe.exe.' }

    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item $ffmpeg.FullName (Join-Path $target 'ffmpeg.exe') -Force
    Copy-Item $ffprobe.FullName (Join-Path $target 'ffprobe.exe') -Force

    Write-Step 'Verifying libx264 support'
    & (Join-Path $target 'ffmpeg.exe') -version | Select-Object -First 1
    $encoders = & (Join-Path $target 'ffmpeg.exe') -hide_banner -encoders 2>$null
    if ($encoders -notmatch 'libx264') { throw 'This FFmpeg build has no libx264 encoder; MP4 export would fail.' }
    & (Join-Path $target 'ffprobe.exe') -version | Select-Object -First 1

    @(
        "ffmpeg source: $Uri",
        "fetched:       $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
    ) | Set-Content -Path (Join-Path $target 'MEDIA-TOOLS.txt') -Encoding UTF8

    Write-Host "Media tools ready: $target" -ForegroundColor Green
    Write-Host 'Remember to mirror the FFmpeg license in the release NOTICE.' -ForegroundColor Yellow
}
finally {
    Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}
