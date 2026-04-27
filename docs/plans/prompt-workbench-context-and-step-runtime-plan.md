# 提示词工作台、上下文装配与统一步骤运行时方案

更新日期：2026-04-28

关联文档：

- `docs/plans/auto-director-unified-runtime-refactor-plan.md`
- `docs/plans/auto-director-mvp-migration-plan.md`

## 1. 文档定位

本文记录提示词可视化编辑、提示词拼接时的数据获取、创作中枢兼容、自动导演与章节流水线统一运行时的长期方案。

核心结论：

- 提示词工作台不应只是一个大文本框，而应是 Prompt、Context、Step Runtime 的统一观察与调试入口。
- 提示词模板不直接查数据库。数据获取由统一 Context Broker / Resolver 负责。
- 自动导演模式与章节流水线不应长期分成两套链路。它们应共同调用同一批 Step Module。
- 创作中枢、自动导演、章节流水线和手动按钮都应进入统一 Workflow Plan，再由 Step Module Runtime 执行。

本文中的 TypeScript 结构是概念契约，落地时应结合现有 `server/src/prompting/`、`server/src/creativeHub/`、`server/src/services/novel/director/`、`server/src/services/novel/runtime/` 和 workflow task 体系逐步迁移。

## 2. 当前基础与约束

当前项目已经具备较好的 prompt 基座：

- `server/src/prompting/core/promptTypes.ts` 定义 `PromptAsset`、`PromptContextBlock`、`ContextPolicy`、`PromptInvocationMeta`。
- `server/src/prompting/core/promptRunner.ts` 统一处理注册检查、上下文筛选、结构化输出、repair、semantic retry 和日志。
- `server/src/prompting/registry.ts` 统一注册产品级 prompt。
- `server/src/prompting/prompts/novel/chapterLayeredContext.ts` 已经把章节写作上下文拆成多个 `PromptContextBlock`。
- `server/src/services/novel/runtime/GenerationContextAssembler.ts` 已经有章节运行时上下文装配雏形。
- `server/src/creativeHub/CreativeHubLangGraph.ts` 已有创作中枢图执行入口、resource binding、checkpoint、interrupt 和 AgentRun 记录。

因此本方案不建议把 prompt 变成纯数据库字符串，也不建议让可视化编辑器直接替代 `PromptAsset`。更合理的方向是保留代码级安全基座，在其上增加可视化、可审计、可回滚的覆盖层。

必须遵守的项目约束：

- 产品级 prompt 仍以 `server/src/prompting/` 为治理入口。
- 意图识别、任务分类、规划、路由、工具选择等决策路径必须保持 AI-first。
- 不用关键词匹配、硬编码 regex 或非 AI fallback 掩盖 AI 理解失败。
- 面向新手用户时，应优先降低认知负担，让系统给出清晰默认值和自动推荐。
- 自动导演、章节生产、创作中枢的扩展能力应走统一契约，不继续堆叠大型 service 分支。

## 3. 总体架构

长期目标是把系统拆成三层：

```text
Prompt = 模板表达与输出契约
Context = 数据、记忆、检索、状态与预算选择
Orchestration = 创作中枢 / 自动导演 / 章节流水线 / 手动入口
```

统一调用链：

```text
创作中枢 / 自动导演 / 手动按钮 / 预设章节流水线
  ↓
Workflow Planner
  ↓
Workflow Plan
  ↓
Step Module Runtime
  ↓
Context Broker
  ↓
Prompt Runner
  ↓
Artifact / State / Event / Trace
```

关键判断：

- 自动导演不是章节流水线的上层包装。
- 章节流水线不是一个独立大黑箱。
- 两者都应调用同一批创作步骤模块。
- 区别只在于谁生成 `WorkflowPlan`，以及使用什么执行策略。

## 4. 提示词工作台设计

### 4.1 三层 Prompt 模型

第一层：Base PromptAsset。

- 由代码维护。
- 负责稳定默认行为。
- 包含 `id`、`version`、`taskType`、`mode`、`contextPolicy`、`outputSchema`、`render()`、`postValidate()`。
- 是测试、发布、回滚和故障诊断的安全基线。

第二层：Prompt Override。

- 由数据库保存。
- 只覆盖被声明为可编辑的片段。
- 不直接替换整个 PromptAsset。
- 支持草稿、发布、回滚、灰度和实验。

第三层：Prompt Experiment。

- 用于 A/B、灰度、样例集测试和失败率比较。
- 记录命中条件、目标入口、启用范围、验证结果和回滚状态。

### 4.2 可编辑与不可编辑边界

普通编辑可修改：

- 表达风格。
- 审稿标准。
- 章节生成语气与节奏偏好。
- 标题、摘要、开篇、结尾钩子的写作要求。
- 面向用户的追问方式和选项组织方式。

高级配置可调整：

- 可选上下文组优先级。
- 预算配置。
- 是否允许刷新某类上下文。
- 某些非关键上下文组是否启用。

默认不开放自由编辑：

- `outputSchema`。
- `postValidate`。
- `semanticRetryPolicy`。
- intent 枚举。
- 工具目录。
- 权限摘要。
- 关键 required context groups。
- 审批策略和破坏性操作边界。

### 4.3 Override 数据形态

不要保存一整段自由文本覆盖全部 prompt。建议保存结构化 slots：

```ts
type PromptOverrideDraft = {
  promptId: string;
  baseVersion: string;
  scope: "global" | "project" | "novel" | "experiment";
  slots: Record<string, string>;
  notes?: string;
};
```

示例：

```json
{
  "promptId": "novel.chapter.writer",
  "baseVersion": "v5",
  "scope": "global",
  "slots": {
    "system.role": "你是中文长篇网络小说写作助手。",
    "system.structureRules": "开头迅速进入当前情境，中段必须有推进，结尾必须留下下一章压力。",
    "system.antiAiRules": "避免空泛心理独白、重复回顾和无信息量描写。"
  }
}
```

Base PromptAsset 负责声明哪些 slots 可编辑：

```ts
type PromptEditableSlot = {
  key: string;
  label: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  maxLength?: number;
  defaultValue: string;
};
```

### 4.4 工作台界面能力

提示词工作台建议包含：

- Prompt Catalog：按能力、工作流、任务类型查看注册 prompt。
- Slot Editor：片段化编辑，不把用户扔进整段 system prompt。
- Context Preview：查看本次会使用哪些上下文块。
- Final Messages Preview：预览最终 system / human messages。
- Diff View：比较 Base、Override、Compiled Prompt。
- Test Case Runner：选择小说、章节、创作中枢线程或样例输入做 dry-run。
- Validation Report：显示 schema、postValidate、token 预算、required block、风险检查。
- Publish / Rollback：发布、撤回、回滚到历史 revision。
- Trace Explorer：从一次任务失败回看 prompt 版本、上下文块、模型、输出和错误。

对普通创作者，前台不应暴露“提示词工程”概念，而应包装成创作策略：

- 节奏更快。
- 爽点更密。
- 文风更口语。
- 章节结尾更强。
- 减少 AI 味。
- 更重角色拉扯。

系统再把这些策略转成受控 override。

## 5. 提示词拼接时的数据获取

### 5.1 基本原则

提示词模板不直接查数据库。

`PromptAsset.render()` 只消费：

- `promptInput`
- `PromptRenderContext`
- 已筛选的 `PromptContextBlock[]`

数据获取由统一 Context Broker / Resolver 完成。这样可以保证：

- 数据来源可追踪。
- 预算筛选统一。
- prompt 可视化预览一致。
- 创作中枢、自动导演、章节流水线可复用同一套上下文能力。
- 失败恢复和重放可以选择使用快照或刷新数据。

### 5.2 Context Requirement

每个 PromptAsset 或 Step Module 声明自己需要的上下文：

```ts
type ContextRequirement = {
  group: string;
  required?: boolean;
  priority: number;
  maxTokens?: number;
  freshness?: "snapshot" | "fresh" | "hybrid";
  sourceHint?: string;
};
```

示例：

```ts
const chapterWriteRequirements: ContextRequirement[] = [
  { group: "book_contract", required: true, priority: 100 },
  { group: "chapter_mission", required: true, priority: 100 },
  { group: "volume_window", priority: 96 },
  { group: "participant_subset", required: true, priority: 92 },
  { group: "local_state", required: true, priority: 89 },
  { group: "style_contract", required: true, priority: 74 },
  { group: "recent_chapters", priority: 86 },
  { group: "open_conflicts", priority: 88 }
];
```

### 5.3 Context Broker

Context Broker 负责把运行入口、资源绑定和 prompt/step 需求转成上下文块。

```ts
interface PromptExecutionContext {
  entrypoint: "creative_hub" | "auto_director" | "chapter_pipeline" | "manual_test";
  graphNode?: string;
  workflowRunId?: string;
  stepRunId?: string;
  runId?: string;
  threadId?: string;
  checkpointId?: string;
  novelId?: string;
  chapterId?: string;
  worldId?: string;
  taskId?: string;
  styleProfileId?: string;
  userGoal?: string;
  resourceBindings?: Record<string, unknown>;
}

interface ContextBroker {
  resolve(input: {
    executionContext: PromptExecutionContext;
    requirements: ContextRequirement[];
    mode: "snapshot" | "fresh" | "hybrid";
  }): Promise<PromptContextBlock[]>;
}
```

### 5.4 Context Resolver Registry

每类数据由独立 resolver 负责：

```ts
interface ContextResolver {
  group: string;
  resolve(input: PromptExecutionContext): Promise<PromptContextBlock | PromptContextBlock[]>;
}
```

建议优先抽象这些 resolver：

| Context group | 主要来源 | 用途 |
| --- | --- | --- |
| `creative_hub.bindings` | CreativeHubResourceBinding | 中枢理解当前绑定资源 |
| `creative_hub.recent_messages` | CreativeHubCheckpoint messages | 中枢对话连续性 |
| `creative_hub.latest_turn_summary` | checkpoint metadata | 中枢下一轮承接 |
| `creative_hub.novel_setup_status` | NovelSetupStatusService | 新手开书引导 |
| `creative_hub.production_status` | NovelProductionStatusService | 整本生产状态 |
| `book_contract` | Novel / BookContract / CanonicalState | 书级承诺和硬约束 |
| `story_macro` | StoryMacroPlan | 宏观冲突、卖点、成长线 |
| `chapter_mission` | Chapter / StoryPlan / CanonicalState | 本章必须完成的状态变化 |
| `volume_window` | VolumePlan / VolumeChapterPlan | 当前卷任务和相邻卷边界 |
| `participant_subset` | Character / CharacterDynamics | 本章相关角色 |
| `local_state` | CanonicalStateService | 当前局面、秘密、关系、冲突 |
| `payoff_ledger` | PayoffLedgerSyncService | 伏笔兑现压力 |
| `character_resource` | CharacterResourceLedgerService | 道具、资源、持有状态 |
| `style_contract` | StyleBindingService | 写法引擎编译结果 |
| `world_slice` | NovelWorldSliceService | 当前小说可执行世界规则 |
| `rag_context` | HybridRetrievalService | 知识库检索补充 |
| `recent_chapters` | ChapterSummary / Chapter content | 局部延续与防重复 |

### 5.5 Context Plan

运行前先生成 Context Plan：

```ts
type ContextPlan = {
  promptKey?: string;
  stepId?: string;
  scope: PromptExecutionContext;
  requiredGroups: string[];
  optionalGroups: string[];
  maxTokensBudget: number;
  mode: "snapshot" | "fresh" | "hybrid";
};
```

Context Plan 的作用：

- 让工作台可预览本次会取哪些数据。
- 让自动导演可理解某一步为什么缺数据。
- 让失败恢复时知道哪些数据必须冻结，哪些可以刷新。
- 让测试集能稳定复现一次 prompt 调用。

### 5.6 快照、刷新与混合模式

创作中枢和自动导演都需要重放能力，因此上下文要支持三种模式：

- `snapshot`：使用当时保存的上下文快照，保证复现。
- `fresh`：重新查询最新数据，适合继续创作。
- `hybrid`：关键事实使用快照，状态类数据刷新。

建议默认：

- 审批恢复：`snapshot` 或 `hybrid`。
- 失败重放：`snapshot`。
- 用户继续创作：`fresh`。
- 自动导演接管：`fresh`。
- 章节修复：`hybrid`。

## 6. 创作中枢兼容设计

创作中枢不应只把绑定资源压成一条 system message。它应通过 Context Broker 生成标准上下文块。

当前 `CreativeHubResourceBinding` 可作为统一 scope：

```ts
type CreativeHubResourceBinding = {
  novelId?: string | null;
  chapterId?: string | null;
  worldId?: string | null;
  taskId?: string | null;
  bookAnalysisId?: string | null;
  formulaId?: string | null;
  styleProfileId?: string | null;
  baseCharacterId?: string | null;
  knowledgeDocumentIds?: string[];
};
```

创作中枢每个图节点可声明 prompt 和上下文：

```ts
const creativeHubNodePromptPlan = {
  coordinator_plan: {
    prompt: "planner.intent.parse@v1",
    context: [
      "creative_hub.bindings",
      "creative_hub.recent_messages",
      "creative_hub.novel_setup_status",
      "creative_hub.production_status",
      "tool_catalog",
      "permission_summary"
    ]
  },
  answer_finalize: {
    prompt: "agent.runtime.fallback_answer@v1",
    context: [
      "tool_results",
      "creative_hub.latest_turn_summary",
      "creative_hub.novel_setup_status",
      "creative_hub.production_status"
    ]
  }
};
```

每次中枢调用 prompt 时记录：

```ts
type PromptRunTrace = {
  promptId: string;
  baseVersion: string;
  overrideRevisionId?: string | null;
  compiledHash: string;
  contextSnapshotId?: string | null;
  contextBlockIds: string[];
  droppedContextBlockIds: string[];
  entrypoint: "creative_hub" | "auto_director" | "chapter_pipeline" | "manual_test";
  runId?: string | null;
  threadId?: string | null;
  checkpointId?: string | null;
  stepRunId?: string | null;
};
```

这样创作中枢可以在 UI 中展示：

- 本轮识别了什么意图。
- 用了哪些资源绑定。
- 哪些上下文参与了判断。
- 最终调用了哪些步骤。
- 哪一步失败或等待审批。
- 用户如何从当前 checkpoint 继续。

## 7. 统一 Step Module Runtime

### 7.1 核心定位

自动导演、章节流水线和创作中枢都不应直接拥有独立创作链路。它们应统一调用 Step Module Runtime。

定位关系：

```text
自动导演 = 决策 / 编排层
章节流水线 = 一套预设编排方案
创作中枢 = 人机交互入口
底层统一执行 = Step Module Runtime
```

### 7.2 Step Module 契约

```ts
interface WorkflowStepModule<I, O> {
  id: string;
  label: string;
  stage: string;

  inputSchema: unknown;
  outputSchema: unknown;

  contextRequirements: ContextRequirement[];
  promptAssets?: Array<{ id: string; version: string }>;

  validatePreconditions(input: I, ctx: StepExecutionContext): Promise<StepGateResult>;
  execute(input: I, ctx: StepExecutionContext): Promise<O>;

  summarizeResult(output: O): StepSummary;
  getApprovalPolicy?(input: I, output?: O): ApprovalPolicy;
}
```

Step Module 不应直接承担跨链路编排。它只负责一个清晰创作动作。

### 7.3 建议步骤模块

第一批可从现有能力包装迁移：

| Step id | 职责 |
| --- | --- |
| `workspace.analyze` | 扫描当前小说资产、任务、风险和下一步建议 |
| `book.candidate.generate` | 生成书级候选方向 |
| `book.contract.generate` | 生成 Book Contract |
| `story.macro.plan` | 生成故事宏观规划 |
| `world.skeleton.ensure` | 为项目生成或补齐世界观骨架 |
| `character.cast.prepare` | 生成或补齐角色阵容 |
| `volume.strategy.plan` | 生成分卷策略 |
| `volume.skeleton.plan` | 生成卷骨架 |
| `volume.beat_sheet.plan` | 生成卷节奏段 |
| `chapter.list.plan` | 生成章节列表 |
| `chapter.task_sheet.plan` | 生成章节任务单 |
| `chapter.context.prepare` | 装配章节写作上下文 |
| `chapter.draft.write` | 生成章节正文 |
| `chapter.quality.review` | 审核章节质量 |
| `chapter.draft.repair` | 修复章节草稿 |
| `chapter.state.commit` | 提交章节后的规范状态 |
| `payoff.ledger.sync` | 同步伏笔账本 |
| `character.resource.sync` | 同步角色资源账本 |
| `workflow.summarize` | 生成本轮执行摘要 |

### 7.4 章节流水线变成 Workflow Template

章节流水线不再是独立大服务，而是预设模板：

```ts
const fastChapterPipeline = {
  id: "pipeline.fast_chapter_generation",
  steps: [
    "chapter.context.prepare",
    "chapter.draft.write",
    "chapter.quality.review",
    "chapter.draft.repair",
    "chapter.state.commit",
    "payoff.ledger.sync",
    "character.resource.sync"
  ]
};
```

不同模式只是模板不同：

- 快速写作：少量审核，低成本。
- 标准写作：完整上下文、轻审、必要修复。
- 精修写作：完整审核、修复、状态同步、账本同步。
- 续写模式：加入前文续接与防重复约束。
- 重写模式：加入保留边界和差异检查。

### 7.5 自动导演变成 Workflow Planner

自动导演不直接执行章节链，而是生成或调整 Workflow Plan：

```ts
type WorkflowPlan = {
  goal: string;
  policy: RuntimePolicy;
  steps: Array<{
    stepId: string;
    input: Record<string, unknown>;
    dependsOn?: string[];
    approval?: "never" | "risky" | "always";
  }>;
};
```

示例：

```text
用户：把这本书继续往下写到第 10 章

自动导演计划：
1. workspace.analyze
2. world.skeleton.ensure
3. character.cast.prepare
4. volume.strategy.plan
5. chapter.task_sheet.plan(1-10)
6. pipeline.fast_chapter_generation(1-10)
```

失败恢复示例：

```text
第 7 章失败

自动导演计划：
1. workspace.analyze
2. chapter.quality.review(chapter=7)
3. character.resource.sync
4. chapter.draft.repair(chapter=7)
5. chapter.state.commit(chapter=7)
```

## 8. 统一运行记录

建议长期统一记录这些概念：

```text
WorkflowRun
WorkflowStepRun
PromptRunTrace
ContextSnapshot
StepArtifact
ApprovalRecord
DirectorEvent
```

每一步至少记录：

```ts
type WorkflowStepRun = {
  id: string;
  workflowRunId: string;
  stepId: string;
  status: "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
  inputJson: string;
  outputJson?: string | null;
  contextSnapshotId?: string | null;
  promptTraceIds: string[];
  approvalState?: string | null;
  retryCount: number;
  error?: string | null;
};
```

短期落地不一定立刻新增所有表。可以先复用或扩展：

- `NovelWorkflowTask`
- `AgentRun`
- `AgentStep`
- workflow milestone
- task center detail step
- auto director follow-up action log

但概念上要向统一 StepRun 靠拢，避免后续继续出现多套任务状态。

## 9. 与产物账本的关系

Step Module 的输出应该写入产物账本或对应业务表，并建立版本、来源和依赖关系。

第一阶段可以先做索引式 Artifact Ledger：

```ts
type ArtifactRecord = {
  id: string;
  type:
    | "book_contract"
    | "story_macro"
    | "character_cast"
    | "volume_strategy"
    | "chapter_task_sheet"
    | "chapter_draft"
    | "audit_report"
    | "repair_ticket";
  ownerType: "novel" | "chapter" | "volume" | "workflow";
  ownerId: string;
  version: number;
  sourceStepRunId?: string | null;
  sourcePromptTraceIds?: string[];
  dependencyArtifactIds?: string[];
  status: "draft" | "active" | "stale" | "rejected";
};
```

这样用户手动编辑和 AI 自动生成都能进入同一套产物体系。

## 10. 策略与审批

统一运行时必须把控制权变成策略，而不是流程分叉。

```ts
type RuntimePolicy = {
  mode: "manual" | "co_pilot" | "auto_until_checkpoint" | "full_auto";
  overwriteUserContent: "never" | "ask" | "allowed";
  destructiveAction: "never_without_approval";
  approvalLevel: "low" | "medium" | "high";
  maxAutoRepairAttempts: number;
};
```

策略例子：

- 新手开书：允许 AI 自动补齐规划，但关键候选方向要确认。
- 章节生成：可以自动写草稿和轻审，但覆盖已有正文要审批。
- 修复失败章节：可自动局部修复一次，再失败则暂停解释。
- 接管已有项目：先分析，不直接覆盖下游产物。

## 11. 可视化与调试能力

本方案最终应支撑这些 UI：

- Workflow Plan 视图：看到自动导演计划调用哪些 Step Module。
- Step Run 视图：看到每步输入、输出、状态、审批、错误。
- Prompt Trace 视图：看到每次 prompt 的版本、override、上下文和最终 messages。
- Context View：看到数据来自哪里、token 估算、是否被丢弃。
- Artifact View：看到产物版本、来源步骤、依赖关系、是否过期。
- Replay View：从某个步骤用 snapshot/fresh/hybrid 模式重放。

这会让提示词可视化不只是 prompt 编辑器，而是 AI 创作系统的调试中控台。

## 12. 落地路线

### 12.1 第一阶段：只读可视化与契约补齐

- 新增 Prompt Catalog API，列出 prompt、版本、taskType、mode、contextPolicy。
- 新增 Prompt Preview API，给定样例 scope 渲染最终 messages。
- 为核心 prompt 补充 `editableSlots` 和 `contextRequirements` 的概念定义。
- 将创作中枢 binding、recent messages、novel setup status 包装为标准 context blocks。

### 12.2 第二阶段：Context Broker

- 抽出 `ContextBroker` 和 `ContextResolverRegistry`。
- 先覆盖章节写作、章节审核、创作中枢规划、创作中枢最终回答。
- 运行时记录 context block ids、dropped ids、snapshot hash。
- 支持 snapshot/fresh/hybrid 三种上下文模式。

### 12.3 第三阶段：Prompt Override

- 增加 Prompt Override 草稿、发布、回滚。
- 只开放低风险 slots。
- 编译后记录 compiled hash。
- Prompt Runner 调用时加载 active override。
- 工作台支持 diff、preview、dry-run、validation report。

### 12.4 第四阶段：Step Module 包装迁移

- 先把现有章节执行相关能力包装为 step modules。
- 把现有自动导演阶段包装为 step modules。
- 章节流水线改成 workflow template。
- 自动导演改成 workflow planner，输出 workflow plan。
- 创作中枢工具调用也进入同一 Step Runtime。

### 12.5 第五阶段：统一追踪与重放

- 统一 WorkflowRun / StepRun / PromptTrace / ContextSnapshot 的概念。
- 接入创作中枢 checkpoint。
- 支持失败后从某一步重放。
- 支持自动导演根据 step result 和 artifact health 动态调整下一步。

## 13. 风险与边界

主要风险：

- 如果过早允许自由编辑整个 prompt，会破坏结构化输出和业务校验。
- 如果每个 prompt 自己取数，后续无法统一预览、追踪、重放。
- 如果自动导演继续和章节流水线分开演化，后续会产生两套状态、两套错误恢复和两套上下文逻辑。
- 如果 Step Module 颗粒度过细，系统会变成调度噪声；过粗则继续是黑箱。
- 如果没有 artifact dependency，用户手动修改后系统仍然不知道哪些下游产物过期。

边界原则：

- Prompt 负责表达，不负责数据获取。
- Context 负责取数、压缩、预算和快照，不负责业务执行。
- Step Module 负责一个创作动作，不负责跨链路总编排。
- Workflow Planner 负责选择步骤，不直接写正文或改数据库。
- Runtime Policy 负责控制权，不让流程分叉替代策略。

## 14. 最终目标

最终系统应当形成这样的能力：

- 新手用户只表达目标，创作中枢负责理解、追问、推荐或执行。
- 自动导演根据工作区状态生成下一步计划。
- 章节流水线只是可复用模板，不再是独立黑箱。
- 每个步骤都能看到输入、上下文、prompt、输出、产物和事件。
- 提示词工作台能安全编辑表达片段，同时保护 schema、校验和上下文契约。
- 失败后可以解释、恢复、重放或局部修复。
- 新增能力通过 Step Module、Context Resolver、PromptAsset 和 Artifact 类型接入，而不是继续修改主 service 分支。

一句话：提示词可视化编辑要落在统一 AI 创作运行时之上；自动导演、章节流水线和创作中枢都应成为同一套模块化创作系统的不同入口与编排策略。
