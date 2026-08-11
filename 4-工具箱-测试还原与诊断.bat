@echo off
chcp 65001 >nul
title Daydream Engine - 运维工具箱与测试还原中心

:MENU
cls
echo =================================================================
echo   Daydream Engine (白日做梦引擎) - 运维工具箱与测试还原中心
echo =================================================================
echo.
echo [1] 重新运行智能环境诊断与自适应配置
echo [2] 创建当前项目全量数据库与配置备份
echo [3] 还原数据库至测试前快照 (Pre-Test Snapshot)
echo [4] 强行同步 Prisma 数据表结构 (db push)
echo [5] 退出
echo.
set /p choice=请选择操作编号 (1-5): 

if "%choice%"=="1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/win_tools.ps1" -Action diagnose
    pause
    goto MENU
)
if "%choice%"=="2" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/win_tools.ps1" -Action backup
    pause
    goto MENU
)
if "%choice%"=="3" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/win_tools.ps1" -Action restore
    pause
    goto MENU
)
if "%choice%"=="4" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/win_tools.ps1" -Action dbpush
    pause
    goto MENU
)
if "%choice%"=="5" (
    exit /b 0
)

goto MENU
