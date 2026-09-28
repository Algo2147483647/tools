@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
set "tools_exit=%ERRORLEVEL%"
if not "%tools_exit%"=="0" pause
exit /b %tools_exit%
