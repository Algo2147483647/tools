@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
set "studio_exit=%ERRORLEVEL%"
if not "%studio_exit%"=="0" pause
exit /b %studio_exit%
