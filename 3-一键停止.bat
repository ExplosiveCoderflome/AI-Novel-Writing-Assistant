@echo off
chcp 65001 >nul
title Daydream Engine - 一键停止与进程清理

echo =================================================================
echo   Daydream Engine (白日做梦引擎) - 一键停止与进程清理
echo =================================================================
echo.
echo 正在停止并干净释放后台服务端口...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/win_stop.ps1"

echo.
pause
