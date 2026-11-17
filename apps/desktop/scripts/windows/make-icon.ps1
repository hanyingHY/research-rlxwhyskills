#Requires -Version 5.1
<#
.SYNOPSIS
    Converts an image into build\icon.ico for the Windows installer and window.

.DESCRIPTION
    Uses Pillow when available, otherwise ImageMagick (`magick`). Run it from the
    repository checkout so the OpenDirector logo can be used as the source:

        powershell -ExecutionPolicy Bypass -File scripts\windows\make-icon.ps1 `
            -Source ..\..\src\assets\open_director_logo.png

.PARAMETER Source
    Square source image. Defaults to ../../src/assets/open_director_logo.png.

.PARAMETER Output
    Destination .ico file. Defaults to build/icon.ico.
#>
[CmdletBinding()]
param(
    [string]$Source = (Join-Path $PSScriptRoot '..\..\..\src\assets\open_director_logo.png'),
    [string]$Output = (Join-Path $PSScriptRoot '..\..\build\icon.ico')
)

$ErrorActionPreference = 'Stop'

$sourcePath = (Resolve-Path -LiteralPath $Source -ErrorAction SilentlyContinue).Path
if (-not $sourcePath) {
    Write-Warning "Source image not found: $Source"
    Write-Warning 'electron-builder will use the default Electron icon instead.'
    exit 0
}
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Output))
New-Item -ItemType Directory -Path (Split-Path $outputPath) -Force | Out-Null

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }

if ($python) {
    Write-Host "==> Converting with Pillow: $sourcePath"
    $script = @'
import sys
from PIL import Image
source, destination = sys.argv[1], sys.argv[2]
image = Image.open(source).convert("RGBA")
sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
image.save(destination, format="ICO", sizes=sizes)
print("wrote", destination)
'@
    $scriptPath = Join-Path ([System.IO.Path]::GetTempPath()) 'od-make-icon.py'
    Set-Content -Path $scriptPath -Value $script -Encoding UTF8
    & $python.Source $scriptPath $sourcePath $outputPath
    if ($LASTEXITCODE -eq 0) {
        Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue
        Write-Host "Icon ready: $outputPath" -ForegroundColor Green
        exit 0
    }
    Write-Warning 'Pillow conversion failed; trying ImageMagick.'
}

if (Get-Command magick -ErrorAction SilentlyContinue) {
    Write-Host "==> Converting with ImageMagick: $sourcePath"
    & magick $sourcePath -define icon:auto-resize=256,128,64,48,32,24,16 $outputPath
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Icon ready: $outputPath" -ForegroundColor Green
        exit 0
    }
}

Write-Warning 'Neither Pillow nor ImageMagick produced an icon; electron-builder will use its default.'
exit 0
