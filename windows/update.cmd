@echo off
rem OpenDirector update - upgrades OpenDirector and the media tools.
rem Your projects and settings are not touched.

setlocal
set "APP_HOME=%~dp0"
set "INSTALL_HOME=%~dp0.."
set "PYTHON_EXE=%INSTALL_HOME%\runtime\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

"%PYTHON_EXE%" "%APP_HOME%opendirector_app.py" update %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" pause
endlocal & exit /b %EXITCODE%
