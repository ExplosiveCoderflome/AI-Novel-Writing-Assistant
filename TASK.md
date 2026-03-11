
## 修改计划：AI 小说写作助手 v2 架构增强

---

### 阶段一：创作决策记忆系统

**灵感来源：** OpenClaw 四层记忆架构
**优先级：** 最高（对生成质量影响最直接）
**预估工作量：** 中

#### 1.1 数据模型扩展

在 `schema.prisma` 中新增模型：

```prisma
model CreativeDecision {
  id         String   @id @default(cuid())
  novelId    String
  chapterId  String?
  category   String   // "plot_turn" | "character_change" | "style_pref" | "world_rule" | "foreshadow" | "avoid"
  content    String   // 决策描述
  importance String   @default("normal") // "critical" | "normal" | "minor"
  expiresAt  Int?     // 可选：在第 N 章后失效
  createdAt  DateTime @default(now())
  novel      Novel    @relation(...)
}

model WritingSession {
  id         String   @id @default(cuid())
  novelId    String
  startedAt  DateTime @default(now())
  endedAt    DateTime?
  decisions  Json?    // 本次会话产生的决策 ID 列表
  editDiffs  Json?    // 用户对 AI 生成内容的修改摘要
}
```

#### 1.2 创作决策采集

- **显式采集**：在前端章节编辑页新增"创作笔记"侧边面板，用户可随时记录创作决策
- **隐式采集**：在 `NovelService.createChapterStream` 的 `onDone` 回调中，对比 AI 生成内容与用户最终保存内容，用 LLM 提取用户修改意图，自动写入 `CreativeDecision`
- **管线采集**：在 `executePipeline` 的审校/修复环节，将审校发现的问题和修复策略记录为决策

#### 1.3 上下文注入增强

修改 `NovelService.buildContextText`，在现有上下文基础上增加：

```typescript
// 在 buildContextText 中新增
const decisions = await prisma.creativeDecision.findMany({
  where: {
    novelId,
    OR: [
      { expiresAt: null },
      { expiresAt: { gte: chapterOrder } }
    ]
  },
  orderBy: [
    { importance: 'desc' },
    { createdAt: 'desc' }
  ],
  take: 20
});
// 按 category 分组，注入到 system prompt
```

#### 1.4 前端界面

- `client/src/pages/` 下新增 `CreativeDecisionPanel` 组件
- 集成到 `NovelChapterEdit` 页面的侧边栏
- 支持决策的增删改查、重要性标记、过期设置

---

### 阶段二：事件驱动钩子系统

**灵感来源：** OpenCode 20+ 事件钩子
**优先级：** 高（解耦现有硬编码逻辑，提升可扩展性）
**预估工作量：** 中高

#### 2.1 事件总线基础设施

新建 `server/src/events/` 目录：

```
server/src/events/
├── EventBus.ts          // 核心事件总线（基于 EventEmitter3 或自实现）
├── types.ts             // 事件类型定义
├── handlers/
│   ├── onChapterDrafted.ts
│   ├── onChapterUpdated.ts
│   ├── onCharacterChanged.ts
│   ├── onWorldSettingUpdated.ts
│   ├── onOutlineRevised.ts
│   ├── onPipelineCompleted.ts
│   └── index.ts
└── index.ts
```

#### 2.2 事件类型定义

```typescript
// server/src/events/types.ts
type NovelEvent =
  | { type: 'chapter:drafted';    payload: { novelId, chapterId, chapterOrder } }
  | { type: 'chapter:updated';    payload: { novelId, chapterId, changedFields: string[] } }
  | { type: 'chapter:reviewed';   payload: { novelId, chapterId, qualityScore } }
  | { type: 'character:changed';  payload: { novelId, characterId, changedFields: string[] } }
  | { type: 'world:updated';      payload: { worldId, changedFields: string[] } }
  | { type: 'outline:revised';    payload: { novelId, outlineType: 'outline' | 'structured' } }
  | { type: 'pipeline:completed'; payload: { novelId, jobId, status } }
  | { type: 'novel:exported';     payload: { novelId, format } }
```

#### 2.3 重构现有硬编码逻辑

当前 `NovelService` 中 `syncChapterArtifacts` 承担了过多职责（提取 fact、生成摘要、更新 RAG 索引）。重构为：

- `syncChapterArtifacts` → 仅做数据写入
- 其余逻辑迁移到事件处理器：
  - `onChapterDrafted`：触发摘要生成（`NovelChapterSummaryService`）、fact 提取、RAG 索引
  - `onCharacterChanged`：触发受影响章节的一致性标记
  - `onWorldSettingUpdated`：触发全局一致性扫描任务

#### 2.4 钩子注册机制

```typescript
// server/src/events/EventBus.ts
class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  on(eventType: string, handler: EventHandler, priority?: number): void;
  emit(event: NovelEvent): Promise<void>;  // 按优先级顺序执行
  off(eventType: string, handler: EventHandler): void;
}

// 应用启动时注册
eventBus.on('chapter:drafted', handleSummaryGeneration, 10);
eventBus.on('chapter:drafted', handleFactExtraction, 20);
eventBus.on('chapter:drafted', handleRagIndexUpdate, 30);
```

---

### 阶段三：专家代理团队

**灵感来源：** OpenCode 双层代理架构（Primary + Subagent）
**优先级：** 高（直接提升生成质量）
**预估工作量：** 高

#### 3.1 Agent 抽象层

新建 `server/src/agents/` 目录：

```
server/src/agents/
├── BaseAgent.ts         // 代理基类：name, role, systemPrompt, preferredModel, temperature
├── PlannerAgent.ts      // 情节规划代理
├── WriterAgent.ts       // 文本生成代理
├── EditorAgent.ts       // 审校代理
├── ContinuityAgent.ts   // 连贯性检查代理
├── AgentOrchestrator.ts // 代理编排器
├── types.ts
└── index.ts
```

#### 3.2 代理定义

```typescript
// 每个 Agent 独立配置模型、temperature 和系统提示
interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  preferredProvider?: LLMProvider;
  preferredModel?: string;
  temperature?: number;
  maxTokens?: number;
}

// PlannerAgent: 低 temperature，强推理模型
// WriterAgent: 较高 temperature，创意模型
// EditorAgent: 低 temperature，精确模型
// ContinuityAgent: 低 temperature，长上下文模型
```

#### 3.3 编排器与管线集成

重构 `executePipeline`，将当前内联的生成逻辑替换为代理调用：

```
当前流程：
  executePipeline → 内联 LLM 调用（plan+draft → review → repair）

新流程：
  executePipeline → AgentOrchestrator.runChapterPipeline(chapter)
    → PlannerAgent.planScene(context)     // 场景规划
    → WriterAgent.draft(scenePlan)        // 正文生成
    → EditorAgent.review(draft)           // 质量审校
    → ContinuityAgent.check(draft)        // 连贯性检查
    → WriterAgent.repair(draft, issues)   // 按需修复
```

#### 3.4 激活 chapterWritingGraph

当前 `chapterWritingGraph.ts` 已定义但**未被任何代码调用**。将其接入管线：

- 每个 graph 节点绑定对应的 Agent
- `planScene` → PlannerAgent
- `generateContent` → WriterAgent
- `summarizeChapter` → 快速模型（降低成本）

#### 3.5 用户可配置代理参数

在 `SettingsPage` 或 `NovelEdit` 的 `BasicInfoTab` 中，允许用户为每个代理角色选择模型和调整 temperature。数据存储在 Novel 级别或全局 Settings 中。

---

### 阶段四：智能模型路由

**灵感来源：** OpenCode 多模型任务路由
**优先级：** 中高（与阶段三配合，提升质量和成本效率）
**预估工作量：** 中

#### 4.1 模型路由配置

扩展 `server/src/llm/` 目录：

```
server/src/llm/
├── factory.ts           // 现有
├── providers.ts         // 现有
├── modelRouter.ts       // 新增：任务→模型路由
├── modelCatalog.ts      // 现有
├── capabilities.ts      // 现有，扩展
└── streaming.ts         // 现有
```

#### 4.2 路由策略

```typescript
// server/src/llm/modelRouter.ts
type TaskType =
  | 'outline_planning'      // 大纲规划
  | 'chapter_drafting'       // 正文生成
  | 'chapter_review'         // 审校
  | 'chapter_repair'         // 修复
  | 'summary_generation'     // 摘要生成
  | 'fact_extraction'        // fact 提取
  | 'consistency_check'      // 一致性检查
  | 'character_dialogue'     // 角色对话
  | 'style_analysis'         // 风格分析

interface ModelRouteConfig {
  taskType: TaskType;
  preferredProvider: LLMProvider;
  preferredModel: string;
  temperature: number;
  fallbackProvider?: LLMProvider;
  fallbackModel?: string;
}

function resolveModel(taskType: TaskType, userOverride?: LLMGenerateOptions): ResolvedModel;
```

#### 4.3 数据库存储路由配置

在 `schema.prisma` 中新增：

```prisma
model ModelRouteConfig {
  id        String @id @default(cuid())
  taskType  String @unique
  provider  String
  model     String
  temperature Float @default(0.7)
  maxTokens Int?
}
```

#### 4.4 前端设置页

在 `SettingsPage` 中新增"模型路由"标签页，以表格形式展示每种任务类型对应的模型配置，支持逐条编辑。

#### 4.5 与 factory.ts 集成

修改 `getLLM` 函数，增加 `taskType` 参数：

```typescript
// 当前: getLLM(provider, options)
// 新增: getLLM(provider, options, taskType?)
// 若提供 taskType 且存在路由配置，优先使用路由配置的 provider/model/temperature
```



### 阶段六：叙事距离感知检索

**灵感来源：** OpenClaw 记忆时间衰减
**优先级：** 中（精细化提升生成连贯性）
**预估工作量：** 低

#### 6.1 修改 HybridRetrievalService

在 `server/src/services/rag/HybridRetrievalService.ts` 中，为检索结果增加叙事距离加权：

```typescript
// 在 RRF 融合后，增加距离衰减
function applyNarrativeDecay(
  chunks: RetrievedChunk[],
  currentChapterOrder: number,
  decayRate: number = 0.05
): RetrievedChunk[] {
  return chunks.map(chunk => {
    const chapterOrder = chunk.metadata?.chapterOrder;
    if (!chapterOrder) return chunk; // 非章节内容不衰减

    const distance = Math.abs(currentChapterOrder - chapterOrder);
    const isCritical = chunk.metadata?.importance === 'critical'; // 关键内容不衰减
    const decayFactor = isCritical ? 1.0 : Math.exp(-decayRate * distance);

    return { ...chunk, score: chunk.score * decayFactor };
  });
}
```

#### 6.2 元数据增强

在 `RagIndexService` 写入 Qdrant 时，payload 中增加 `chapterOrder` 和 `importance` 字段，使检索时可用于距离计算。

#### 6.3 关键内容标记

结合阶段一的 `CreativeDecision`（`importance: "critical"`）和已有的 `ConsistencyFact`，将这些标记为不衰减的"锚点内容"。

---

### 阶段七：AI 推理过程可视化

**灵感来源：** OpenClaw 文件优先/透明化哲学
**优先级：** 中（提升用户对 AI 的控制感）
**预估工作量：** 中

#### 7.1 推理轨迹记录

新增数据模型：

```prisma
model GenerationTrace {
  id          String   @id @default(cuid())
  novelId     String
  chapterId   String?
  jobId       String?  // 关联 GenerationJob
  stage       String   // "plan_scene" | "generate_content" | "review" | "repair" | ...
  input       String   // 该阶段的输入上下文摘要
  output      String   // 该阶段的输出
  model       String   // 使用的模型
  tokenUsage  Json?    // { prompt, completion, total }
  durationMs  Int?
  createdAt   DateTime @default(now())
}
```

#### 7.2 LangGraph 节点插桩

在每个 graph 节点执行前后记录 trace：

```typescript
// 包装 graph 节点
function traced(nodeName: string, fn: NodeFunction): NodeFunction {
  return async (state) => {
    const start = Date.now();
    const result = await fn(state);
    await prisma.generationTrace.create({
      data: {
        novelId: state.novelId,
        chapterId: state.chapterId,
        stage: nodeName,
        input: summarize(state), // 压缩输入
        output: summarize(result),
        model: state.model,
        durationMs: Date.now() - start
      }
    });
    return result;
  };
}
```

#### 7.3 前端推理轨迹查看器

在 `NovelChapterEdit` 页面新增"生成轨迹"面板：

- 以时间线形式展示每个阶段的推理过程
- 可展开查看详细的输入/输出
- 显示模型选择和 token 消耗
- 用户可以点击某个阶段"从此处重新生成"，修改输入后重跑后续阶段

---

### 阶段八：创作快照与版本回溯

**灵感来源：** OpenClaw Git 式版本管理 + 现有世界观 snapshot 机制
**优先级：** 低（锦上添花，但长期价值高）
**预估工作量：** 中高

#### 8.1 小说级快照

```prisma
model NovelSnapshot {
  id              String   @id @default(cuid())
  novelId         String
  label           String?  // 用户自定义标签，如 "大纲定稿" "第一卷完成"
  snapshotData    String   // JSON: { novel, chapters, characters, outline, bible, ... }
  triggerType     String   // "manual" | "auto_milestone" | "before_pipeline"
  createdAt       DateTime @default(now())
}
```

#### 8.2 自动快照时机

- 管线启动前自动创建快照（`executePipeline` 入口）
- 结构化大纲同步章节前（`syncChaptersFromOutline`）
- 用户手动触发

#### 8.3 快照恢复

- `NovelService` 新增 `restoreFromSnapshot(snapshotId)` 方法
- 恢复时仅覆盖内容字段，保留 ID 不变
- 恢复前必须创建当前状态的快照（防止误操作）

#### 8.4 前端快照管理

在 `NovelEdit` 中新增"版本历史"标签页，支持快照列表、预览对比、恢复操作。

---

### 实施顺序建议

```
阶段六（叙事距离衰减） ──────── 工作量低，立竿见影
  ↓
阶段一（创作决策记忆） ──────── 核心能力增强
  ↓
阶段二（事件钩子系统） ──────── 架构解耦，为后续铺路
  ↓
阶段四（智能模型路由） ──────── 独立模块，可并行开发
  ↓
阶段三（专家代理团队） ──────── 依赖阶段二和四，最大改动
  ↓
阶段七（推理可视化）   ──────── 依赖阶段三的 Agent 体系
  ↓
阶段五（后台守护进程） ──────── 依赖阶段二的事件系统
  ↓
阶段八（创作快照）     ──────── 独立功能，可任意时间点开发
```

每个阶段都可独立交付使用价值，不存在"必须全部完成才能用"的情况。如果有你特别想优先推进的方向，可以进一步细化该阶段的技术方案。