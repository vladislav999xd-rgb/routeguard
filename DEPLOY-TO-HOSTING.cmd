@echo off
setlocal
title RouteGuard - SprintHost deployment

set "DEPLOY_SCRIPT=%~dp0scripts\deploy_via_ssh.ps1"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%DEPLOY_SCRIPT%" (
    echo ERROR: deployment script was not found:
    echo %DEPLOY_SCRIPT%
    echo Run this CMD file from the RouteGuard project folder.
    pause
    exit /b 2
)

if "%ROUTEGUARD_DEPLOY_VALIDATE_ONLY%"=="1" (
    echo Launcher validation completed successfully.
    exit /b 0
)

"%POWERSHELL_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%DEPLOY_SCRIPT%"
set "DEPLOY_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%DEPLOY_EXIT_CODE%"=="0" (
    echo Deployment failed. See the error above.
) else (
    echo Deployment completed successfully.
)

echo.
pause
exit /b %DEPLOY_EXIT_CODE%
