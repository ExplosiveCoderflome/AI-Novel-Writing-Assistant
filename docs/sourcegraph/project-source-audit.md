# 项目源码全景审计 / Project Source Audit

> **版本 (Version)**: `1.0.0`
> **生成日期**: 2026-06-25
> **审计范围**: 全仓库文件级结构、模块边界、实现深度与覆盖度

---

## 目录

- [代码规模总览](#代码规模总览)
- [后端架构全景](#后端架构全景)
  - [1. 自动导演 (Auto-Director)](#1-自动导演-auto-director)
  - [2. Creative Hub 与 Agent Runtime](#2-creative-hub-与-agent-runtime)
  - [3. 整本生产主链](#3-整本生产主链)
  - [4. 章节写作闭环](#4-章节写作闭环)
  - [5. Novel 服务核心文件](#5-novel-服务核心文件)
  - [6. 卷规划 (Volume Planning)](#6-卷规划-volume-planning)
  - [7. 故事宏观规划 (Story Macro)](#7-故事宏观规划-story-macro)
  - [8. 写法引擎 (Style Engine)](#8-写法引擎-style-engine)
  - [9. 世界观 (World)](#9-世界观-world)
  - [10. 本书世界上下文 (Book World Context)](#10-本书世界上下文-book-world-context)
  - [11. 角色系统](#11-角色系统)
  - [12. Canonical State Machine](#12-canonical-state-machine)
  - [13. Payoff Ledger (伏笔账本)](#13-payoff-ledger-伏笔账本)
  - [14. Planner Service (拆书规划器)](#14-planner-service-拆书规划器)
  - [15. Novel Workflow Engine](#15-novel-workflow-engine)
  - [16. Task Center (任务中心)](#16-task-center-任务中心)
  - [17. Timeline (时间线)](#17-timeline-时间线)
  - [18. RAG / 知识库](#18-rag--知识库)
  - [19. Book Analysis (拆书分析)](#19-book-analysis-拆书分析)
  - [20. Chapter Editor (章节编辑器)](#20-chapter-editor-章节编辑器)
  - [21. Prompt 治理体系](#21-prompt-治理体系)
  - [22. 模型路由 (LLM)](#22-模型路由-llm)
  - [23. 跨媒体改编](#23-跨媒体改编)
  - [24. 图像生成 (Image)](#24-图像生成-image)
  - [25. 标题生成 (Title)](#25-标题生成-title)
  - [26. Settings / Bootstrap](#26-settings--bootstrap)
  - [27. Event Bus / Side Effects](#27-event-bus--side-effects)
  - [28. Workers](#28-workers)
- [共享类型契约层](#共享类型契约层)
- [数据库 Schema](#数据库-schema)
- [前端架构全景](#前端架构全景)
- [Desktop Electron](#desktop-electron)
- [外部工具](#外部工具)
- [测试套件](#测试套件)
- [文档体系](#文档体系)
- [App 入口与路由](#app-入口与路由)

---

## 代码规模总览

| 维度 | 数量 |
|---|---|
| 后端 TypeScript 文件 | **782** |
| 前端 TSX/TS 文件 | **413** |
| 共享类型定义文件 | **46 / 380KB+** |
| 数据库模型 | **129** |
| Prisma Schema 行数 | **3421** |
| 后端测试文件 | **120+** |
| Prompt Registry 注册条目 | **95+** |
| Prompt 家族目录 | **19** |
| 前端页面目录 | **21** |
| API 路由 | **34 条** |
| LangGraph 图 | **5**（Creative Hub / World / Formula / Outline / Character） |

---

## 后端架构全景

### 1. 自动导演 (Auto-Director)

`server/src/services/novel/director/` — **~90+ 文件**，是整个项目最深的子系统。

| 子模块 | 路径 | 文件数 | 核心文件 |
|---|---|---|---|
| 主服务 | `NovelDirectorService.ts` | 1 | 708 行，候选生成/确认/方案修补/标题精炼/接管 |
| Pipeline Runtime | `novelDirectorPipelineRuntime.ts` | 1 | 23KB，阶段推进/检查点/恢复 |
| Automation | `automation/` | 9 | `novelDirectorAutoExecutionRuntime.ts` 28KB/693行，循环执行/断路器/质量预算 |
| Phases | `phases/` | 11 | 候选/故事宏观/结构化大纲/章节标题修复等阶段 |
| Recovery | `recovery/` | 5 | 大纲恢复/下游重置/草稿基线回填 |
| State | `state/` | 4 | StateCommitter / StateReader / StateStore |
| Runtime | `runtime/` | 38 | 工作区分析(31KB)/策略引擎/断路器/事件投影(29KB)/接管执行(18KB) |
| Projections | `projections/` | 10 | 仪表板视图/任务快照/进度追踪/Fact Summary |
| Commands | `commands/` | 4 | `DirectorCommandService.ts` 28KB |
| WorkflowStepRuntime | `workflowStepRuntime/` | **14** | `directorExecutionStepModules.ts` **40KB**，步骤模块注册/执行/规划/候选 |
| LangGraph Pilot | `langgraphPilot/` | 1 | 10KB |
| HTTP | `http/` | 2 | 20KB 路由 + 5KB 工作流路由 |

### 2. Creative Hub 与 Agent Runtime

`server/src/creativeHub/` — LangGraph 状态图

| 文件 | 大小 | 功能 |
|---|---|---|
| `CreativeHubLangGraph.ts` | 17KB / 531行 | `START → bind_context → coordinator_plan → tool_execute → approval_gate → answer_finalize → task_sync → END` |
| `CreativeHubService.ts` | — | 线程管理/对话持久化 |
| `CreativeHubInterruptLangGraph.ts` | — | 中断恢复图 |
| `creativeHubTurnSummary.ts` | — | 回合总结 |

`server/src/agents/` — Agent 基础设施

| 子模块 | 文件数 | 核心文件 |
|---|---|---|
| `tools/` | **24** | 小说读写/角色/世界/知识库/导演/任务/写法公式（合计 150KB+） |
| `runtime/` | **11** | `answerComposer.ts` 29KB / `RunExecutionService.ts` 16KB / `AgentRuntime.ts` 13KB |
| `planner/` | 5 | 意图解析/编译/14KB Prompt 支撑 |
| 根文件 | 7 | 审批策略/目录/编排/工具注册/跟踪/类型 |

### 3. 整本生产主链

`server/src/services/novel/production/` — 6 文件

| 文件 | 功能 |
|---|---|
| `NovelProductionOrchestrator.ts` | 统一 8 阶段管线：`project_framing → story_macro → book_contract → character_prep → volume_planning → chapter_preparation → chapter_execution → quality_repair` |
| `ChapterExecutionStageRunner.ts` | 章节执行 Stage Runner |
| `QualityRepairStageRunner.ts` | 质量修复 Stage Runner |
| `ChapterPreparationStageRunner.ts` | 章节准备 Stage Runner |
| `ContextAssemblyService.ts` | 状态驱动上下文组装（伏笔/冲突/角色/时间线） |
| `GenerationDecisionEngine.ts` | 生成决策引擎 |

### 4. 章节写作闭环

`server/src/services/novel/runtime/` — 章节运行时核心

| 文件 | 大小 | 功能 |
|---|---|---|
| `GenerationContextAssembler.ts` | **35KB / 877行** | 上下文组装：RAG 检索/前章摘要/世界观/角色/冲突/伏笔/写法/批量缓存 |
| `chapterRuntimePipeline.ts` | 24KB / 665行 | 生成→审校→修复流水线，含空内容重试/质量债务归因 |
| `ChapterQualityGateService.ts` | 19KB | 质量门禁 |
| `ChapterArtifactDeltaService.ts` | 34KB | 章节产出物增量提取 |
| `ChapterAcceptanceAssessmentService.ts` | 14KB | 验收评估 |
| `ChapterContentFinalizationService.ts` | 10KB | 内容定稿 |
| `BatchContextCache.ts` | — | 批量上下文缓存 |
| `repair/` | 3 文件 | 修复运行时 / 流式修复 / 审计上下文 |

### 5. Novel 服务核心文件

`server/src/services/novel/` 根级散落 — **46 个文件 / ~330KB**

| 文件 | 大小 | 功能 |
|---|---|---|
| `novelCorePipelineService.ts` | **38KB** | 核心 Pipeline 服务 |
| `NovelSetupStatusService.ts` | **26KB** | 小说设定完成度状态（基本信息→世界→角色→大纲→章节→可生成就绪检查链） |
| `novelCoreShared.ts` | 22KB | 核心共享逻辑 |
| `NovelProductionStatusService.ts` | 22KB | 生产状态服务 |
| `novelCoreCrudService.ts` | 20KB | 核心 CRUD |
| `novelCoreGenerationService.ts` | 16KB | 核心生成 |
| `pipelineJobState.ts` | 14KB | Pipeline 作业状态 |
| `NovelContinuationService.ts` | 14KB | 续写 |
| `NovelReferenceService.ts` | 13KB | 引用 |
| `chapterWritingGraph.ts` | 12KB | 章节写作图 |
| `novelCoreReviewService.ts` | 12KB | 审阅 |
| `novelCoreCharacterService.ts` | 12KB | 角色服务 |
| `highMemoryReservation.ts` | 12KB | 高内存保留策略 |
| `NovelProductionService.ts` | 12KB | 生产服务 |
| `NovelCoreService.ts` | 10KB | 核心门面 |
| 其他 ~30 文件 | — | CRUD/摘要/快照/storyline/schema/token 追踪等 |

### 6. 卷规划 (Volume Planning)

`server/src/services/novel/volume/` — **24 文件 / 260KB+**

| 文件 | 大小 | 功能 |
|---|---|---|
| `NovelVolumeService.ts` | **29KB** | 卷管理主服务 |
| `volumeGenerationHelpers.ts` | 27KB | 生成辅助 |
| `volumePlanUtils.ts` | 26KB | 规划工具 |
| `volumeGenerationSchemas.ts` | 24KB | 结构化输出 Schema |
| `volumePlanChangeDetection.ts` | 21KB | 变更检测 |
| `volumeGenerationOrchestrator.ts` | 20KB | 生成编排器 |
| `volumeWorkspaceDocument.ts` | 18KB | 工作区文档 |
| `volumeWorkspacePersistence.ts` | 17KB | 持久化 |
| `volumeGeneration.ts` | 17KB | 生成 |
| `volumeChapterListGeneration.ts` | 16KB | 章节列表生成 |
| 其他 14 文件 | — | beat sheet / 预算分配 / 节奏 / 标题多样性 / 遥测 / 兼容层… |

Prompt Registry：`novel.volume.strategy@v2`、`novel.volume.skeleton@v2`、`novel.volume.rhythm@v1`、`novel.volume.chapterList@v7`（已迭代到 v7）、`novel.volume.rebalance@v1`。

### 7. 故事宏观规划 (Story Macro)

`server/src/services/novel/storyMacro/` — **6 文件 / 45KB**

| 文件 | 大小 | 功能 |
|---|---|---|
| `StoryMacroPlanService.ts` | 16KB | 主服务 |
| `storyMacroConstraintEngine.ts` | 8KB | 约束引擎 |
| `storyMacroPlanSchema.ts` | 9KB | Schema |
| `storyMacroPlanPersistence.ts` | 7KB | 持久化 |
| 其他 2 文件 | — | shared / utils |

### 8. 写法引擎 (Style Engine)

`server/src/services/styleEngine/` — **20 文件**

| 文件 | 大小 | 功能 |
|---|---|---|
| `StyleProfileService.ts` | 32KB | 写法资产 CRUD / 特征提取 / 编译 |
| `StyleExtractionTaskService.ts` | 23KB | 从文本提取写法特征 |
| `defaults.ts` | 21KB | 默认写法配置 |
| `StyleCompiler.ts` | 11KB | 特征编译为写作规则 |
| `StyleBindingService.ts` | 12KB | 写法绑定到小说 |
| `StyleDetectionService.ts` | — | 写法检测 |
| `StyleRecommendationService.ts` | — | 推荐 |
| `StyleRuntimeResolver.ts` | — | 运行时解析 |
| `AntiAiRuleService.ts` | — | Anti-AI 规则（去 AI 味） |
| 其他文件 | — | 审计 / 清洗 / 生成 / 改写 |

Prompt Registry 注册了 **12 个写法相关 Prompt**。

### 9. 世界观 (World)

`server/src/services/world/` — **21 文件**

| 文件 | 大小 | 功能 |
|---|---|---|
| `worldStructure.ts` | **47KB** | 势力/地点/关系/冲突/事件结构化建模 |
| `worldVisualization.ts` | 33KB | 世界地图/势力图谱可视化 |
| `WorldService.ts` | 30KB | 主服务 |
| `worldInspirationService.ts` | 16KB | 灵感生成 |
| `worldImprovementService.ts` | 14KB | 完善 |
| `worldTransfer.ts` | 13KB | 导入/导出 |
| 其他 15 文件 | — | 草稿/骨架/精炼/公理/一致性/手册/层… |

Prompt Registry 注册了 **14 个世界相关 Prompt**。

### 10. 本书世界上下文 (Book World Context)

`server/src/services/novel/worldContext/` — **9 文件 / 66KB**

| 文件 | 大小 | 功能 |
|---|---|---|
| `NovelWorldInstanceService.ts` | 22KB | 世界实例管理 |
| `NovelWorldSyncService.ts` | 15KB | 差异同步 |
| `WorldContextGateway.ts` | 9KB | 上下文网关 |
| 其他 6 文件 | — | 库保存 / 手动管理 / 资产 / 投影 / 同步待处理 / 记录 |

`server/src/services/novel/storyWorldSlice/` — **3 文件 / 30KB**（章节级世界切片）

### 11. 角色系统

分散在多个子模块：

| 模块 | 路径 | 规模 | 核心功能 |
|---|---|---|---|
| 角色准备 | `novel/characterPrep/` | 4 文件 / 72KB | `CharacterPreparationService.ts` 30KB + 阵容生成 + 质量检测 |
| 角色动态 | `novel/dynamics/` | **7 文件 / 69KB** | `CharacterDynamicsMutationService.ts` **28KB** / 弧线追踪 / 投影 |
| 角色资源 | `novel/characterResource/` | 4 文件 / 28KB | 提取 / 账本 / 验证 |
| 角色档案 | `novel/characterProfile/` | 1 文件 / 17KB | `CharacterVisibleProfileService.ts` |
| 角色硬性事实 | `novel/characters/` | 1 文件 | `characterHardFacts.ts` |
| 角色库（跨书） | `services/character/` | 3 文件 / 48KB | `CharacterLibrarySyncService.ts` **25KB** + 生成 18KB |

Prompt Registry 注册了 **10+ 个角色相关 Prompt**。

### 12. Canonical State Machine

`server/src/services/novel/state/` — **4 文件 / 47KB**

| 文件 | 大小 | 功能 |
|---|---|---|
| `CanonicalStateService.ts` | 21KB | 叙事状态快照：角色/冲突/伏笔/时间线/隐藏知识 |
| `StateCommitService.ts` | 13KB | 每章写完后更新全局状态 |
| `ChapterFactExtractor.ts` | 10KB | 从章节正文提取事实 |
| `StateVersionLog.ts` | 2KB | 版本日志 |

`server/src/services/state/` — **5 文件 / 47KB**（OpenConflictService / StateService / 冲突检测 / 快照提取）

### 13. Payoff Ledger (伏笔账本)

`server/src/services/payoff/` — **3 文件 / 39KB**

| 文件 | 大小 | 功能 |
|---|---|---|
| `PayoffLedgerSyncService.ts` | 20KB | 伏笔铺设/兑现/过期同步 |
| `payoffLedgerShared.ts` | 13KB | 合成 issues（forbid/seed/touch/pressure） |
| `payoffLedgerChapterRefs.ts` | 5KB | 章节引用 |

Prompt Registry：`novel.payoff_ledger.sync@v5`（已迭代到 v5）。

### 14. Planner Service (拆书规划器)

`server/src/services/planner/` — **11 文件 / 115KB**

| 文件 | 大小 |
|---|---|
| `PlannerService.ts` | **38KB** |
| `replanDecision.ts` | 15KB |
| `plannerContextBlocks.ts` | 15KB |
| `plannerPersistence.ts` | 12KB |
| `plannerContextHelpers.ts` | 11KB |
| 其他 6 文件 | ~23KB |

Prompt Registry：`planner.book.plan@v1`、`planner.arc.plan@v1`、`planner.chapter.plan@v1`、`planner.replan.window_decision@v1`。

### 15. Novel Workflow Engine

`server/src/services/novel/workflow/` — **14 文件 / 111KB**

| 文件 | 大小 | 功能 |
|---|---|---|
| `NovelWorkflowHealingService.ts` | **25KB** | 工作流自愈 |
| `NovelWorkflowApplicationService.ts` | 20KB | 工作流应用层 |
| `novelWorkflowAutoDirectorReconciliation.ts` | 14KB | 导演状态调和 |
| `NovelWorkflowStoreService.ts` | 12KB | 状态持久化 |
| 其他 10 文件 | ~40KB | helpers / 检查点 / 种子修复 / 恢复启发式 / 初始状态 |

### 16. Task Center (任务中心)

`server/src/services/task/` — **13 文件 + 12 follow-up 文件**

| 子模块 | 核心文件 | 说明 |
|---|---|---|
| 主服务 | `TaskCenterService.ts` 13KB | 全局任务调度 |
| 恢复 | `RecoveryTaskService.ts` 15KB | 恢复任务 |
| 可解释性 | `novelWorkflowExplainability.ts` 12KB | 工作流解释 |
| autoDirectorFollowUps/ | **12 文件** | 后续操作执行(23KB) / 投影(19KB) / 通知(12KB) / 钉钉(4KB) / 企微(5KB) / 审批审计 / 安全修复 |

### 17. Timeline (时间线)

`server/src/modules/timeline/` — **9 文件 / ~54KB**

| 文件 | 大小 | 功能 |
|---|---|---|
| `timeline.repository.ts` | 17KB | 持久化 |
| `timeline-checker.service.ts` | 13KB | 一致性检查 |
| `timeline.service.ts` | 8KB | 主服务 |
| `timeline-context.service.ts` | 4KB | 上下文 |
| `timeline-prompt-adapter.ts` | 4KB | Prompt 适配 |
| `timeline-extractor.service.ts` | 3KB | 提取器 |
| 其他 3 文件 | — | 修复 / 策略 / 导出 |

### 18. RAG / 知识库

`server/src/services/rag/` — **10 文件**

| 文件 | 大小 | 功能 |
|---|---|---|
| `RagIndexService.ts` | 36KB | 索引服务 |
| `VectorStoreService.ts` | 11KB | 向量存储 |
| `HybridRetrievalService.ts` | 9KB | 混合检索 |
| `EmbeddingService.ts` | — | 嵌入 |
| `RagWorker.ts` | — | 后台 Worker |

`server/src/services/knowledge/` — 2 文件（`KnowledgeService.ts` 16KB）

### 19. Book Analysis (拆书分析)

`server/src/services/bookAnalysis/` — **19 文件 / ~95KB**

包含命令/查询分离（CQRS）、看门狗（Watchdog）、并发控制、缓存(8KB)、队列、进度追踪、章节逐段生成、导出、发布。

### 20. Chapter Editor (章节编辑器)

`server/src/services/novel/chapterEditor/` — **4 文件 / 43KB**

Prompt Registry：`novel.chapter_editor.workspace_diagnosis@v1`、`novel.chapter_editor.user_intent@v1`、`novel.chapter_editor.rewrite_candidates@v2`。

### 21. Prompt 治理体系

#### Registry

`server/src/prompting/registry.ts` — **95+ 个 PromptAsset**，涵盖 Agent / 审计 / 角色 / 小说 / 导演 / 卷 / 写法 / 世界 / 伏笔 / 状态 / 视频 / 戏剧等，多个已迭代到 v5-v7。

#### 基础设施

| 子模块 | 路径 | 核心文件 |
|---|---|---|
| Core | `prompting/core/` | **`promptRunner.ts` 39KB** / `structuredOutputHint.ts` 12KB / `promptQualityTelemetry.ts` 7KB |
| Slots | `prompting/slots/` | 5 文件 — 插槽覆盖/解析/调和 |
| Addendums | `prompting/addendums/` | `PromptAddendumService.ts` 10KB |
| Workflows | `prompting/workflows/` | 6 文件 — 章节/导演/通用/生产工作流定义 + 注册表 |
| Context | `prompting/context/` | 7 文件 — 上下文代理/解析器注册/运行时解析 |
| Workbench | `PromptWorkbenchService.ts` | 13KB — Prompt 调试工作台 |

#### Prompt 源文件

`prompting/prompts/` — **19 个家族目录**：agent / audit / bookAnalysis / character / comic / drama / genre / helper / image / novel / payoff / planner / state / storyMode / storyWorldSlice / style / video / world / writingFormula

仅 `novel/` 子目录就有 **36 个文件 + 2 个子目录**，其中：
- `chapterLayeredContext.ts` **49KB** — 最大的 Prompt 构建文件
- `characterPreparation.prompts.ts` 26KB
- `volumePlanning.prompts.ts` 24KB
- `coreGeneration.prompts.ts` 23KB
- `chapterArtifactDelta.prompts.ts` 23KB
- `directorPlanning.prompts.ts` 21KB

### 22. 模型路由 (LLM)

`server/src/llm/` — **24 文件**

| 文件 | 大小 | 功能 |
|---|---|---|
| `structuredInvoke.ts` | 15KB | 结构化输出调用 |
| `factory.ts` | 14KB | LLM 实例工厂 |
| `usageTracking.ts` | 14KB | 用量追踪 |
| `connectivity.ts` | 13KB | 连接检测 |
| `modelRouter.ts` | 11KB | 按任务类型路由 |
| `structuredInvokeRepair.ts` | 11KB | JSON 修复 |
| `reasoning.ts` | 8KB | 推理模型适配 |
| `providers.ts` | 6KB | 多提供商 |
| `modelCatalog.ts` | 6KB | 模型目录 |
| 其他文件 | — | 限流 / 标签 / 类型 / 工具 |

### 23. 跨媒体改编

#### Drama (戏剧改编)

`server/src/services/drama/` — **14 文件 + 9 个子目录**

| 子目录 | 核心文件 | 功能 |
|---|---|---|
| `audio/` | `DramaDialogueAudioService.ts` (5KB) + `TTSProviderPort.ts` (6KB) | TTS 对白配音 |
| `visual/` | `DramaShotKeyframeService.ts` (13KB) | 镜头关键帧 |
| `production/` | `DramaBatchOrchestrator.ts` (18KB) | 批量编排 |
| `engine/` | `rhythmEngine.ts` (10KB) + `paywallPlanPolicy.ts` (3KB) | 节奏引擎 + 付费策略 |
| `guidance/` | `DramaGuidanceService.ts` (4KB) | 指导 |
| `source/` | 4 个适配器 | 多来源素材适配（小说/原创/文本导入） |
| `video/` | `VideoProviderPort.ts` (9KB) | 视频提供商抽象 |
| `contracts/` | — | 契约 |

根级文件：`DramaProjectService.ts` / `DramaEpisodeOutlineService.ts` / `DramaScriptService.ts` / `DramaComplianceService.ts` / `DramaQualityGate.ts` / `DramaRepairService.ts` / `DramaStoryboardService.ts` / `DramaExportService.ts` (11KB) / `DramaCharacterImageService.ts` (16KB) / `DramaVideoPromptService.ts` (7KB) 等。

Prompt Registry 注册了 **10 个戏剧相关 Prompt**。

#### Comic (漫画改编)

`server/src/services/comic/` — **9 文件 / ~90KB**

`ComicBatchOrchestrator.ts` / `ComicCharacterImageService.ts` (21KB) / `ComicPanelImageService.ts` (16KB) / `ComicBubbleLayoutService.ts` (11KB) / `ComicExportService.ts` (8KB) 等。

#### Video (视频改编)

`server/src/services/video/` — **4 文件 / ~15KB**

| 文件 | 大小 | 功能 |
|---|---|---|
| `OpenMontageBridgeClient.ts` | 6KB | OpenMontage 桥接客户端（HTTP 调用外部渲染微服务） |
| `VideoProjectService.ts` | 3KB | 视频项目管理（创建/查询/状态） |
| `VideoRenderService.ts` | 3KB | 渲染任务提交与状态轮询 |
| `VideoScriptService.ts` | 2KB | 视频脚本生成（调用 Prompt Registry） |

`server/src/modules/video/http/videoRoutes.ts` — 5KB HTTP 路由

`server/src/prompting/prompts/video/video.prompts.ts` — 5KB Prompt 资产

Prompt Registry：`video.novel_to_script@v1`（章节→视频脚本）、`video.novel_trailer@v1`（预告片脚本）

`client/src/pages/video/VideoWorkspacePage.tsx` — **16KB** 前端视频改编工作台

**OpenMontage Bridge 微服务**：`tools/openmontage-bridge/` — 独立 Python 项目

| 文件/目录 | 大小 | 功能 |
|---|---|---|
| `server.py` | 8KB | FastAPI HTTP 服务器（异步渲染 + 状态查询 + 健康检查） |
| `render_demo.py` | 4KB | 渲染示例脚本 |
| `adapters.py` | 4KB | 适配器 |
| `config.yaml` | 1KB | 配置 |
| `AGENT_GUIDE.md` | **39KB** | Agent 集成指南 |
| `PROMPT_GALLERY.md` | 12KB | Prompt 示例库 |
| `PROJECT_CONTEXT.md` | 7KB | 项目上下文 |
| `Makefile` | 3KB | 构建脚本 |
| `schemas/` | 子目录 | 数据 Schema |
| `pipeline_defs/` | 子目录 | 渲染 Pipeline 定义 |
| `remotion-composer/` | 子目录 | Remotion 渲染器 |
| `lib/` | 子目录 | 核心库 |
| `styles/` | 子目录 | 样式 |
| `assets/` | 子目录 | 素材 |
| `tools/` | 子目录 | 工具 |
| `skills/` | 子目录 | 技能定义 |
| `tests/` | 子目录 | 测试 |
| `docs/` | 子目录 | 文档 |

数据库：`VideoProject` 模型（SQLite + 主 Schema 同步）

### 24. 图像生成 (Image)

`server/src/services/image/` — **8 文件 + novelCover 子目录**

`ImageGenerationService.ts` (23KB) / `imageAssetStorage.ts` (10KB) / `provider.ts` (10KB)

### 25. 标题生成 (Title)

`server/src/services/title/` — **4 文件 / 27KB**

`titleGeneration.shared.ts` (12KB) / `TitleGenerationService.ts` (8KB) / `TitleLibraryService.ts` (6KB)

### 26. Settings / Bootstrap

`server/src/services/settings/` — **12 文件 + secretStore/ 子目录**

| 文件 | 大小 | 功能 |
|---|---|---|
| `RagSettingsService.ts` | 16KB | RAG 配置 |
| `RagRuntimeSettingsService.ts` | 14KB | RAG 运行时 |
| `AutoDirectorChannelSettingsService.ts` | 10KB | 导演频道 |
| `ProviderBalanceService.ts` | 8KB | 提供商余额/配额 |
| `RagCompatibilityBootstrapService.ts` | 8KB | RAG 兼容引导 |
| `secretStore/` | 3 文件 | 密钥存储抽象 |

`server/src/services/bootstrap/SystemResourceBootstrapService.ts` — **22KB**

### 27. Event Bus / Side Effects

`server/src/events/` — 事件驱动架构

- `EventBus.ts` — 事件总线
- `handlers/registerNovelEventHandlers.ts` — 事件处理器注册
- `sideEffects/` — 5 文件：副作用 Job 服务(7KB) / Handler / Worker / 类型

### 28. Workers

`server/src/workers/` — 3 文件

`DirectorTaskQueue.ts` (6KB) / `TaskDispatcher.ts` (2KB) / `directorWorker.ts` (4KB)

---

## 共享类型契约层

`shared/types/` — **46 个文件 / 380KB+**

| 文件 | 大小 | 定义 |
|---|---|---|
| `chapterRuntime.ts` | **44KB** | 章节运行时所有类型 |
| `directorRuntime.ts` | **37KB** | 自动导演运行时投影 |
| `novel.ts` | 27KB | 小说核心类型 |
| `directorWorkflowStepCatalogData.ts` | 24KB | 步骤目录数据 |
| `novelDirector.ts` | 23KB | 导演 API 类型 |
| `styleEngine.ts` | 21KB | 写法引擎类型 |
| `worldWizard.ts` | 19KB | 世界向导类型 |
| `chapterQualityLoop.ts` | 13KB | 质量闭环 |
| `timeline.ts` | 11KB | 时间线 |
| `canonicalState.ts` | 10KB | 叙事状态 |
| `autoDirectorFollowUp.ts` | 10KB | 导演后续 |
| 其他 35 文件 | — | bookAnalysis / characterResource / novelWorld / chapterLengthControl / chapterPatchRepair / autoDirectorApproval… |

---

## 数据库 Schema

| 维度 | 数量 |
|---|---|
| 模型数量 | **129 个 model** |
| 行数 | **3421 行** |
| 文件大小 | ~113KB (PostgreSQL) + ~113KB (SQLite 镜像) |

`server/src/db/` — 6 文件

- `storyModeSeeds.ts` — **40KB** 叙事模式种子数据
- `runtimeMigrations.ts` — 13KB 运行时迁移
- SQLite 适配（pragmas / retry）

---

## 前端架构全景

### 页面清单 (21 个页面目录)

| 页面 | 核心文件 | 规模 |
|---|---|---|
| `Home.tsx` | 24KB | 首页 |
| `novels/` | `NovelEdit.tsx` **117KB** + 63 组件 + 7 子目录 + 19 hooks + 20 工具文件 | 重型工作台 |
| `creativeHub/` | `CreativeHubPage.tsx` 20KB + 12 组件 | 创作中枢 |
| `worlds/` | `WorldWorkspace.tsx` 24KB / `WorldGenerator.tsx` 17KB / `WorldList.tsx` 16KB | 世界管理 |
| `writingFormula/` | `WritingFormulaPage.tsx` 27KB + 7 工具文件 + 组件 | 写法管理 |
| `drama/` | `DramaProjectPage.tsx` 31KB + `DramaWorkspacePage.tsx` 23KB + 组件 | 戏剧改编 |
| `comic/` | `ComicWorkspacePage.tsx` 26KB + `ComicProjectPage.tsx` 18KB + 子目录 | 漫画改编 |
| `settings/` | `SettingsPage.tsx` 21KB + `ModelRoutesPage.tsx` 22KB + 12 文件 | 系统设置 |
| `tasks/` | `TaskCenterPage.tsx` 26KB + 组件 | 任务中心 |
| `bookAnalysis/` | 页面 + hooks + 组件 | 拆书分析 |
| `autoDirectorFollowUps/` | `AutoDirectorFollowUpCenterPage.tsx` 15KB + 组件 | 导演跟进 |
| `promptWorkbench/` | `PromptWorkbenchPage.tsx` **31KB** + 组件 | Prompt 调试 |
| `knowledge/` | `KnowledgePage.tsx` **24KB** + 组件 | 知识库 |
| `characters/` | `CharacterLibrary.tsx` 7KB + 组件 | 角色库 |
| `titles/` | `TitleStudioPage.tsx` + 组件 | 标题工坊 |
| `storyModes/` | `StoryModeManagementPage.tsx` 27KB + 组件 | 叙事模式 |
| `genres/` | `GenreManagementPage.tsx` 5KB + 组件 | 题材管理 |
| `antiAiRules/` | `AntiAiRulesPage.tsx` 12KB + 组件 | Anti-AI 规则 |
| `video/` | `VideoWorkspacePage.tsx` 16KB | 视频改编 |
| `chat/` | `ChatPage.tsx` 22KB | 聊天（老入口） |
| `help/` | `HelpPage.tsx` 10KB | 帮助 |

### 关键组件子目录

`novels/components/` — **63 文件 + 7 子目录**

重量级组件：`OutlineTab.tsx` (43KB) / `NovelExistingProjectTakeoverDialog.tsx` (37KB) / `NovelCharacterPanel.tsx` (36KB) / `CharacterAssetWorkspace.tsx` (31KB) / `NovelWorldManagerCard.tsx` (29KB) / `NovelTaskDrawer.tsx` (29KB) / `CharacterCastOptionsSection.tsx` (29KB) / `NovelAutoDirectorDialog.tsx` (27KB) / `NovelBasicInfoForm.tsx` (27KB) / `StructuredOutlineWorkspace.tsx` (26KB) / `PipelineTab.tsx` (26KB) / `NovelAutoDirectorProgressPanel.tsx` (26KB) / `NovelAutoDirectorSetupPanel.tsx` (24KB)

子目录：`chapterEditor/`(8 文件) / `chapterInsights/`(8 文件) / `cover/`(4 文件) / `takeover/`(4 文件) / `titleWorkshop/`(2 文件) / `basicInfoForm/`(4 文件) / `novelWorld/`(1 文件)

### 其他前端基础设施

| 层 | 路径 | 规模 |
|---|---|---|
| API 客户端 | `client/src/api/` | 31 文件 + `novel/` 子目录(8 文件) |
| 共享组件 | `client/src/components/` | 7 子目录（autoDirector / common / creativeHub / knowledge / layout / ui / workflow） |
| Layout | `components/layout/` | 18 文件 + mobile 子目录 — `NovelWorkspaceRail.tsx` 26KB / `DesktopBootstrapShell.tsx` 15KB / `Sidebar.tsx` 10KB |
| AI 驾驶舱 | `components/autoDirector/AICockpit.tsx` | 21KB |
| Hooks | `client/src/hooks/` | 3 文件 |
| Lib | `client/src/lib/` | 14 文件 |
| Store | `client/src/store/` | 4 文件 |
| Mobile | `novels/mobile/` | 5 文件 |

---

## Desktop Electron

`desktop/src/main.ts` — **18KB** Electron 主进程

`desktop/src/runtime/` — **7 文件 / 45KB**

| 文件 | 大小 | 功能 |
|---|---|---|
| `dataImport.ts` | 13KB | 数据导入 |
| `server.ts` | 9KB | 内嵌服务器 |
| `updater.ts` | 7KB | 自动更新 |
| `logRetention.ts` | 6KB | 日志保留 |
| `paths.ts` | 3KB | 路径管理 |
| `state.ts` | 3KB | 状态 |
| `logging.ts` | 2KB | 日志 |

---

## 外部工具

`tools/openmontage-bridge/` — 独立 Python 微服务（24 文件 + 11 子目录），详见 [23. 跨媒体改编 > Video](#23-跨媒体改编)。

---

## 测试套件

`server/tests/` — **120+ 个测试文件**

覆盖范围：自动导演(~20 测试) / Pipeline(~8) / 卷规划(~13) / 工作流(~11) / 世界观(~7) / Prompt(~4) / RAG(3) / 状态(3) / 写法(2) / 伏笔(2) / 规划器(5) / 时间线(1) / 标题(1)…

前端 colocated 测试：8 个 `.test.mjs` 文件散布在 `client/src/pages/` 和 `client/src/lib/` 中。

---

## 文档体系

| 目录 | 文件数 | 说明 |
|---|---|---|
| `docs/releases/release-notes.md` | **200KB** 单文件 | 完整发布日志 |
| `docs/codegraph_index.md` | **117KB** | 代码图索引 |
| `docs/wiki/architecture/` | 12 篇 | 模块边界 / 世界网关(22KB) / 事件副作用 / 架构迁移 |
| `docs/wiki/workflows/` | 16 篇 | 自动导演运行时(21KB) / 章节生产链(26KB) / 短剧工作区(16KB) |
| `docs/wiki/prompts/` | 2 篇 | Prompt 注册表 / 质量守卫 |
| `docs/wiki/debugging/` | 3 篇 | 角色连续性 / 日志保留 / 反复失败模式 |
| `docs/wiki/product/` | 3 篇 | 初学者优先 / 设置就绪 / 世界骨架 |
| `docs/wiki/rag/` | 1 篇 | 知识和上下文组装 |
| `docs/design/` | 5 个 PRD | 写法引擎 v1/v2(19KB 各) / 世界管理 v2(16KB) / 世界故事接口(14KB) |

---

## App 入口与路由

`server/src/app.ts` — **349 行 / 12KB**

注册 **34 条路由**，来自 3 种来源：
- `routes/` — 25 个路由文件
- `modules/*/http/` — 5 个模块路由（novel / drama / comic / video / export）
- `services/novel/director/http/` — 2 个导演路由
- `modules/setup/world/http` — 1 个世界设置路由

启动时初始化：事件处理器注册 / 副作用 Worker / Pipeline 运行时 / 导演 Worker / 日志保留 / RAG 兼容引导 / 系统资源种子数据。

LangGraph 图（`graphs/`）：
- `worldBuildingGraph.ts` (9KB)
- `writingFormulaGraph.ts` (4KB)
- `novelOutlineGraph.ts` (4KB)
- `characterDesignGraph.ts` (883B)

`server/src/modules/` — **7 个功能模块**：novel / drama / comic / video / export / timeline / setup
