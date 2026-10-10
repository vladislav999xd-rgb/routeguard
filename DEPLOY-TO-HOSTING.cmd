@echo off
setlocal
chcp 65001 >nul
title RouteGuard - установка на SprintHost

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy_via_ssh.ps1"
set "DEPLOY_EXIT_CODE=%ERRORLEVEL%"

if not "%DEPLOY_EXIT_CODE%"=="0" (
    echo.
    echo Установка завершилась с ошибкой. Текст ошибки находится выше.
) else (
    echo.
    echo Автоматическая установка завершена.
)

echo.
pause
exit /b %DEPLOY_EXIT_CODE%
