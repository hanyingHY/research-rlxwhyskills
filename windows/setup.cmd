@echo off
rem OpenDirector setup - double-click this after unzipping the download.
rem
rem It downloads a private Python runtime plus OpenDirector and FFmpeg, then creates
rem a desktop shortcut. Nothing is installed system-wide; your projects are stored in
rem %APPDATA%\OpenDirector and are kept when you uninstall.

setlocal
pushd "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\install.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
popd

echo.
if not "%EXITCODE%"=="0" (
  echo Setup failed with code %EXITCODE%.
) else (
  echo Setup finished.
)
pause
endlocal & exit /b %EXITCODE%
