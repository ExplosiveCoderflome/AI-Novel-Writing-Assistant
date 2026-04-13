#!/bin/bash

# 进入应用目录
cd "$(dirname "$0")"

# 安装pnpm（如果未安装）
if ! command -v pnpm &> /dev/null; then
    echo "安装pnpm..."
    npm install -g pnpm
fi

# 安装依赖（如果node_modules不存在）
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    pnpm install
fi

# 构建项目
if [ ! -d "server/dist" ] || [ ! -d "client/dist" ]; then
    echo "构建项目..."
    pnpm build
fi

# 启动应用
echo "启动应用..."
pnpm dev