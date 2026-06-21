# 本地网文创作工作台配置

这个仓库已经按“用户只做判断和思路，AI 负责规划、写章、审校、回灌事实”的用法做了本地配置。

## 启动

```bash
cd /Users/y2l1/ai-novel-workspace/AI-Novel-Writing-Assistant
pnpm dev
```

打开：

- 前端：<http://localhost:5173>
- 后端：<http://localhost:3000>

## 当前配置

- `server/.env` 已从 Hermes 的 `~/.hermes/.env` 复制 DeepSeek / OpenAI key（文件已被 `.gitignore` 忽略，不会提交）。
- 默认写作模型：DeepSeek `deepseek-chat`。
- 本地数据库：SQLite，适合先把创作主链跑起来。
- RAG/Qdrant：默认关闭，避免没有 Docker/Qdrant 时影响启动。

## 已加的本地改造

1. 新增默认写法模板：`网文自然人味连续流`。
2. 新增默认写法资产：`我的默认网文去 AI 味写法`。
3. 新增全局反 AI 味规则：
   - 禁止模板化转场和导游词；
   - 禁止通用 AI 腔比喻和泛化形容；
   - 禁止说明书式设定倾倒；
   - 鼓励角色专属口吻。
4. 强化章节写作默认提示词：默认要求禁止模板化转场、段尾升华、泛化比喻、设定倾倒和解释型心理描写。
5. 修复本地开发代理默认目标：优先走 `localhost`，避免 macOS/Node 只监听 `::1` 时 Vite 代理打到 `127.0.0.1` 失败。
6. 修复客户端常量模块在 Node 测试环境读取 `import.meta.env` 时报错的问题。

## 推荐使用路径

1. 从“自动导演 / 小说创建”输入一句灵感。
2. 先让系统生成整本方向候选，用户只选方向。
3. 在项目设置里保持：
   - AI 自由度：低；
   - 正文生成后去 AI 味检测与自动修正：开启。
4. 绑定写法资产：`我的默认网文去 AI 味写法`。
5. 先完成故事宏观规划、本书世界、角色准备，再进入章节执行。
6. 每章写完后先走质量修复/写法检测，再确认收稿。
7. 接受章节后让系统回灌事实、人物状态、伏笔和时间线，避免后期乱写。

## 后面学习喜欢的小说

如果之后要导入几本喜欢的小说做风格/结构学习：

1. 优先提供本地文本文件或明确授权可读的来源。
2. 只提取结构、节奏、人物关系、对白方式、设定释放方式，不复制原文长句。
3. 如果要做大规模知识库/RAG，需要先安装 Docker 并启动 Qdrant：

```bash
cd /Users/y2l1/ai-novel-workspace/AI-Novel-Writing-Assistant
docker compose -f infra/docker-compose.qdrant.yml up -d
```

然后把 `server/.env` 里的 `RAG_ENABLED=false` 改为 `RAG_ENABLED=true`，重启 `pnpm dev`。

## Hermes skills

已安装/创建：

- `long-webnovel-studio`：这个本地工作台的总流程 skill。
- `chinese-novelist`：中文分章节小说创作 skill。
- `humanizer`：去 AI 味写作检查。
- `serialized-fiction-research`：后续研究长篇网文和参考小说时使用。

`novel-architect` 社区 skill 因安全扫描发现零宽字符/风险提示，被 Hermes 阻止安装；没有强制绕过。
