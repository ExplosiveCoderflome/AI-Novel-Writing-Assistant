# AI 小说创作工作台 / AI Novel Production Engine - 项目初始化

## 项目概述
构建一个面向私有化部署的 AI 小说创作工作台，采用前后端分离架构。
本次只初始化项目骨架和核心基础设施，不实现具体业务功能。

## 技术栈要求

### 前端 (client/)
- Vite 5 + React 18 + TypeScript 5
- React Router v6（文件式路由配置）
- TailwindCSS v3 + Shadcn/UI（组件库）
- Zustand v4（客户端状态）
- @tanstack/react-query v5（服务端状态 + 请求缓存）
- Axios（HTTP 客户端，统一封装 baseURL 和错误处理）
- Sonner（Toast 通知）
- Lucide React（图标）
- React Markdown + rehype-highlight（Markdown 渲染）
- Framer Motion（动画，按需）
- React Hook Form + Zod（表单验证）

### 后端 (server/)
- Node.js 20 + Express 4 + TypeScript 5
- LangChain.js (@langchain/core @langchain/openai @langchain/community)
- LangGraph.js (@langchain/langgraph)
- Prisma 5 + SQLite（开发）/ PostgreSQL（生产预留）
- Zod（请求体验证）
- cors + helmet + morgan（基础中间件）
- dotenv（环境变量）
- 流式响应：原生 SSE（text/event-stream）

### 共享 (shared/)
- 纯 TypeScript 类型定义文件
- 前后端共用的请求/响应 interface
- 枚举值（LLM provider、角色类型、世界维度等）

## 目录结构

请生成以下完整目录结构：
├── client/
│ ├── src/
│ │ ├── api/ # Axios 请求封装（按业务模块分文件）
│ │ │ ├── client.ts # Axios 实例（baseURL、拦截器）
│ │ │ ├── novel.ts
│ │ │ ├── world.ts
│ │ │ ├── character.ts
│ │ │ ├── writingFormula.ts
│ │ │ ├── chat.ts
│ │ │ └── settings.ts
│ │ ├── components/
│ │ │ ├── ui/ # Shadcn/UI 组件（直接放置，不分子目录）
│ │ │ ├── layout/
│ │ │ │ ├── AppLayout.tsx # 主布局（Navbar + Sidebar + Content）
│ │ │ │ ├── Navbar.tsx
│ │ │ │ └── Sidebar.tsx
│ │ │ └── common/ # 通用业务组件
│ │ │ ├── LLMSelector.tsx # 模型选择器（全局复用）
│ │ │ ├── StreamOutput.tsx # SSE 流式内容展示组件
│ │ │ └── MarkdownViewer.tsx
│ │ ├── pages/ # 页面组件（对应路由）
│ │ │ ├── Home.tsx
│ │ │ ├── novels/
│ │ │ │ ├── NovelList.tsx
│ │ │ │ ├── NovelCreate.tsx
│ │ │ │ └── NovelEdit.tsx
│ │ │ ├── worlds/
│ │ │ │ ├── WorldList.tsx
│ │ │ │ └── WorldGenerator.tsx
│ │ │ ├── chat/
│ │ │ │ └── ChatPage.tsx
│ │ │ ├── writingFormula/
│ │ │ │ └── WritingFormulaPage.tsx
│ │ │ ├── characters/
│ │ │ │ └── CharacterLibrary.tsx
│ │ │ ├── settings/
│ │ │ │ └── SettingsPage.tsx
│ │ │ └── astrology/
│ │ │ └── AstrologyPage.tsx
│ │ ├── store/ # Zustand stores
│ │ │ ├── llmStore.ts # 当前选择的 LLM provider/model
│ │ │ ├── chatStore.ts # 聊天历史（IndexedDB 持久化）
│ │ │ └── uiStore.ts # UI 状态（侧边栏折叠等）
│ │ ├── hooks/ # 自定义 React Hooks
│ │ │ ├── useSSE.ts # SSE 流式请求 Hook
│ │ │ └── useLocalDB.ts # IndexedDB 操作 Hook
│ │ ├── lib/
│ │ │ ├── utils.ts # cn() 工具函数（Shadcn 用）
│ │ │ └── constants.ts # 常量（API_BASE_URL 等）
│ │ ├── router/
│ │ │ └── index.tsx # React Router 路由配置
│ │ ├── types/ # 前端专用类型（继承 shared/）
│ │ └── main.tsx
│ ├── index.html
│ ├── vite.config.ts
│ ├── tailwind.config.ts
│ ├── tsconfig.json
│ └── package.json
│
├── server/
│ ├── src/
│ │ ├── routes/ # Express 路由（按业务模块）
│ │ │ ├── novel.ts
│ │ │ ├── world.ts
│ │ │ ├── character.ts
│ │ │ ├── writingFormula.ts
│ │ │ ├── chat.ts
│ │ │ ├── settings.ts
│ │ │ └── astrology.ts
│ │ ├── services/ # 业务逻辑层
│ │ │ ├── novel/
│ │ │ │ ├── NovelService.ts
│ │ │ │ └── ChapterService.ts
│ │ │ ├── world/
│ │ │ │ └── WorldService.ts
│ │ │ └── writingFormula/
│ │ │ └── WritingFormulaService.ts
│ │ ├── graphs/ # LangGraph 工作流定义
│ │ │ ├── novelOutlineGraph.ts # 小说大纲生成图
│ │ │ ├── worldBuildingGraph.ts # 世界观构建图
│ │ │ ├── chapterWritingGraph.ts # 章节写作图
│ │ │ └── characterDesignGraph.ts # 角色设计图
│ │ ├── chains/ # LangChain 链（非图状流程）
│ │ │ ├── writingFormulaChain.ts # 写作公式提取/应用
│ │ │ ├── titleGeneratorChain.ts # 标题生成
│ │ │ └── chatChain.ts # 对话链
│ │ ├── llm/
│ │ │ ├── factory.ts # LLM 工厂（根据 provider 返回对应 ChatModel）
│ │ │ ├── providers.ts # Provider 配置（baseURL、默认模型）
│ │ │ └── streaming.ts # SSE 流式响应工具函数
│ │ ├── db/
│ │ │ └── prisma.ts # Prisma Client 单例
│ │ ├── middleware/
│ │ │ ├── validate.ts # Zod 请求验证中间件
│ │ │ ├── errorHandler.ts # 统一错误处理
│ │ │ └── auth.ts # 【预留】鉴权中间件（默认 passthrough）
│ │ ├── prisma/
│ │ │ └── schema.prisma # 数据库模型（保留原有模型，去掉 User 鉴权字段）
│ │ └── app.ts # Express 应用入口
│ ├── tsconfig.json
│ ├── .env.example
│ └── package.json
│
├── shared/
│ ├── types/
│ │ ├── novel.ts # Novel / Chapter / Character 类型
│ │ ├── world.ts # World / WorldProperty 类型
│ │ ├── writingFormula.ts # WritingFormula 类型
│ │ ├── llm.ts # LLMProvider / ModelConfig 枚举和类型
│ │ └── api.ts # 统一 API 响应格式 ApiResponse<T>
│ ├── tsconfig.json
│ └── package.json
│
├── package.json # Workspace 根（npm workspaces 或 pnpm）
└── README.md
## 核心架构规范

### 1. API 响应统一格式
所有接口返回：
// shared/types/api.ts
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// 流式接口使用 SSE，每帧格式：
// data: {"type": "chunk", "content": "..."}\n\n
// data: {"type": "done"}\n\n
// data: {"type": "error", "error": "..."}\n\n

2. LLM Factory 规范
// server/src/llm/factory.ts
// 支持的 provider：deepseek / siliconflow / openai / anthropic
// 所有 provider 统一返回 BaseChatModel 实例
// Provider 配置从数据库 api_keys 表读取，fallback 到 .env
// 接口：
getLLM(provider: LLMProvider, options?: { model?: string; temperature?: number }): BaseChatModel
// server/src/llm/factory.ts// 支持的 provider：deepseek / siliconflow / openai / anthropic// 所有 provider 统一返回 BaseChatModel 实例// Provider 配置从数据库 api_keys 表读取，fallback 到 .env// 接口：getLLM(provider: LLMProvider, options?: { model?: string; temperature?: number }): BaseChatModel
3. LangGraph 图规范
每个 Graph 文件导出：
// 状态定义（Annotation）
// 节点函数（纯函数，接收 state 返回 Partial<state>）
// 图构建（StateGraph + addNode + addEdge）
// 编译后的 graph（compiledGraph，供 service 调用）
// 流式调用方式：graph.streamEvents(input, { version: "v2" })
// 状态定义（Annotation）// 节点函数（纯函数，接收 state 返回 Partial<state>）// 图构建（StateGraph + addNode + addEdge）// 编译后的 graph（compiledGraph，供 service 调用）// 流式调用方式：graph.streamEvents(input, { version: "v2" })
4. SSE 流式规范
// server/src/llm/streaming.ts
// streamToSSE(res: Response, generator: AsyncIterable<string>): Promise<void>
// 设置 Content-Type: text/event-stream
// 写入格式：data: JSON.stringify({type, content})\n\n
// 心跳：每 15s 发送 data: {"type":"ping"}\n\n
// 结束：data: {"type":"done"}\n\n
// server/src/llm/streaming.ts// streamToSSE(res: Response, generator: AsyncIterable<string>): Promise<void>// 设置 Content-Type: text/event-stream// 写入格式：data: JSON.stringify({type, content})\n\n// 心跳：每 15s 发送 data: {"type":"ping"}\n\n// 结束：data: {"type":"done"}\n\n
5. 鉴权预留规范
// server/src/middleware/auth.ts
// 当前：直接 next()，不做任何验证
// 预留接口：在 req 上扩展 user 字段（可选）
// 路由层：所有路由都通过 router.use(authMiddleware)，但当前 middleware 直接放行
// 未来只需替换 auth.ts 实现，路由层无需改动
// server/src/middleware/auth.ts// 当前：直接 next()，不做任何验证// 预留接口：在 req 上扩展 user 字段（可选）// 路由层：所有路由都通过 router.use(authMiddleware)，但当前 middleware 直接放行// 未来只需替换 auth.ts 实现，路由层无需改动
6. Prisma Schema 调整
去掉 User 表和所有 userId 外键约束（私有化部署无需多用户）
APIKey 表保留但去掉 userId 字段
WritingFormula / TitleLibrary / World 表去掉 userId 字段
其余模型保持不变
7. 前端 SSE Hook 规范
// client/src/hooks/useSSE.ts
// 封装 EventSource 或 fetch + ReadableStream
// 支持：onChunk / onDone / onError 回调
// 支持：手动 abort（组件卸载时自动中止）
// 接口：useSSE(url, body, options) => { start, abort, content, isStreaming }
// client/src/hooks/useSSE.ts// 封装 EventSource 或 fetch + ReadableStream// 支持：onChunk / onDone / onError 回调// 支持：手动 abort（组件卸载时自动中止）// 接口：useSSE(url, body, options) => { start, abort, content, isStreaming }
初始化任务
请完成以下初始化（不实现业务逻辑）：
创建 monorepo 结构，使用 pnpm workspaces
client/ 初始化：
配置 Vite + React + TypeScript
安装并配置 TailwindCSS + Shadcn/UI（添加 button/input/card/dialog/tabs/select/badge/toast 组件）
配置 React Router v6（含占位路由）
创建 Axios client（含 baseURL 和错误拦截器）
创建 AppLayout（Navbar + 主内容区）
创建 LLMSelector 通用组件骨架
创建 useSSE Hook
配置 TanStack Query Provider
server/ 初始化：
配置 Express + TypeScript + ts-node-dev
配置 CORS（允许 localhost:5173）
创建统一错误处理中间件
创建 authMiddleware（直接 passthrough）
创建 LLM factory（支持 deepseek/openai/siliconflow，统一使用 ChatOpenAI + baseURL）
创建 SSE streaming 工具函数
配置 Prisma（含 schema，SQLite）
创建一个示例路由 /api/health 验证服务正常
shared/ 初始化：
创建所有类型定义文件
配置 TypeScript paths（client 和 server 都引用 shared/types）
根目录创建 .env.example 和 README.md（含本地启动命令）
