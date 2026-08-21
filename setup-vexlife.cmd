@echo off
setlocal
set "ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%install\vexlife-setup-window.ps1" -RepoRoot "%ROOT%" %*
exit /b %ERRORLEVEL%
rem [VXG RealForever]
