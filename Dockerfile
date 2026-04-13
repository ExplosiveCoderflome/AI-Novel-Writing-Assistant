# 基础镜像
FROM node:18

# 设置工作目录
WORKDIR /app

# 复制已经构建好的文件
COPY dist-portable/ .

# 安装依赖
RUN npm install -g pnpm && pnpm install

# 暴露端口
EXPOSE 3000 5173

# 启动应用
CMD ["pnpm", "dev"]