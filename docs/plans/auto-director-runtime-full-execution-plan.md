# 自动导演统一运行时完整执行计划

更新日期：2026-04-29

关联文档：

- [自动导演统一运行时重构方案](./auto-director-unified-runtime-refactor-plan.md)
- [自动导演统一运行时 MVP 落地切片方案](./auto-director-mvp-migration-plan.md)
- [提示词工作台、上下文装配与统一步骤运行时方案](./prompt-workbench-context-and-step-runtime-plan.md)
- [Auto Director Progress Audit](../checkpoints/auto-director-progress-audit.md)

## 1. 文档定位

本文基于 `codex/auto-director-runtime-mvp-plan` 当前实现进度，定义自动导演统一运行时的完整执行计划。

本计划不按“做完一阶段再决定下一阶段”的方式推进，而按一次完整改造交付来组织。所有执行域都属于同一个交付目标：把当前自动导演从“旧链路旁挂 runtime 记录”推进为“可控制、可恢复、可解释、可扩展的统一小说生产运行时”。

工程上仍必须遵守依赖顺序，例如写入型节点必须先接入 PolicyEngine，前端进度必须先有可投影事件，创作中枢不能绕过 DirectorRuntime 直接调用旧服务。这些顺序不是分阶段验收，而是同一次完整交付内的实施依赖。

完整交付完成后，系统应达到：

- 自动导演新建、接管、继续、失败恢复、手动编辑后继续，都进入同一套 DirectorRuntime。
- 关键写入动作都通过 NodeRunner 和 PolicyEngine，不再直接散落在旧 service 分支里。
- 产物账本能支持缺失判断、版本来源、依赖、stale、用户内容保护和局部恢复。
- Runtime event 能投影到任务中心、自动导演进度面板和创作中枢。
- 章节执行和质量修复能局部失败、局部修复，不冻结整本书。
- 用户手动修改后，系统能用 AI 结构化分析影响范围和最小修复路径。
- 创作中枢能通过 runtime API 解释和控制自动导演，而不是直接调用旧阶段函数。
- Context Broker、Prompt Catalog 和只读 Prompt Preview 为提示词工作台打下基础。
- LangGraph 只作为低风险编排试点接入，不吞掉运行时、策略、产物和节点边界。
- 第一批网文质量模块进入统一运行时，帮助新手持续写完整本书。

## 2. 当前基线

当前已经完成：

- 共享运行时契约：`DirectorRuntimeSnapshot`、`DirectorStepRun`、`DirectorEvent`、`DirectorArtifactRef`、`DirectorWorkspaceAnalysis`、`DirectorPolicyDecision`。
- `DirectorRuntimeService` 门面：支持初始化运行、获取快照、工作区分析、策略更新、节点运行入口。
- `DirectorRuntimeStore`：暂存 runtime snapshot 到 `NovelWorkflowTask.seedPayloadJson.directorRuntime`，并记录 step、event、artifact。
- `DirectorWorkspaceAnalyzer`：先做确定性 inventory，再通过注册 PromptAsset 做 AI 结构化解释。
- `DirectorPolicyEngine`：已有 `suggest_only`、`run_next_step`、`run_until_gate`、`auto_safe_scope` 四种模式与一次自动修复预算。
- `DirectorNodeRunner`：已有标准节点契约和策略判断入口。
- 自动导演候选、确认建书、已有小说接管、`story_macro`、`book_contract`、角色准备、卷规划、结构化拆章、章节执行、质量检查、修复、状态提交、伏笔同步和角色资源同步已进入统一 Step Module 写入合同，并通过 NodeRunner / PolicyEngine 路径执行或受控投影。
- `story_macro` 与 `book_contract` 已拆为独立恢复节点；已有故事宏观规划但缺少书级创作约定时，会从书级约定继续，不再跳过到角色准备。
- 后端路由和前端 API wrapper 已提供 workspace analysis、runtime snapshot、policy update、runtime continue，任务中心、进度面板和小说工作台侧栏已开始消费 runtime projection。
- 创作中枢已通过 director runtime tools 读取状态、解释下一步、评估改文影响和请求继续推进；当前属于工具级接入，不是完整中枢主导编排。
- Context Broker、Prompt Workbench 只读目录 / 预览、runtime context resolver 已落地，章节写作、章节审校和 director workspace analysis 已开始共用上下文块组织方式。
- `DirectorLangGraphPilot` 已实现低风险图，覆盖 workspace analyze、recommend next action、run next step、approval interrupt，并通过单测验证 interrupt / resume / trace；但尚未接入自动导演主链。
- 启动恢复策略已明确为服务重启后先标记为待手动恢复，用户确认后再从真实资产断点继续，不做后台静默自动续跑。
- 定向测试已覆盖 runtime policy、NodeRunner、Artifact Ledger、Event Projection、LangGraph Pilot、Step Module、Prompt Workbench、Context Broker、director runtime tools 和启动恢复初始化。

当前未完成但必须纳入完整交付：

- Step Module / NodeRunner / PolicyEngine 写入合同已覆盖自动导演关键写入面；下一步重点转为真实数据恢复、ledger 真相层、质量闭环和状态驱动 replan。
- `PolicyEngine` 还不是所有写入动作、覆盖动作和高成本审校动作的硬 gate。
- Artifact Ledger 仍是 seed payload wrapper 索引，缺独立持久化表、完整生命周期、跨任务依赖演进和可恢复查询能力。
- 章节执行、质量修复、pipeline job 已开始标准节点化，但还没有完全达到可组合、可重放、可审计的统一 Step Runtime。
- `reader_promise`、`chapter_retention_contract`、`continuity_state`、`rolling_window_review`、`character_governance_state` 等质量产物已进入索引和依赖链，但还没有形成稳定的评估 -> 修复 -> 再评估闭环。
- 创作中枢接入仍偏工具级；还没有形成“中枢规划 -> director runtime -> step execution -> projection -> 用户确认”的完整闭环体验。
- 自动导演主执行链当前不使用 LangGraph；LangGraph 只能作为后续编排壳接入，不能替代 runtime、policy、ledger 和 step contract。
- `server/src/prompting/workflows/workflowRegistry.ts` 已超过 700 行硬阈值，后续继续扩展 intent 前应拆出按域 workflow definitions。
- 真实 Prisma 端到端回归仍不足，尤其是旧项目接管、服务重启后手动恢复、章节批量执行、改文后局部修复和多卷长周期推进。
- `NovelDirectorService.ts` 仍然过长，必须继续把执行域下沉到 runtime orchestration、adapters 和 step modules。

当前完成度判断：

- 按 MVP 底座衡量：约 `80%` 已完成。
- 按完整统一运行时衡量：约 `65%-70%` 已完成。
- 剩余风险不在“是否使用 LangGraph”，而在产物真相是否可恢复、真实数据链路是否稳定、质量闭环是否能局部修复，以及状态驱动 replan 是否真正成为默认判断。

## 2.1 下一轮最高优先级开发队列

以下 13 项作为 `codex/auto-director-runtime-mvp-plan` 分支的下一轮即将开发项目，优先级高于后续扩入口、创作中枢主导编排和 LangGraph 主链化。

1. **规划恢复链稳定**：补齐 `volume_strategy` 幂等重放、持久化卷规划恢复到 `structured_outline` 的真实数据回归；确保已有资产不会被重复生成或跳过。
2. **真实 Prisma 抽样回归**：覆盖旧项目接管、服务重启手动恢复、失败重试、章节批量执行、候选变更和状态版本，重点验证 `migration -> 章节写入 -> 候选变更 -> 状态版本`。
3. **Artifact Ledger 真相层**：从 wrapper 索引推进到跨任务可查询、版本生命周期、stale、用户内容保护和局部恢复能力；保持 additive schema，不破坏旧数据。
4. **PolicyEngine 硬 gate 深化**：高成本审校、高风险修复、大范围自动执行、覆盖用户内容等场景必须在写入前经过策略判断和审批边界。
5. **质量产物闭环**：`reader_promise / chapter_retention_contract / continuity_state / rolling_window_review / character_governance_state` 从记录型产物推进为评估、失效、局部修复、再评估闭环。
6. **Planner / Replan 状态驱动化**：`PlannerService.replan` 的窗口决策、触发理由和章节选择切到 `CanonicalStateService / ContextAssemblyService / ChapterStateGoal`。
7. **章节任务单质量门禁**：为 `purpose / boundary / taskSheet` 增加 schema + 语义可用性双门禁，拦截坏细化产物进入同步和执行链。
8. **章节修复策略**：补 `patch_first` 默认策略；动态角色系统进入执行期角色筛选、修复边界和 replan 判断。
9. **模型路由细化**：从 `planner / writer / review / repair` 粗粒度推进到小说生产阶段级路由与 fallback。
10. **卷级工作台消费链**：把 `critique / rebalance / uncertainty / canonical payoff ledger` 接成卷级工作台默认消费链，并让卷级账本视图成为主视图。
11. **新手入口收敛**：首页、创建页、空状态统一为“AI 自动导演推荐入口 + 手动高级入口”；关键节点只保留一个推荐下一步。
12. **拆书任务合同**：补齐 `scope / pause / resume / coverage`，形成“前 N 片段试跑 -> 扩范围继续”的渐进式流程。
13. **技术债收口**：拆分 `workflowRegistry.ts`，继续瘦身 `NovelDirectorService` 和 `DirectorRuntimeStore`，避免新能力继续堆回主 service。

## 3. 执行原则

### 3.1 一次完整交付

本计划按完整改造交付执行，不拆成可长期停留的半成品阶段。允许在同一次交付内按依赖先后实施，但最终验收必须覆盖全链路。

不接受的完成状态：

- 只有 runtime 记录，没有策略接管。
- 只有后端 snapshot，没有前端可见进度。
- 只有工作区分析，没有手动编辑影响分析。
- 只有章节执行记录，没有局部失败和 repair ticket。
- 只有创作中枢工具声明，却仍直接碰旧自动导演阶段函数。
- 只有 Context Broker 草案，却没有任何真实 prompt 或 step 消费。

### 3.2 AI-first

工作区阶段判断、手动编辑影响分析、下一步推荐、质量风险判断、修复路径建议，必须通过 AI 结构化理解完成。

允许确定性代码做：

- 资产存在性扫描。
- 输入校验。
- 幂等、锁、权限和覆盖保护。
- AI 输出后的范围检查和安全过滤。

不允许用关键词、正则、硬编码分支替代核心判断。

### 3.3 新手完成整本书优先

所有 UI、策略和运行时能力都服务于一个目标：让完全写作新手知道下一步该做什么，并能持续推进到完整小说。

因此完整交付必须让用户看到：

- 当前小说做到哪里。
- 系统推荐下一步是什么。
- 为什么推荐这一步。
- 哪些内容会被保护。
- 哪些风险只影响局部范围。
- 失败后如何继续。

### 3.4 先收口再扩展，但同属一次交付

Reader Promise、Chapter Retention Contract、Rolling Window Review、World Skeleton、Character Governance 等创作质量模块最终要进入统一运行时。

但它们不能绕过 runtime、policy、artifact、event 边界单独堆功能。完整交付的执行顺序必须先建立边界，再把质量模块接进边界。

### 3.5 数据安全

完整执行期间如涉及数据库迁移，默认只允许 additive schema change。

任何删除、重置、覆盖旧数据、重算并覆盖用户内容的操作，必须满足项目数据保护规则：

- 明确用户批准。
- 有可验证备份路径。
- 有恢复验证或至少备份存在性与大小检查。

## 4. 完整目标架构

```text
自动导演入口 / 接管入口 / 继续入口 / 创作中枢入口 / 手动修改后继续
  ↓
DirectorRuntimeService
  ↓
PolicyEngine
  ↓
NodeRunner
  ↓
Legacy Stage Adapter / Step Module
  ↓
Context Broker
  ↓
Prompt Runner
  ↓
Artifact Ledger
  ↓
DirectorEvent
  ↓
Task Center / Auto Director UI / Creative Hub Projection / Prompt Trace
```

模块职责：

| 模块 | 完整交付职责 |
| --- | --- |
| DirectorRuntimeService | 统一运行入口、运行状态、策略切换、节点调度、恢复语义 |
| PolicyEngine | 自动/手动策略、覆盖保护、修复预算、失败范围控制、审批要求 |
| NodeRunner | 标准节点执行、幂等、step/event/artifact 写入、错误记录 |
| Legacy Stage Adapter | 包装旧候选、规划、拆章、接管、章节执行和修复能力 |
| Step Module | 新能力的标准执行单元，供自动导演、章节流水线和创作中枢复用 |
| Context Broker | 统一取数、预算、快照和上下文块生成 |
| Prompt Runner | 继续作为产品级 prompt 调用入口，执行注册、结构化输出和校验 |
| Artifact Ledger | 保存产物索引、来源、版本、依赖、stale、保护状态 |
| DirectorEvent Projection | 把运行事实投影到用户可见进度、任务中心和创作中枢 |
| LangGraph Pilot | 只负责低风险编排、interrupt、resume 和 trace |

## 5. 完整执行范围

### 5.1 Runtime 接管旧阶段

必须完成：

- 建立 runtime adapters：
  - `CandidateStageNodeAdapter`
  - `PlanningStageNodeAdapter`
  - `StructuredOutlineNodeAdapter`
  - `TakeoverNodeAdapter`
  - `ChapterExecutionNodeAdapter`
  - `QualityRepairNodeAdapter`
- 旧阶段通过 `DirectorNodeRunner.run()` 执行，不再只手动记录 step。
- 每个 adapter 声明：
  - reads
  - writes
  - mayModifyUserContent
  - requiresApprovalByDefault
  - supportsAutoRetry
  - affectedScope resolver
- `NovelDirectorService` 保留 API facade 和兼容入口，主编排职责下沉到 runtime orchestration 和 adapters。

完成标准：

- 候选、书级规划、角色准备、分卷策略、结构化拆章、接管、章节执行、质量修复都至少有标准 adapter。
- 写入型节点执行前必须经过 PolicyEngine。
- `suggest_only` 模式下不执行写入节点。
- 用户正文相关节点在未允许覆盖时进入确认或阻断范围。
- `NovelDirectorService.ts` 不继续增长，并开始拆出明显职责。

### 5.2 PolicyEngine 硬接入

必须完成：

- 将策略判断接到所有写入型 NodeRunner 节点。
- 支持策略：
  - `suggest_only`
  - `run_next_step`
  - `run_until_gate`
  - `auto_safe_scope`
- 支持审批判断：
  - 覆盖用户内容。
  - 重算下游产物。
  - 自动执行大范围章节。
  - 高风险修复。
- 支持质量失败处理：
  - `repair_once`
  - `pause_for_manual`
  - `continue_with_risk`
  - `block_scope`
- 自动修复预算固定为一次，后续扩展必须显式设计。

完成标准：

- PolicyEngine 不再只是单测对象，而是实际阻止不符合策略的写入动作。
- 单章失败只影响受影响章节或范围，不冻结全书。
- 高风险覆盖默认需要确认。
- 非破坏性问题允许记录风险后继续。

### 5.3 Artifact Ledger 完整 wrapper

必须完成：

- 索引核心产物：
  - `book_contract`
  - `story_macro`
  - `character_cast`
  - `volume_strategy`
  - `chapter_task_sheet`
  - `chapter_draft`
  - `audit_report`
  - `repair_ticket`
  - `reader_promise`
  - `character_governance_state`
  - `world_skeleton`
  - `source_knowledge_pack`
  - `chapter_retention_contract`
  - `continuity_state`
  - `rolling_window_review`
- 给 artifact 增加：
  - source
  - sourceStepRunId
  - promptAssetKey / promptVersion
  - contentHash 或 contentSignature
  - dependsOn
  - status: draft / active / superseded / stale / rejected
  - protectedUserContent marker
- Workspace Analyzer 读取 ledger 判断：
  - missing
  - active
  - stale
  - protected user edited
  - needs repair

完成标准：

- 已有小说能 backfill 基础 artifact 索引。
- 新生成产物写旧业务表后同步写 ledger wrapper。
- 用户编辑章节正文后，对应 draft 被识别为受保护内容。
- 章纲依赖上游角色、分卷、世界规则；正文依赖章纲；修复票据依赖审核报告和正文。
- Analyzer 的推荐动作能基于 ledger 缺失、stale、保护状态输出。

### 5.4 DirectorEvent 投影和用户可见进度

必须完成：

- 建立 `DirectorEventProjectionService`。
- Runtime events 投影到：
  - task center detail step。
  - auto director progress panel。
  - workflow explainability summary。
  - creative hub message/tool result。
- 长步骤 heartbeat：
  - 候选生成。
  - 长 prompt 调用。
  - volume generation。
  - chapter detail bundle。
  - chapter execution / review / repair。
- 修复已知进度问题：
  - `book_contract` 进度不能低于前置 `constraint_engine`。
  - 任务中心和弹窗不应显示互相冲突的阶段。

完成标准：

- 自动导演运行超过 30 秒时，用户仍能看到当前阶段、等待说明和最近事件。
- 章节执行中的生成、审校、修复能在 UI 或任务详情中区分。
- `front10_ready`、`chapter_batch_ready`、`workflow_completed` 有明确下一步建议。
- 用户看到的是任务语言，不是后端迁移或重构语言。

### 5.5 章节执行与质量修复标准节点

必须完成：

- 新增标准节点：
  - `chapter_execution_node`
  - `chapter_quality_review_node`
  - `chapter_repair_node`
  - `chapter_state_commit_node`
  - `payoff_ledger_sync_node`
  - `character_resource_sync_node`
- Pipeline job 保留为子执行器，但入口、结果、失败、恢复都由 NodeRunner 管理。
- 审核结果写入 `audit_report` 和必要的 `repair_ticket`。
- 修复失败后进入人工修复或带风险继续。

完成标准：

- 第 5 章审核失败时生成 repair ticket，不冻结整本书。
- 自动修复一次失败后进入人工修复或带风险继续。
- 继续第 6 章时不会重复创建第 5 章 pipeline job。
- 服务重启后先提示用户手动恢复；用户确认恢复后从最后成功 step / artifact 继续，不重复写正文。

### 5.6 手动编辑影响分析

必须完成：

- 扩展 Workspace Analyzer schema：
  - `manualEditImpact`
  - `affectedArtifacts`
  - `minimalRepairPath`
  - `safeToContinue`
  - `requiresApproval`
- 增加确定性 edit inventory：
  - 最近修改章节。
  - 修改后的 contentHash。
  - 相关下游 task sheet / draft / audit report。
  - 相关 reader promise / payoff / character state。
- 暴露 runtime API：
  - 可以作为 workspace analysis mode。
  - 或新增 `evaluate-manual-edit-impact` 路由。
- 前端和创作中枢展示：
  - 当前改动影响了什么。
  - 推荐下一步。
  - 是否可以直接继续。
  - 是否需要确认局部重算。

完成标准：

- 用户只润色第 3 章正文时，系统不重做宏观规划，只建议审核或更新连续性。
- 用户改主角动机时，系统建议复核角色治理、卷目标和后续章纲。
- 用户删除关键伏笔时，系统指出影响后续 payoff 或相关章节任务。
- 推荐来自 AI 结构化输出，确定性代码只做范围保护和安全过滤。

### 5.7 创作中枢接入 DirectorRuntime

必须完成：

- 创作中枢新增自动导演工具：
  - `analyze_director_workspace`
  - `get_director_run_status`
  - `explain_director_next_action`
  - `run_director_next_step`
  - `run_director_until_gate`
  - `switch_director_policy`
  - `evaluate_manual_edit_impact`
- 工具只调用 DirectorRuntime 公开 API。
- 高风险动作进入创作中枢 approval gate。
- 中枢回答必须面向新手：
  - 当前小说状态。
  - 推荐下一步。
  - 风险和影响范围。
  - 是否需要用户确认。

完成标准：

- 用户在创作中枢问“这本书现在该做什么”，系统能基于 runtime/workspace analysis 回复。
- 用户要求继续自动导演时，中枢通过 runtime policy 和 continue API 执行。
- 中枢不直接调用 `runStructuredOutlinePhase()`、`continueTakeoverExecution()` 等旧内部函数。
- 覆盖用户内容、重算下游、大范围自动执行都进入 approval gate。

### 5.8 Context Broker 和 Prompt Catalog

必须完成：

- 新增 Context Resolver Registry。
- 首批 resolver：
  - `book_contract`
  - `story_macro`
  - `chapter_mission`
  - `volume_window`
  - `participant_subset`
  - `local_state`
  - `style_contract`
  - `world_slice`
  - `recent_chapters`
  - `rag_context`
  - `creative_hub.bindings`
  - `creative_hub.recent_messages`
- 新增 Context Broker：
  - 支持 snapshot / fresh / hybrid。
  - 支持 token 预算。
  - 输出 PromptContextBlock。
- 新增只读 Prompt Catalog API：
  - prompt id
  - version
  - taskType
  - mode
  - contextPolicy
  - outputSchema presence
- 新增 Prompt Preview API：
  - 给定 scope 和 prompt id 渲染最终 messages。
  - 不调用模型。
  - 不保存 override。

完成标准：

- 章节写作、章节审核、workspace analysis 至少各有一个调用路径使用 Context Broker。
- Prompt Catalog 能列出注册 prompt。
- Prompt Preview 能展示最终上下文块和消息。
- 不开放自由编辑完整 prompt。

### 5.9 统一 Step Module Runtime

必须完成：

- 建立 `WorkflowStepModule` 契约。
- 将旧自动导演 adapter 和章节 pipeline 节点对齐为 Step Module。
- 建立 Workflow Plan 结构：
  - goal
  - policy
  - steps
  - dependencies
  - approval requirement
- 章节流水线变成 Workflow Template。
- 自动导演变成 Workflow Planner，输出或调整 Workflow Plan。

完成标准：

- 自动导演和章节流水线不再长期分成两套执行语义。
- 手动按钮、自动导演和创作中枢能进入同一批 Step Module。
- 新增能力通过 Step Module、Context Resolver、PromptAsset、Artifact 类型接入。

### 5.10 低风险 LangGraph 试点

必须完成：

- 选择一个低风险图：

```text
workspace_analyze
  ↓
recommend_next_action
  ↓
run_next_step
  ↓
gate
```

或：

```text
candidate_generation
  ↓
title_pack
  ↓
candidate_selection_required interrupt
```

- LangGraph 只负责：
  - 下一步去哪。
  - interrupt。
  - resume。
  - trace。
- 业务状态仍来自：
  - DirectorRuntime。
  - PolicyEngine。
  - Artifact Ledger。
  - NodeRunner。

完成标准：

- interrupt / resume 后不会重复执行已成功节点。
- 图试点失败不影响旧入口正常运行。
- LangGraph 不直接承载产物真相和覆盖策略。

### 5.11 第一批网文质量模块

必须完成：

1. Reader Promise Ledger
   - 书级承诺。
   - 卷级承诺。
   - 节奏段承诺。
   - 章节承诺。
   - 审核承诺兑现度。
2. Chapter Retention Contract
   - 本章目标。
   - 新信息。
   - 可见变化。
   - 小回报。
   - 未解压力。
   - 章末钩子类型。
   - 角色驱动力。
   - 世界规则使用。
3. Rolling Window Review
   - 最近 5 章是否同质。
   - 主角目标有没有推进。
   - 读者承诺有没有兑现或加码。
   - 结尾钩子是否重复。
   - 角色关系是否停滞。
   - 世界规则是否参与冲突。
4. World Skeleton V1
   - 没有绑定世界观时，按题材判断是否生成项目级世界规则骨架。
   - 世界规则必须转化为冲突、代价、资源、禁区、组织或地点。
5. Character Governance V1
   - 主角阶段目标、误区、代价和状态。
   - 配角功能、关系推进、出场责任。
   - 章节任务必须说明关键角色带来的冲突或选择。

完成标准：

- 每章任务单不只说明事件，还说明读者获得感和追读理由。
- 最近 5 章重复或停滞时，系统能生成具体修复建议。
- 世界观不只是背景资料，而能参与章节冲突。
- 角色不只是参与者，而能驱动每章冲突和选择。
- 审核失败输出 affected scope，不冻结全书。

## 6. 端到端执行主线

完整交付按这条主线收束：

```text
用户入口
  ↓
Runtime 初始化或恢复
  ↓
Workspace Analyzer 读取 Ledger + Inventory
  ↓
AI 结构化判断生产阶段、风险、推荐动作
  ↓
PolicyEngine 判断是否可执行、是否需审批、是否保护用户内容
  ↓
NodeRunner 执行标准节点或旧阶段 Adapter
  ↓
Context Broker 组装上下文
  ↓
Prompt Runner 调用注册 prompt
  ↓
旧业务表写入 + Artifact Ledger 索引
  ↓
DirectorEvent 记录事实
  ↓
Projection 更新任务中心、自动导演 UI、创作中枢
  ↓
失败时根据 affected scope 局部修复、人工确认或带风险继续
```

这条主线必须覆盖：

- 新建小说。
- AI 接管已有小说。
- 手动修改后继续。
- 失败恢复。
- 自动执行章节。
- 质量审核和修复。
- 创作中枢询问和控制。

## 7. 非目标

完整执行期间不做：

- 不重置数据库。
- 不删除或批量迁移旧业务数据。
- 不把自动导演主链一次性全量 LangGraph 化。
- 不开放自由编辑完整 prompt。
- 不让创作中枢直接调用自动导演旧内部阶段函数。
- 不用关键词、正则、硬编码 fallback 替代 AI 结构化判断。
- 不在没有备份验证的情况下执行任何 destructive data operation。

## 8. 数据模型策略

短期继续沿用：

- `NovelWorkflowTask`
- `seedPayloadJson.directorRuntime`
- 旧业务表：BookContract、StoryMacroPlan、VolumePlan、Chapter、QualityReport、AuditReport 等。

完整交付中可以通过 additive migration 增加：

- `DirectorRun`
- `DirectorStepRun`
- `DirectorEvent`
- `DirectorArtifact`
- `DirectorArtifactDependency`
- `ContextSnapshot`
- `PromptRunTrace`

新增独立表的触发条件：

- seed payload 存储已经影响查询、投影、恢复或体积控制。
- artifact dependency 需要跨任务查询。
- prompt trace 和 context snapshot 需要可重放。
- runtime event 需要稳定投影到多个入口。

迁移约束：

- 只做 additive migration。
- 迁移前说明备份路径。
- 不删除旧字段。
- 旧任务仍能读取。

## 9. 统一验收场景

完整交付必须覆盖以下场景：

1. 一句话灵感新建小说，生成候选并停在候选确认。
2. 确认候选后生成 Book Contract、角色、卷规划、前 10 章任务单。
3. 已有小说有角色和前 8 章正文，接管后先分析工作区，再推荐补第 9-20 章任务单。
4. 用户修改主角动机，系统判断角色、卷目标和后续章纲需要复核。
5. 用户只润色第 3 章正文，系统不重做宏观规划，只建议审核或更新连续性。
6. 用户删除关键伏笔，系统指出后续 payoff 和章节任务影响范围。
7. 第 5 章审核失败，生成 repair ticket，不冻结整本书。
8. 自动修复一次失败后，进入人工修复或带风险继续。
9. 服务重启后先标记为可手动恢复；用户确认恢复后，从最后成功 artifact / step 继续，不重复创建章节或 pipeline job。
10. 用户在创作中枢询问“现在该怎么办”，系统能基于 runtime snapshot 和 workspace analysis 给出建议。
11. 用户在创作中枢要求继续自动导演，系统通过 runtime policy 和 approval gate 执行。
12. 自动导演长时间运行时，前端仍显示当前步骤、最近事件和可理解等待说明。
13. 最近 5 章出现重复推进时，Rolling Window Review 生成修复建议。
14. 没有绑定世界观时，系统能判断是否需要项目级世界规则骨架。
15. 章节任务单能说明本章追读理由、角色驱动力和世界规则使用。

## 10. 质量门

完整交付前必须通过：

- `pnpm --filter @ai-novel/shared build`
- `pnpm --filter @ai-novel/server build`
- `pnpm --filter @ai-novel/client typecheck`
- Runtime / Policy / NodeRunner 单测。
- Workspace Analyzer schema 和 prompt output validation 测试。
- Artifact Ledger dependency / stale / protection 单测。
- Event Projection 单测。
- Chapter execution / repair failure recovery 集成测试。
- Creative Hub runtime tool tests。
- Context Broker resolver tests。
- LangGraph pilot resume / interrupt tests。
- 自动导演新建链路 smoke test。
- 自动导演接管链路 smoke test。
- 手动编辑后继续 smoke test。
- 任务中心和自动导演进度展示 smoke test。

如果改动影响桌面启动或打包，还必须补：

- 桌面启动 smoke test。
- 相关桌面 packaging verification。

## 11. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Runtime 继续只是记录器 | 旧链路仍然割裂 | 旧阶段必须通过 NodeRunner adapter 执行 |
| PolicyEngine 没有硬接入 | 覆盖保护形同虚设 | 所有写入型节点先过 policy decision |
| Ledger 信息不足 | 手动编辑后仍无法判断影响 | 增加 hash、source、dependsOn、stale、protected marker |
| 前端不消费 runtime | 用户仍觉得卡住 | Runtime event 必须投影到任务中心和自动导演面板 |
| 章节执行仍是旧黑箱 | 单章失败仍可能冻结全链 | 章节执行和修复必须成为标准节点 |
| 创作中枢绕过 runtime | 两套控制语义继续分裂 | 中枢工具只能调用 DirectorRuntime 公开 API |
| 过早 LangGraph 化 | 把旧复杂度搬进图 | LangGraph 只做低风险试点，业务状态不进图 |
| Prompt 工作台过早开放编辑 | 破坏结构化输出 | 先只读 catalog / preview，不做自由 override |
| `NovelDirectorService` 继续膨胀 | 后续维护困难 | 每个执行域都必须减少主 service 职责 |

## 12. 交付完成定义

完整改造完成的判断标准：

- 自动导演入口都能从统一 runtime 获取状态。
- 关键写入动作都通过 NodeRunner 和 PolicyEngine。
- 用户能看到当前步骤、等待原因、风险和下一步。
- 用户手写内容被默认保护。
- 单章失败能局部处理，不冻结整本书。
- 手动编辑后系统能判断影响范围和最小修复路径。
- 创作中枢可以解释和控制自动导演，但不绕过 runtime。
- Context Broker 被真实 prompt / step 使用。
- Prompt Catalog 和 Preview 可用于只读排查。
- 低风险 LangGraph 试点验证 interrupt / resume，但不承载业务真相。
- Reader Promise、Chapter Retention、Rolling Window Review、World Skeleton、Character Governance 进入统一产物和节点体系。
- 后续新增创作能力可以通过 Step Module、Context Resolver、PromptAsset 和 Artifact 类型接入，而不是改旧主 service 分支。

一句话：本计划按完整执行交付推进，目标是一次性把自动导演改造成统一、可恢复、可解释、能持续帮助新手完成整本小说的 AI 原生运行时。
