#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the OpenDirector Windows installer end to end.

.DESCRIPTION
    1. checks Node.js and npm;
    2. installs npm dependencies;
    3. prepares the bundled Python runtime (unless -SkipRuntime);
    4. fetches FFmpeg/ffprobe (unless -SkipMediaTools);
    5. generates build/icon.ico when possible;
    6. compiles the shell and runs electron-builder;
    7. verifies the unpacked package.

    Set CSC_LINK (PFX path or base64) and CSC_KEY_PASSWORD to sign the installers.

.PARAMETER PythonVersion
    Embeddable CPython version for the bundled runtime.

.PARAMETER SourceRoot
    OpenDirector checkout; a wheel is built from it instead of downloading one.

.PARAMETER SkipRuntime / SkipMediaTools / SkipVerify
    Skip the corresponding stage.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\windows\build-installer.ps1 -SourceRoot ..\..
#>
[CmdletBinding()]
param(
    [string]$PythonVersion = '3.12.10',
    [string]$SourceRoot,
    [string]$WheelsDir,
    [switch]$SkipRuntime,
    [switch]$SkipMediaTools,
    [switch]$SkipVerify,
    [switch]$Dir
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')

function Write-Step([string]$message) { Write-Host "`n==> $message" -ForegroundColor Cyan }

Write-Step 'Checking Node.js and npm'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 22.12.0 or newer is required. Install it from https://nodejs.org.' }
$nodeVersion = (& node --version).TrimStart('v')
Write-Host "    node $nodeVersion"
$required = [version]'22.12.0'
if ([version]($nodeVersion -split '-')[0] -lt $required) {
    throw "Node.js $required or newer is required; found $nodeVersion."
}

Push-Location $root
try {
    Write-Step 'Installing npm dependencies'
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }

    if (-not $SkipRuntime) {
        Write-Step 'Preparing the bundled Python runtime'
        $arguments = @('-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'scripts\windows\prepare-python-runtime.ps1'), '-PythonVersion', $PythonVersion)
        if ($SourceRoot) { $arguments += @('-SourceRoot', $SourceRoot) }
        if ($WheelsDir) { $arguments += @('-WheelsDir', $WheelsDir) }
        & powershell @arguments
        if ($LASTEXITCODE -ne 0) { throw 'Preparing the Python runtime failed.' }
    }

    if (-not $SkipMediaTools) {
        Write-Step 'Fetching FFmpeg and ffprobe'
        & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\windows\fetch-ffmpeg.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Fetching the media tools failed.' }
    }

    if (-not (Test-Path (Join-Path $root 'build\icon.ico'))) {
        Write-Step 'Generating build/icon.ico'
        & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\windows\make-icon.ps1')
    }

    Write-Step 'Compiling the desktop shell'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript compilation failed.' }

    Write-Step 'Packaging with electron-builder'
    $builder = @('scripts\build-windows.mjs')
    if ($Dir) { $builder += '--dir' }
    & node @builder
    if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed.' }

    if (-not $SkipVerify) {
        Write-Step 'Verifying the unpacked package'
        & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\windows\verify-package.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Package verification failed.' }
    }

    Write-Host "`nWindows package complete. Artifacts are in $(Join-Path $root 'release')." -ForegroundColor Green
}
finally {
    Pop-Location
}
