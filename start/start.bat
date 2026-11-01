@echo off
chcp 65001 >nul
title NodePilot HSCC - Dev Launcher
cls

echo ==========================================================
echo  NodePilot Home Server Control Center (HSCC)
echo  Bảng Điều Khiển Khởi Chạy Môi Trường Thử Nghiệm (Dev)
echo ==========================================================
echo.
echo  [1] Chạy Single Binary thử nghiệm (Nhanh nhất - Tự tạo Admin & Mở Trình duyệt)
echo  [2] Chạy chế độ Lập trình Dev (Backend Go + Frontend Vite Hot-Reload)
echo  [3] Chạy thử nghiệm qua Docker Compose (hscc-api + Watchtower)
echo  [4] Chạy toàn bộ Unit Tests & Kiểm tra mã nguồn
echo  [5] Thoát
echo.
echo ==========================================================
set /p choice="Nhập lựa chọn của bạn [1-5]: "

if "%choice%"=="1" goto STANDALONE
if "%choice%"=="2" goto DEV
if "%choice%"=="3" goto DOCKER
if "%choice%"=="4" goto TEST
if "%choice%"=="5" goto EXIT
goto INVALID

:STANDALONE
cls
echo [*] Đang khởi chạy Single Binary...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-standalone.ps1"
pause
goto EXIT

:DEV
cls
echo [*] Đang khởi chạy Chế độ Lập trình Live (Hot Reload)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
pause
goto EXIT

:DOCKER
cls
echo [*] Đang khởi chạy Docker Compose...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-docker.ps1"
pause
goto EXIT

:TEST
cls
echo [*] Đang chạy kiểm thử Go Backend và build Frontend...
cd /d "%~dp0.."
go test -v ./...
if %errorlevel% neq 0 (
    echo [ERROR] Unit test thất bại!
    pause
    goto EXIT
)
cd web
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build thất bại!
    pause
    goto EXIT
)
echo.
echo [OK] Toàn bộ kiểm thử và đóng gói đều đạt chuẩn 100%!
pause
goto EXIT

:INVALID
echo [!] Lựa chọn không hợp lệ. Vui lòng chạy lại và chọn từ 1 đến 5.
pause
goto EXIT

:EXIT
exit /b
