@echo off
setlocal
rem Let Windows PowerShell use its own modules when launched from PowerShell 7.
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
set "tools_exit=%ERRORLEVEL%"
if not "%tools_exit%"=="0" pause
exit /b %tools_exit%
