@echo off
setlocal
set "ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%start-vexlife.ps1" %*
exit /b %ERRORLEVEL%
rem [VXG RealForever]
