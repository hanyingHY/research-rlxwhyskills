#requires -Version 5.1
<#
.SYNOPSIS
    Builds a single-file OpenDirector-Setup.exe from this folder (on Windows).

.DESCRIPTION
    The downloadable zip is already enough: unzip and double-click setup.cmd.
    This script turns the same files into one .exe for people who prefer that,
    using 7-Zip when it is installed, otherwise the Windows IExpress tool.

    Both are self-extracting archives that run setup.cmd after extracting, so the
    result behaves exactly like the zip.

.PARAMETER Output
    Destination .exe path. Defaults to ..\dist\OpenDirector-Setup.exe
#>
[CmdletBinding()]
param(
    [string]$Output = (Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) 'dist\OpenDirector-Setup.exe')
)

$ErrorActionPreference = 'Stop'

$appHome = Split-Path -Parent $MyInvocation.MyCommand.Path
$installHome = Split-Path -Parent $appHome
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $installHome $Output))
New-Item -ItemType Directory -Path (Split-Path $outputPath) -Force | Out-Null

$sevenZip = @(
    (Join-Path $env:ProgramFiles '7-Zip\7z.exe'),
    (Join-Path ${env:ProgramFiles(x86)} '7-Zip\7z.exe'),
    (Get-Command 7z -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($sevenZip) {
    Write-Host "==> Building a 7-Zip self-extracting archive with $sevenZip"
    $config = Join-Path $env:TEMP 'od-sfx.txt'
    @(
        ';!@Install@!UTF-8!',
        'Title="OpenDirector"',
        'BeginPrompt="Install OpenDirector on this computer?"',
        'RunProgram="setup.cmd"',
        ';!@InstallEnd@!'
    ) | Set-Content -Path $config -Encoding UTF8

    $archive = Join-Path $env:TEMP ('od-' + [guid]::NewGuid().ToString('n') + '.7z')
    # packages\ holds previous build output; including it would nest the archive in itself.
    & $sevenZip a -y -r -x'!packages' $archive (Join-Path $installHome '*') | Out-Host
    $sfxModule = Join-Path (Split-Path $sevenZip) '7z.sfx'
    if (-not (Test-Path $sfxModule)) { throw "7z.sfx not found next to $sevenZip." }
    & cmd /c copy /b "$sfxModule" + "$config" + "$archive" "$outputPath" | Out-Host
    Remove-Item $archive, $config -Force -ErrorAction SilentlyContinue
    Write-Host "Built $outputPath" -ForegroundColor Green
    exit 0
}

if (Get-Command iexpress -ErrorAction SilentlyContinue) {
    Write-Host '==> Building an IExpress package'
    $sed = Join-Path $env:TEMP 'od-sfx.sed'
    @(
        '[Version]',
        'Class=IEXPRESS',
        'SEDVersion=3',
        '[Options]',
        'PackagePurpose=InstallApp',
        'ShowInstallProgramWindow=1',
        'HideExtractAnimation=0',
        'UseLongFileName=1',
        'InsideCompressed=0',
        'CAB_FixedSize=0',
        'CAB_ResvCodeSigning=0',
        'RebootMode=N',
        'InstallPrompt=%InstallPrompt%',
        'DisplayLicense=%DisplayLicense%',
        'FinishMessage=%FinishMessage%',
        'TargetName=%TargetName%',
        'FriendlyName=%FriendlyName%',
        'AppLaunched=%AppLaunched%',
        'PostInstallCmd=%PostInstallCmd%',
        'SourceFiles=SourceFiles',
        '[Strings]',
        'InstallPrompt=Install OpenDirector on this computer?',
        'DisplayLicense=',
        'FinishMessage=OpenDirector is installed. Double-click OpenDirector on the desktop.',
        "TargetName=$outputPath",
        'FriendlyName=OpenDirector',
        'AppLaunched=cmd /c setup.cmd',
        'PostInstallCmd=<None>',
        '[SourceFiles]',
        "SourceFiles0=$installHome\",
        '[SourceFiles0]',
        '%FILE0%=setup.cmd',
        '%FILE1%=app\'
    ) | Set-Content -Path $sed -Encoding ASCII
    & iexpress /N /Q $sed
    Remove-Item $sed -Force -ErrorAction SilentlyContinue
    if (Test-Path $outputPath) {
        Write-Host "Built $outputPath" -ForegroundColor Green
        exit 0
    }
    throw 'IExpress did not produce an executable.'
}

throw 'Neither 7-Zip nor IExpress was found. Ship the zip (unzip, then run setup.cmd).'
