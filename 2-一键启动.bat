@echo off
chcp 65001 >nul
title Daydream Engine - 一键启动与多服务守护

echo =================================================================
echo   Daydream Engine (白日做梦引擎) - 一键服务启动引擎
echo =================================================================
echo.
echo 正在拉起所有后台服务（Qdrant, TTS, ComfyUI, API & Web 前端）...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/win_start.ps1"

pause
