#requires -Version 5.1
<#
.SYNOPSIS
    Installs OpenDirector on this Windows computer.

.DESCRIPTION
    1. puts a private Python runtime next to the app (nothing is installed system-wide);
    2. installs OpenDirector, its dependencies and FFmpeg into user data;
    3. creates a desktop shortcut and a Start Menu shortcut.

    Double-click setup.cmd, or run:
        powershell -ExecutionPolicy Bypass -File install.ps1

.PARAMETER PythonVersion
    Embeddable CPython version to bundle (must exist on python.org).

.PARAMETER Source
    OpenDirector source checkout to install from instead of the package index.

.PARAMETER WheelsDir
    Directory of pre-downloaded wheels for an offline install.

.PARAMETER SkipShortcuts
    Prepare the runtime only.
#>
[CmdletBinding()]
param(
    [string]$PythonVersion = '3.12.10',
    [string]$Source,
    [string]$WheelsDir,
    [switch]$SkipShortcuts
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$appHome = Split-Path -Parent $MyInvocation.MyCommand.Path
$installHome = Split-Path -Parent $appHome
$runtime = Join-Path $installHome 'runtime'
$python = Join-Path $runtime 'python.exe'
$launcher = Join-Path $appHome 'opendirector_app.py'
$icon = Join-Path $appHome 'lib\opendirector.ico'

function Write-Step([string]$message) { Write-Host "`n==> $message" -ForegroundColor Cyan }

Write-Host 'OpenDirector setup' -ForegroundColor Cyan
Write-Host 'This prepares a private Python runtime and installs OpenDirector.'
Write-Host 'Your projects stay in %APPDATA%\OpenDirector and are never touched by setup.'

# 1. A private Python runtime, so the user never has to install Python.
if (-not (Test-Path $python)) {
    Write-Step "Downloading Python $PythonVersion (embeddable, private to OpenDirector)"
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
    $url = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-$arch.zip"
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("od-setup-" + [guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $temp | Out-Null
    try {
        $zip = Join-Path $temp 'python.zip'
        Write-Host "    $url"
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        New-Item -ItemType Directory -Path $runtime -Force | Out-Null
        Expand-Archive -Path $zip -DestinationPath $runtime -Force

        # The embeddable package ignores site-packages unless the ._pth file enables it.
        $pth = Get-ChildItem -Path $runtime -Filter 'python*._pth' | Select-Object -First 1
        if (-not $pth) { throw 'The Python download looks incomplete (no python*._pth).' }
        $short = 'python' + (($PythonVersion -split '\.')[0..1] -join '')
        @("$short.zip", '.', 'Lib\site-packages', 'import site') | Set-Content -Path $pth.FullName -Encoding ASCII

        Write-Step 'Installing pip into the private runtime'
        $getPip = Join-Path $runtime 'get-pip.py'
        Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPip -UseBasicParsing
        & $python $getPip --no-warn-script-location
        if ($LASTEXITCODE -ne 0) { throw 'pip could not be installed.' }
        Remove-Item $getPip -Force -ErrorAction SilentlyContinue
    }
    finally {
        Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
    }
}
else {
    Write-Step 'Using the existing private Python runtime'
}

# 2. OpenDirector itself, its dependencies and the media tools.
Write-Step 'Installing OpenDirector'
$arguments = @('install')
if ($Source) { $arguments += @('--source', $Source) }
if ($WheelsDir) { $arguments += @('--wheels', $WheelsDir) }
& $python $launcher @arguments
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'Setup failed. The message above explains why.' -ForegroundColor Red
    Write-Host 'Logs: %APPDATA%\OpenDirector\logs' -ForegroundColor Yellow
    exit $LASTEXITCODE
}

# Mark the machine as prepared so the desktop shortcut starts silently.
$marker = Join-Path $env:APPDATA 'OpenDirector\.installed'
New-Item -ItemType Directory -Path (Split-Path $marker) -Force | Out-Null
(Get-Date).ToString('o') | Set-Content -Path $marker -Encoding UTF8

# 3. Shortcuts.
if (-not $SkipShortcuts) {
    Write-Step 'Creating shortcuts'
    $vbs = Join-Path $appHome 'OpenDirector.vbs'
    $shell = New-Object -ComObject WScript.Shell

    $desktop = [Environment]::GetFolderPath('Desktop')
    $shortcut = $shell.CreateShortcut((Join-Path $desktop 'OpenDirector.lnk'))
    $shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
    $shortcut.Arguments = '"' + $vbs + '"'
    $shortcut.WorkingDirectory = $appHome
    $shortcut.Description = 'OpenDirector'
    if (Test-Path $icon) { $shortcut.IconLocation = $icon }
    $shortcut.Save()

    $programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    New-Item -ItemType Directory -Path $programs -Force | Out-Null
    $shortcut = $shell.CreateShortcut((Join-Path $programs 'OpenDirector.lnk'))
    $shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
    $shortcut.Arguments = '"' + $vbs + '"'
    $shortcut.WorkingDirectory = $appHome
    $shortcut.Description = 'OpenDirector'
    if (Test-Path $icon) { $shortcut.IconLocation = $icon }
    $shortcut.Save()

    Write-Host '    Desktop and Start Menu shortcuts created.'
}

Write-Host ''
Write-Host 'Setup complete. Double-click OpenDirector on the desktop.' -ForegroundColor Green
Write-Host "Projects and settings will live in: $(Join-Path $env:APPDATA 'OpenDirector\data')"
