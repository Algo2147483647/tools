@echo off
setlocal
rem Starts the frontend and local backend through the shared launcher.
rem Avoid inheriting PowerShell 7 module paths in Windows PowerShell.
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
set "graph_exit=%ERRORLEVEL%"
exit /b %graph_exit%
