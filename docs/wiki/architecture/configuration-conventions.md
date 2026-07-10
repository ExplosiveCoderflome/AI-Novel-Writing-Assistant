# 配置项归属与可见性规范

## 背景

项目运行时配置散布在三个层面：

- **`.env` / `process.env`**：进程启动时一次性读取，运行中不可变；普通用户不可见、不可改。
- **`AppSetting` 数据库表**：通过设置面板暴露给用户，热更新到 `ragConfig` 等内存对象，所有用户均可见、可改。
- **代码硬编码常量**：作为兜底默认值，不暴露给任何外部接口。

历史上多次出现"新功能加配置直接写进 `.env`"的现象，导致：

- 用户无感：开发者改了默认行为，运维不知道、用户不知道，问题排查反复来回。
- 进程隔离：用户在 PowerShell 临时 `$env:X=1` 后启动 dev server，关闭 PowerShell 后 `process.env` 仍保留旧值，重启服务才生效。
- 多实例不一致：同一份代码部署在不同机器上，env 不同步导致行为分裂。
- Wiki/文档落后：env 文档只在 `.env.example` 维护，前端用户根本没机会看到。

典型事故：`EMBEDDING_CONCURRENCY` 在 PowerShell 启动 dev server 时被设过一次，事后清空但进程仍跑着旧值，导致用户看到"4 并发已开启"的代码但实际跑 1 并发。

## 决策

**所有新增的运行时可调参数，禁止仅通过 `.env` 暴露**。必须走 `AppSetting` + 设置面板 UI 路径，让用户在产品内可见、可改、可持久化。

`.env` 只允许承载以下三类配置：

1. **启动期不可变的部署/连接参数**：数据库 URL、监听端口、`NODE_ENV`、`PORT` 等。
2. **凭证/密钥**：API key、token、加密种子等敏感信息（用户不应在 UI 中看到明文）。
3. **历史遗留 env**：迁移到设置面板前的过渡期保留读取，但必须同时支持设置面板覆盖。

业务调优类参数（并发数、超时、批大小、采样率、检索阈值、降级开关等）**必须**进入设置面板。

## 当前规则

### 新增配置项必做四步

1. **后端定义 key 常量**：在 `server/src/services/settings/ragSettingKeys.ts`（或对应模块的 settingKeys 文件）声明字符串常量，加入该模块的 `*_SETTING_KEYS` 数组。
2. **后端加载/保存**：在对应 `*SettingsService.ts`（如 `RagSettingsService` / `RagRuntimeSettingsService`）的 type、`applyRuntimeSettings`、`getDefaultSettings`、`get*Settings`、`save*Settings`、`upsert` 列表五处都加上新字段。
3. **后端路由 schema**：在 `server/src/routes/settings.ts` 的 zod schema 加字段，PUT handler 透传到 service。
4. **前端 UI**：
   - `client/src/api/settings.ts`：`*Status` 类型 + `save*Settings` payload 类型 + `Pick<>` 返回类型三处加字段。
   - `client/src/pages/*/Page.tsx` 或对应 Page 文件：`useState` 初值 + load `useEffect` + save `onSuccess` + mutate handler 四处加字段。
   - 对应 `*SettingsCard.tsx`：在合适分区加 `<Input>` 控件，配文字说明（默认值、调优指引、上限来源）。

`ragConfig` 等内存配置对象保留这些字段，但仅作为默认值，**不允许从 `process.env` 直接读取**。

### 哪些场景仍允许走 env

- `DATABASE_URL`、`PORT`、`HOST`、`NODE_ENV`、`SHADOW_DATABASE_URL` 等部署期固定参数。
- API key（`OPENAI_API_KEY` 等）。`AppSetting` 可以覆盖，但 env 是首次启动的兜底。
- `*_TIMEOUT_MS` 这类**仅启动期需要**且没有运行时调整需求的参数（极少见，能放面板就放面板）。
- 调试开关：`*_VERBOSE_LOG`、`DEBUG=*`。

### 哪些场景禁止走 env

- 并发数、批大小、采样率、阈值、retry 次数、退避时间等所有"业务调优"参数。
- 任何用户在"为什么慢/为什么贵/为什么不召回"场景下可能想调的参数。
- 任何对成本/速率/质量有直接影响的参数。

## 示例

### ✅ 推荐：新加一个 `embeddingConcurrency` 参数

```ts
// 1. ragSettingKeys.ts
export const RAG_EMBEDDING_CONCURRENCY_KEY = "rag.embeddingConcurrency";
// 加入 RAG_EMBEDDING_SETTING_KEYS

// 2. config/rag.ts
// 仅作为默认值，禁止读 process.env
embeddingConcurrency: 4,

// 3. RagSettingsService.ts
// 在 type / apply / default / get / save / upsert 五处加字段
embeddingConcurrency: clampInt(input.embeddingConcurrency, previous.embeddingConcurrency, 1, 16),

// 4. routes/settings.ts schema
embeddingConcurrency: z.coerce.number().int().min(1).max(16),

// 5. 前端
// api/settings.ts 类型加字段；KnowledgePage form state；KnowledgeEmbeddingSettingsCard 加 Input
```

用户上线后，去"知识检索设置 → 高级配置 → Embedding 请求行为"就能看到这个参数，改完点保存即生效，无需重启。

### ❌ 禁止：直接写 env

```ts
// config/rag.ts —— 错误示范
embeddingConcurrency: asInt(process.env.EMBEDDING_CONCURRENCY, 4, 1, 16),
```

这种写法会让用户无法发现该参数存在，并且会出现"PowerShell 临时变量 + 长跑进程"的滞留问题。

## 失败模式

- **症状**：开发者改了默认值（如把 batchSize 从 16 改到 64），但只在 `.env.example` 改了，实际线上 `.env` 仍是旧值；或反过来 env 设的值跟代码默认值打架。
  - **排查**：grep 该字段所有读取点，确认是否还有 `process.env` 直读；查 `AppSetting` 表里的实际值。
  - **不能用的短期手段**：让用户改 `.env` 后重启。这会让"用户感知"的问题继续累积。

- **症状**：用户反馈"我已经调到 X 了为什么没生效"。
  - **排查**：确认配置是否走 `AppSetting`（前端能看到说明走的是面板）；如果走面板，看后端 `apply*RuntimeSettings` 是否真的写到了内存对象；看是否有第三处缓存（如 module-level 常量没刷新）。

- **症状**：长跑 dev server 行为与 `.env` 不一致。
  - **常见原因**：启动 shell 当时的 env 与现在不同；解决办法是禁止业务参数走 env，让用户改面板生效。

## 相关模块

- `server/src/config/rag.ts`
- `server/src/services/settings/ragSettingKeys.ts`
- `server/src/services/settings/RagSettingsService.ts`
- `server/src/services/settings/RagRuntimeSettingsService.ts`
- `server/src/routes/settings.ts`
- `client/src/api/settings.ts`
- `client/src/pages/knowledge/KnowledgePage.tsx`
- `client/src/pages/knowledge/components/KnowledgeEmbeddingSettingsCard.tsx`

## 来源文档

- 引发该规范的会话：知识库索引并发参数（`EMBEDDING_CONCURRENCY` / `QDRANT_UPSERT_CONCURRENCY`）初次落 env 后被识别为反模式，全量迁移到 `AppSetting` + 设置面板。
