#!/bin/bash

# 检查fnpack是否安装
if ! command -v fnpack &> /dev/null; then
    echo "安装fnpack..."
    npm install -g @fnnas/fnpack
fi

# 创建飞牛应用目录结构
echo "创建应用目录结构..."
mkdir -p fnas-app

# 复制必要文件
echo "复制必要文件..."
cp -r server fnas-app/
cp -r client fnas-app/
cp -r shared fnas-app/
cp package.json fnas-app/
cp pnpm-lock.yaml fnas-app/
cp pnpm-workspace.yaml fnas-app/
cp fnas.json fnas-app/
cp Dockerfile.fnas fnas-app/Dockerfile
cp start.sh fnas-app/
cp icon.png fnas-app/

# 进入应用目录
cd fnas-app

# 打包应用
echo "打包应用..."
fnpack build ai-novel-writing-assistant

# 复制打包后的文件到上层目录
echo "复制打包后的文件..."
cp dist/ai-novel-writing-assistant.fpk ../

# 清理临时目录
echo "清理临时目录..."
cd ..
rm -rf fnas-app

echo "打包完成！"
echo "应用包位置: ai-novel-writing-assistant.fpk"