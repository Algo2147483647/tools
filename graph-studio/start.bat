@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing_node

if not exist "node_modules\.bin\vite.cmd" (
    echo Installing dependencies. This may take a few minutes...
    call npm.cmd ci
    if errorlevel 1 goto failed
)

echo Starting DAG Studio. Keep this window open. Press Ctrl+C to stop.
call npm.cmd run dev -- --host 127.0.0.1 --open
if errorlevel 1 goto failed
exit /b 0

:missing_node
echo Node.js and npm are required. Install Node.js LTS from https://nodejs.org/
echo Then reopen this script.
pause
exit /b 1

:failed
echo Startup failed. Check the error above and your network connection.
pause
exit /b 1
