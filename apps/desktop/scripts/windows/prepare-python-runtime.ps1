#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the bundled Python runtime for the OpenDirector Windows package.

.DESCRIPTION
    Downloads the official CPython embeddable package, enables pip inside it and
    installs OpenDirector plus its dependencies into resources\python-runtime.
    The result is what the desktop shell runs, so users never install Python.

    Offline/air-gapped builds: pass -WheelsDir with the wheels produced by
    `pip wheel`, and no package index is contacted.

.PARAMETER PythonVersion
    Exact embeddable version, for example 3.12.10. Must exist on python.org.

.PARAMETER WheelsDir
    Directory of pre-downloaded wheels; installs with --no-index --find-links.

.PARAMETER Requirement
    Package to install when no wheels are given. Defaults to "opendirector".

.PARAMETER SourceRoot
    OpenDirector source checkout. A wheel is built from it, so Node.js 24.22.1+
    and npm must be available for the web build step.

.PARAMETER IndexUrl
    Alternate package index (mirror).

.PARAMETER Force
    Rebuild the runtime even when it already exists.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\windows\prepare-python-runtime.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\windows\prepare-python-runtime.ps1 `
        -SourceRoot ..\.. -PythonVersion 3.12.10
#>
[CmdletBinding()]
param(
    [string]$PythonVersion = '3.12.10',
    [string]$WheelsDir,
    [string]$Requirement = 'opendirector',
    [string]$SourceRoot,
    [string]$IndexUrl,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$target = Join-Path $root 'resources\python-runtime'
$majorMinor = ($PythonVersion -split '\.')[0..1] -join ''
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
$downloadUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-$arch.zip"

function Write-Step([string]$message) { Write-Host "==> $message" -ForegroundColor Cyan }

if ((Test-Path $target) -and -not $Force) {
    Write-Host "Runtime already exists at $target (use -Force to rebuild)." -ForegroundColor Yellow
    exit 0
}
if (Test-Path $target) {
    Write-Step 'Removing the previous runtime'
    Remove-Item -Recurse -Force $target
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("od-python-" + [guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    $zip = Join-Path $temp 'python-embed.zip'
    Write-Step "Downloading CPython $PythonVersion embeddable ($arch)"
    Write-Host "    $downloadUrl"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zip -UseBasicParsing

    Write-Step "Extracting to $target"
    Expand-Archive -Path $zip -DestinationPath $target -Force

    # The embeddable package ignores site-packages unless the ._pth file enables it.
    $pth = Get-ChildItem -Path $target -Filter 'python*._pth' | Select-Object -First 1
    if (-not $pth) { throw "No python*._pth found in $target; the download may be corrupt." }
    $shortName = "python$majorMinor"
    @(
        "$shortName.zip",
        '.',
        'Lib\site-packages',
        'import site'
    ) | Set-Content -Path $pth.FullName -Encoding ASCII
    Write-Step "Enabled site-packages in $($pth.Name)"

    $python = Join-Path $target 'python.exe'
    if (-not (Test-Path $python)) { throw "python.exe missing from the runtime." }

    Write-Step 'Installing pip into the runtime'
    $getPip = Join-Path $temp 'get-pip.py'
    Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPip -UseBasicParsing
    & $python $getPip --no-warn-script-location
    if ($LASTEXITCODE -ne 0) { throw "get-pip.py failed with exit code $LASTEXITCODE." }

    $packages = New-Object System.Collections.Generic.List[string]
    if ($WheelsDir) {
        if (-not (Test-Path $WheelsDir)) { throw "WheelsDir not found: $WheelsDir" }
        Write-Step "Installing from local wheels in $WheelsDir"
        $packages.Add('--no-index')
        $packages.Add('--find-links')
        $packages.Add((Resolve-Path $WheelsDir).Path)
        $packages.Add($Requirement)
    }
    elseif ($SourceRoot) {
        $source = Resolve-Path $SourceRoot
        if (-not (Test-Path (Join-Path $source 'pyproject.toml'))) { throw "Not an OpenDirector checkout: $source" }
        $wheelDir = Join-Path $temp 'wheels'
        Write-Step "Building a wheel from $source"
        & $python -m pip wheel --no-deps -w $wheelDir $source.Path
        if ($LASTEXITCODE -ne 0) { throw 'Building the OpenDirector wheel failed.' }
        $packages.Add('--no-index')
        $packages.Add('--find-links')
        $packages.Add($wheelDir)
        $packages.Add($Requirement)
        $requirements = Join-Path $source 'requirements.txt'
        if (Test-Path $requirements) {
            $packages.Add('-r')
            $packages.Add($requirements)
        }
    }
    else {
        Write-Step "Installing $Requirement from the package index"
        if ($IndexUrl -or $env:OPENDIRECTOR_PIP_INDEX_URL) {
            $packages.Add('--index-url')
            $packages.Add($(if ($IndexUrl) { $IndexUrl } else { $env:OPENDIRECTOR_PIP_INDEX_URL }))
        }
        $packages.Add($Requirement)
    }

    & $python -m pip install --no-cache-dir --no-compile --disable-pip-version-check $packages.ToArray()
    if ($LASTEXITCODE -ne 0) { throw "pip install failed with exit code $LASTEXITCODE." }

    Write-Step 'Pruning packaging leftovers'
    Get-ChildItem -Path $target -Directory -Recurse -Filter '__pycache__' -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    foreach ($name in @('pip', 'pip-*', 'setuptools', 'setuptools-*', 'wheel', 'wheel-*')) {
        Get-ChildItem -Path (Join-Path $target 'Lib\site-packages') -Filter $name -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Step 'Verifying the runtime'
    $check = & $python -c 'import opendirector_api, opendirector; print("ok")'
    if ($LASTEXITCODE -ne 0 -or $check -ne 'ok') { throw 'The bundled runtime cannot import opendirector_api.' }

    @(
        "python: $PythonVersion ($arch)",
        "source: $downloadUrl",
        "built:  $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))",
        "wheel:  $(if ($WheelsDir) { $WheelsDir } elseif ($SourceRoot) { $SourceRoot } else { $Requirement })"
    ) | Set-Content -Path (Join-Path $target 'RUNTIME.txt') -Encoding UTF8

    $size = [math]::Round((Get-ChildItem -Path $target -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
    Write-Host "Bundled runtime ready: $target ($size MiB)" -ForegroundColor Green
}
finally {
    Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}
