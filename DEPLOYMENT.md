# 飞牛 NAS 部署指南

## 方法一：使用 Docker Compose 部署

### 步骤 1：准备部署文件

1. 在飞牛 NAS 上创建一个新的共享文件夹，例如 `ai-novel-writing-assistant`
2. 将以下文件复制到该文件夹中：
   - `docker-compose-freenas.yml`
   - `package.json`
   - `pnpm-lock.yaml`
   - `pnpm-workspace.yaml`
   - 整个 `server` 目录
   - 整个 `client` 目录
   - 整个 `shared` 目录

### 步骤 2：创建环境变量文件

在该文件夹中创建一个 `.env` 文件，配置所需的 API 密钥：

```env
# 基本配置
PORT=3000
HOST=0.0.0.0
ALLOW_LAN=true
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,https://aibook.kklin.cc.cd
DATABASE_URL=file:./dev.db

# API 密钥
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
SILICONFLOW_API_KEY=
ANTHROPIC_API_KEY=
XAI_API_KEY=
KIMI_API_KEY=
GLM_API_KEY=
QWEN_API_KEY=
GEMINI_API_KEY=
LONGCAT_API_KEY=

# RAG 配置
RAG_ENABLED=true
QDRANT_URL=http://127.0.0.1:6333
```

### 步骤 3：启动容器

在飞牛 NAS 的 Docker 管理界面中：

1. 点击「项目」->「添加」
2. 选择「从本地文件上传」
3. 上传 `docker-compose-freenas.yml` 文件
4. 点击「应用」开始部署

### 步骤 4：访问应用

部署完成后，你可以通过以下地址访问应用：
- 前端：http://<NAS IP>:5173
- 后端：http://<NAS IP>:3000

## 方法二：使用可移植压缩包部署

### 步骤 1：准备文件

1. 在飞牛 NAS 上创建一个新的共享文件夹，例如 `ai-novel-writing-assistant`
2. 将 `AI-Novel-Writing-Assistant.zip` 压缩包复制到该文件夹中
3. 解压压缩包

### 步骤 2：安装依赖

1. 通过 SSH 连接到飞牛 NAS
2. 进入解压后的目录
3. 运行以下命令安装依赖：
   ```bash
   npm install -g pnpm
   pnpm install
   ```

### 步骤 3：启动应用

运行以下命令启动应用：
```bash
pnpm dev
```

### 步骤 4：设置自启动

在飞牛 NAS 的计划任务中添加一个启动任务，在系统启动时自动运行应用：

1. 打开飞牛 NAS 的管理界面
2. 点击「控制面板」->「计划任务」
3. 点击「添加」->「触发任务」->「用户定义的脚本」
4. 设置任务名称，例如「启动 AI 小说写作助手」
5. 设置触发方式为「开机」
6. 在「命令」中输入：
   ```bash
   cd /path/to/ai-novel-writing-assistant && pnpm dev
   ```
7. 点击「确定」保存任务

## 注意事项

1. **资源需求**：建议为容器分配至少 2GB 内存
2. **网络配置**：确保 NAS 防火墙允许 3000 和 5173 端口的访问
3. **数据备份**：定期备份 `dev.db` 文件以防止数据丢失
4. **API 密钥**：根据需要配置相应的 API 密钥，未配置的服务将不可用

## 故障排查

如果遇到部署问题，请检查：

1. Docker 服务是否正常运行
2. 端口是否被占用
3. 环境变量是否正确配置
4. 日志中是否有错误信息

如果需要进一步的帮助，请参考飞牛 NAS 的官方文档或联系技术支持。