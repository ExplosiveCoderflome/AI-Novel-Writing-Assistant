#!/bin/bash

# 设置Docker镜像源
export DOCKER_BUILDKIT=1
export BUILDKIT_PROGRESS=plain

# 构建镜像
docker build -t ai-novel-writing-assistant .

# 导出镜像
docker save -o C:\Users\fa\Documents\trae\aixiaoshuo\ai-novel-writing-assistant.tar ai-novel-writing-assistant

echo "镜像构建和导出完成！"
echo "镜像文件位置: C:\Users\fa\Documents\trae\aixiaoshuo\ai-novel-writing-assistant.tar"