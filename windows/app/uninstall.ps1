#requires -Version 5.1
<#
.SYNOPSIS
    Removes the OpenDirector application and its private runtime.

.DESCRIPTION
    Deletes the private Python runtime, the media tools and the shortcuts.
    Your projects, model credentials and settings in %APPDATA%\OpenDirector\data
    are kept unless you explicitly pass -RemoveData.

.PARAMETER RemoveData
    Also delete projects, credentials and settings. Asks for confirmation.
#>
[CmdletBinding()]
param(
    [switch]$RemoveData
)

$ErrorActionPreference = 'Stop'

$appHome = Split-Path -Parent $MyInvocation.MyCommand.Path
$installHome = Split-Path -Parent $appHome
$data = Join-Path $env:APPDATA 'OpenDirector'

Write-Host 'OpenDirector uninstall' -ForegroundColor Cyan

# Stop anything that is still running.
Get-Process -Name python, pythonw -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$installHome\*" } |
    Stop-Process -Force -ErrorAction SilentlyContinue

foreach ($path in @((Join-Path $installHome 'runtime'), (Join-Path $installHome 'bin'))) {
    if (Test-Path $path) {
        Write-Host "==> Removing $path"
        Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
    }
}

$desktop = [Environment]::GetFolderPath('Desktop')
$programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
foreach ($shortcut in @((Join-Path $desktop 'OpenDirector.lnk'), (Join-Path $programs 'OpenDirector.lnk'))) {
    if (Test-Path $shortcut) {
        Write-Host "==> Removing $shortcut"
        Remove-Item -Force $shortcut
    }
}

if ($RemoveData) {
    $answer = Read-Host "Delete projects and settings in $data ? Type YES to confirm"
    if ($answer -eq 'YES') {
        Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue
        Write-Host 'Projects and settings deleted.'
    }
    else {
        Write-Host 'Kept projects and settings.'
    }
}
else {
    Write-Host ''
    Write-Host "Projects and settings were kept in:" -ForegroundColor Green
    Write-Host "  $data"
}

Write-Host ''
Write-Host 'OpenDirector was removed from this computer.' -ForegroundColor Green
Write-Host "Delete the folder $installHome to finish."
