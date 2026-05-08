# Prompt Governance Audit 2026-05-08

## Scope

本检查点记录提示词管理体系第一阶段的治理状态。当前阶段只完善可管理、可预览、可审计和后续安全编辑所需的元数据，不把章节质量 Prompt Contract 强化作为目标。

## Governance Fields

Prompt Catalog 和治理测试以这些字段作为最小审计面：

| 字段 | 目的 | 当前处理 |
| --- | --- | --- |
| `id` / `version` | 稳定定位 prompt 资产 | 所有注册资产必须存在 |
| `taskType` / `mode` | 明确模型路由和输出形态 | 所有注册资产必须存在 |
| `outputSchema` | 结构化输出边界 | 结构化 prompt 在 Catalog 标记能力 |
| `postValidate` | 业务语义校验 | Catalog 标记能力，禁止 slot 覆盖 |
| `repairPolicy` | JSON 修复策略 | Catalog 标记能力，禁止 slot 覆盖 |
| `semanticRetryPolicy` | 语义重试策略 | Catalog 标记能力，禁止 slot 覆盖 |
| `contextRequirements` | 预览和追踪的上下文契约 | 核心链路优先补齐 |
| `editableSlots` | 后续低风险表达编辑边界 | 只声明和展示，不接入运行时覆盖 |
| `lockedFields` | 禁止编辑边界 | Catalog 固定展示 schema、校验、路由、上下文等字段 |

## Domain Status

| 能力域 | 代表 prompt | 状态 | 说明 |
| --- | --- | --- | --- |
| 创作中枢 | `planner.intent.parse@v1` | 已注册，管理元数据补齐中 | 已声明 creative hub 资源绑定、近期消息、小说基础信息和生产状态上下文需求。 |
| 自动导演 | `novel.director.workspace_analysis@v1`, `novel.director.manual_edit_impact@v1` | 已完整纳管 | 已通过 workspace / manual edit inventory 上下文块进入预览。 |
| 章节写作 | `novel.chapter.writer@v5` | 已完整纳管 | 已声明章节写作上下文需求，并新增语气、反 AI 味和结尾钩子偏好 slot 元数据。 |
| 章节编辑器 | `novel.chapter_editor.workspace_diagnosis@v1`, `novel.chapter_editor.user_intent@v1`, `novel.chapter_editor.rewrite_candidates@v2` | 已注册，管理元数据补齐中 | 已补核心上下文需求；候选改写风格开放为低风险 slot。 |
| 章节审校修复 | `audit.chapter.full@v2`, `audit.chapter.light@v1`, `novel.review.*` | 部分完整纳管 | audit full/light 已有上下文需求和报告表达 slot；review repair/patch 仍待后续补全管理元数据。 |
| 分卷拆章 | `novel.volume.*` | 已注册但缺管理元数据 | 多数已有 schema、postValidate 或 retry；下一阶段补 Context Requirements。 |
| 角色 | `novel.character.*`, `novel.character_resource.*` | 已注册但缺管理元数据 | 已纳入 registry，后续按角色生成、角色资源、关系推演分别补上下文契约。 |
| 世界观 | `world.*`, `storyWorldSlice.generate@v1` | 已注册但缺管理元数据 | 已纳入 registry，后续补世界观资产、引用资料和局部切片上下文声明。 |
| 风格 | `style.*`, `writingFormula.*` | 已注册但缺管理元数据 | 当前重点是可审计注册；表达层 slot 需要等管理界面稳定后再开放。 |
| 书籍分析 / 辅助能力 | `bookAnalysis.*`, `title.generation@v1`, `image.character.prompt_optimize@v1` | 已注册但缺管理元数据 | 属于低风险后补队列。 |

## Registry Outside Migration List

仍在 registry 外的调用被分为两类：

| 路径 | 状态 | 处理 |
| --- | --- | --- |
| `server/src/llm/structuredInvoke.ts` | 批准例外 | JSON repair 内部能力，不作为产品级 prompt 迁移。 |
| `server/src/llm/connectivity.ts` | 批准例外 | 连通性探测，不作为产品级 prompt 迁移。 |
| `server/src/routes/chat.ts` | 阶段性例外 | 仍承担流式桥接职责，后续随 runtime 统一再拆。 |
| `server/src/graphs/*` | 阶段性例外 | 自动导演/阶段二桥接保留，禁止继续扩写业务 prompt。 |
| `server/src/services/title/titlePromptBuilder.ts` | 待迁移 | 旧标题 prompt builder，后续触碰标题链路时迁入 registry。 |
| `server/src/services/novel/novelCoreGenerationService.ts` | 待迁移 | 旧核心生成链路，后续按产品 prompt 迁移。 |
| `server/src/services/world/worldDraftGeneration.ts` | 待迁移 | 直接 `getLLM` 使用仅保留在现有允许清单，新增能力不得沿用。 |
| `server/src/agents/planner/intentPromptSupport.ts` | 支撑文件 | 为已注册 `planner.intent.parse` 提供枚举和渲染支撑，不作为新业务 prompt 入口。 |

## Preview Contract

Prompt Preview 保持只读：

- 不调用模型。
- 不保存 override。
- 返回最终 `messages`、选中上下文块、丢弃上下文块、缺失 required groups、resolver errors 和 trace preview。
- 失败或上下文不足时面向管理者暴露原因，例如缺少 `novelId`、缺少 `chapterId`、resolver 没有返回 required group。

## Editable Slots V1

本阶段仅展示声明，不接入运行时覆盖。

已开放的低风险 slot：

- `writer.tonePreference`
- `writer.antiAiRules`
- `writer.endingHookPreference`
- `audit.reportStyle`
- `chapterEditor.candidateStyle`

禁止编辑字段：

- `outputSchema`
- `postValidate`
- `postValidateFailureRecovery`
- `semanticRetryPolicy`
- `taskType`
- `mode`
- `contextPolicy`
- `toolCatalog`
- `approvalBoundary`
- required context

## Override And Trace Design

`PromptOverrideDraft` 仅作为类型设计进入代码，生命周期为 `draft`、`published`、`rolled_back`。本阶段不新增发布 API，也不让 Prompt Runner 加载 active override。

`PromptRunTrace` 的最小字段包括：

- prompt id / version / taskType
- context block ids、dropped ids、summarized ids
- provider、model、latency
- repair / retry 次数
- entrypoint、novelId、chapterId、taskId
- compiled hash 和 context snapshot hash 的预留字段

Prompt Workbench Preview 会返回 `tracePreview`，为后续“某次生成为什么差”的排查视图提供结构基础。

## Technical Debt Closed

`server/src/prompting/workflows/workflowRegistry.ts` 已拆为按域注册文件：

- `generalWorkflowDefinitions.ts`
- `productionWorkflowDefinitions.ts`
- `directorWorkflowDefinitions.ts`
- `chapterWorkflowDefinitions.ts`
- `workflowTypes.ts`

主 registry 只负责聚合、协作 hold 判断和 workflow 解析。
