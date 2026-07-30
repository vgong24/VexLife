@echo off
set ROOT=%~dp0
node "%ROOT%scripts\bootstrap.mjs" %*
set BOOTCODE=%ERRORLEVEL%
if %BOOTCODE% EQU 0 goto serve
if %BOOTCODE% EQU 3 goto serve
exit /b %BOOTCODE%
:serve
node "%ROOT%scripts\serve-browser.mjs"
rem [VXG RealForever]
