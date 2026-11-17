@echo off
rem OpenDirector - desktop launcher (visible).
rem
rem Starts the local service and opens OpenDirector in its own application window.
rem Keep this window open while you work: closing it, or closing the OpenDirector
rem window, stops the local service.
rem
rem   OpenDirector.cmd                start normally
rem   OpenDirector.cmd --install      prepare the runtime only
rem   OpenDirector.cmd --check        print diagnostics
rem   OpenDirector.cmd --port 8010    use another port

setlocal
set "APP_HOME=%~dp0"
set "INSTALL_HOME=%~dp0.."
set "PYTHON_EXE=%INSTALL_HOME%\runtime\python.exe"

if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

"%PYTHON_EXE%" "%APP_HOME%opendirector_app.py" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo OpenDirector exited with code %EXITCODE%.
  echo The message above explains why; logs are in %%APPDATA%%\OpenDirector\logs.
  pause
)
endlocal & exit /b %EXITCODE%
