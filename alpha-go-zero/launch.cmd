@echo off
setlocal
set ZERO_OPEN_BROWSER=1
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
