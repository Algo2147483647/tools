@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
set "vector_exit=%ERRORLEVEL%"
if not "%vector_exit%"=="0" (
    echo.
    echo The simulator did not start successfully. Review the message above.
    pause
)
exit /b %vector_exit%
