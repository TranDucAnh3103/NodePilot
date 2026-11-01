@echo off
title NodePilot HSCC - Process Terminator
cls
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
echo.
pause
