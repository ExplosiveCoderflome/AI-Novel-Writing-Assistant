# 基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装pnpm
RUN npm install -g pnpm

# 复制package.json和pnpm-lock.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 安装依赖
RUN pnpm install

# 复制所有代码
COPY . .

# 构建项目
RUN pnpm build

# 暴露端口
EXPOSE 3000 5173

# 启动应用
CMD ["sh", "start.sh"]