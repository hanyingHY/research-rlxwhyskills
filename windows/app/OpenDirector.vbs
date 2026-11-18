' OpenDirector - desktop launcher (silent).
'
' This is what the desktop shortcut starts. It runs the launcher without a console
' window. On the very first start (or after the runtime was removed) it hands over to
' OpenDirector.cmd so the user can see the progress of the one-time download.
'
' The launcher shows a message box itself when it cannot start.

Option Explicit

Dim fso, shell, appHome, installHome, dataDir, marker
Dim python, launcher, command

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appHome = fso.GetParentFolderName(WScript.ScriptFullName)
installHome = fso.GetParentFolderName(appHome)
dataDir = shell.ExpandEnvironmentStrings("%APPDATA%") & "\OpenDirector"

python = installHome & "\runtime\python.exe"
If Not fso.FileExists(python) Then python = "python"
launcher = appHome & "\opendirector_app.py"
marker = dataDir & "\.installed"

If Not fso.FileExists(marker) Then
    ' First run: show a console with progress, then start the app window.
    command = """" & fso.BuildPath(appHome, "OpenDirector.cmd") & """"
    shell.Run "cmd /c " & command, 1, False
Else
    ' Prepared machine: start hidden (0) and return immediately.
    command = """" & python & """ """ & launcher & """"
    shell.Run command, 0, False
End If
