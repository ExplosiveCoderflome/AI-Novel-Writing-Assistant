@echo off
chcp 65001 >nul
title Daydream Engine - 智能一键安装与环境自适应

echo =================================================================
echo   Daydream Engine (白日做梦引擎) - 智能一键安装与自适应配置
echo =================================================================
echo.
echo 正在启动智能探测引擎，检查系统 Node.js, Python, FFmpeg, ComfyUI, Ollama, Qdrant 等环境...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "node scripts/smart-environment-setup.cjs"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] 智能安装配置检测提示异常，请检查控制台上方输出日志。
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo =================================================================
echo   [✓] 智能一键安装与配置完成！
echo   您可以随时双击 [2-一键启动.bat] 启动应用。
echo =================================================================
echo.
pause
