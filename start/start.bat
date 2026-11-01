@echo off
title NodePilot HSCC - Dev Launcher
cls

echo ==========================================================
echo  NodePilot Home Server Control Center (HSCC)
echo  Development Launch Control Center
echo ==========================================================
echo.
echo  [1] Standalone Single Binary (Fastest - Auto Admin and Browser)
echo  [2] Live Dev Hot-Reload (Go Backend + Vite React 19)
echo  [3] Docker Compose Stack (hscc-api + Watchtower)
echo  [4] Run Full Unit Tests and Build Verification
echo  [5] Exit
echo.
echo ==========================================================
set choice=1
set /p choice="Select an option [1-5] (Default: 1): "
set opt=%choice:~0,1%

if "%opt%"=="1" goto STANDALONE
if "%opt%"=="2" goto DEV
if "%opt%"=="3" goto DOCKER
if "%opt%"=="4" goto TEST
if "%opt%"=="5" goto EXIT
goto INVALID

:STANDALONE
cls
echo [*] Starting Single Binary Mode...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-standalone.ps1"
echo.
pause
goto EXIT

:DEV
cls
echo [*] Starting Live Development Hot-Reload Mode...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
echo.
pause
goto EXIT

:DOCKER
cls
echo [*] Starting Docker Compose Stack...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-docker.ps1"
echo.
pause
goto EXIT

:TEST
cls
echo [*] Running Go Backend Unit Tests and Web SPA Build...
cd /d "%~dp0.."
go test -v ./...
if %errorlevel% neq 0 (
    echo [ERROR] Go unit tests failed!
    pause
    goto EXIT
)
cd web
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    goto EXIT
)
echo.
echo [OK] All tests and builds passed with 100%% success!
pause
goto EXIT

:INVALID
echo [!] Invalid selection. Please re-run and choose 1 through 5.
pause
goto EXIT

:EXIT
exit /b
