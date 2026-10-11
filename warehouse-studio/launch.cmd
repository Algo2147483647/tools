@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
set "warehouse_exit=%ERRORLEVEL%"
if not "%warehouse_exit%"=="0" pause
exit /b %warehouse_exit%
