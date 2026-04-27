# 自动导演统一运行时 MVP 落地切片方案

更新日期：2026-04-28

关联总纲：`docs/plans/auto-director-unified-runtime-refactor-plan.md`

## 1. 文档定位

`auto-director-unified-runtime-refactor-plan.md` 是自动导演重构总纲，负责回答“系统最终应该长成什么样”。

本文是 MVP 工程落地切片，负责回答“第一阶段怎么开工，怎么避免一口气重写成另一个巨型系统”。

核心判断：

- 总纲方向保留：自动导演创建、AI 接管、手动修改后继续、失败恢复，都应进入同一个 Director Runtime。
- MVP 不追求一次性完成所有未来模块，而是先做最小可迁移运行时。
- 新模块从第一天就保持图兼容、事件兼容、策略兼容和产物账本兼容。
- LangGraph 可以作为后续编排壳，但不能成为第一阶段的主要目标。

本文中的 TypeScript 结构是概念契约示意，不代表当前阶段立即修改数据库字段或 API 字段。

## 2. 当前项目进度对账

本节基于 2026-04-28 在 `beta` 分支的快速代码对账，避免 MVP 被误解成脱离当前实现的空架构。

当前已经具备的能力：

- 自动导演已有独立路由：`server/src/routes/novelDirector.ts`，包含候选生成、候选修订、候选确认、接管 readiness、接管启动等入口。
- 自动导演主实现集中在 `server/src/services/novel/director/`，其中 `NovelDirectorService.ts` 约 1544 行，仍是主要编排中心。
- 接管链路已经拆出多个文件，例如 `novelDirectorTakeover.ts`、`novelDirectorTakeoverRuntime.ts`、`novelDirectorTakeoverExecution.ts`、`novelDirectorTakeoverContinue.ts`、`novelDirectorTakeoverReset.ts`。
- 自动执行也已有子运行时，例如 `novelDirectorAutoExecutionRuntime.ts`、`novelDirectorAutoExecutionCheckpointRuntime.ts`、`novelDirectorAutoExecutionScopeRuntime.ts`。
- 当前自动导演主链没有直接使用 LangGraph；LangGraph 主要在 `server/src/creativeHub/CreativeHubLangGraph.ts`、`server/src/creativeHub/CreativeHubInterruptLangGraph.ts` 和 `server/src/graphs/*`。
- 当前 workflow task 已有阶段、checkpoint、resume target、seed payload、follow-up notification 等能力，不能简单忽略或重造。
- 项目已有 AgentRuntime 的 `idempotencyKey` 思路、auto director follow-up action log 去重、pipeline job 选择/去重辅助、任务中心和通知投影能力。
- 已有 `NovelArtifactService`，但目前更像 storyline version 的薄包装，不等于本方案所说的 Director Artifact Ledger。
- `shared/types/novelDirector.ts` 已有 run mode、auto execution plan/state、quality repair risk、takeover start phase、lock scope、candidate batch、task seed snapshot 等类型。
- `shared/types/novelWorkflow.ts` 已有 workflow stage、checkpoint、resume target、Book Contract 等关键类型。

因此，MVP 的实现策略应是“贴合并收拢现有能力”，而不是从零搭一个平行系统：

- StepRun 概念应优先评估能否复用或扩展现有 `NovelWorkflowTask`、workflow milestone、AgentStep 或 task detail step，而不是直接新增一套孤立表。
- DirectorEvent 概念应优先对齐现有 auto director follow-up event builder、notification log、task center projection，再补足缺失的事实事件。
- Artifact Ledger MVP 应优先做 wrapper/index，关联旧业务表和现有产物，不替代旧表。
- 幂等性应优先复用项目已有 `idempotencyKey` 经验和 action log 去重模式。
- 并发锁应结合当前 workflow task active status、pipeline job 状态、auto execution state 设计。

结论：这份 MVP 不是对当前进度的否定，而是把当前已经长出来的候选、接管、自动执行、workflow、follow-up、pipeline、prompt asset 等能力收束到统一运行时边界里。

## 3. MVP 总目标

MVP 的目标不是“重写自动导演”，而是让现有链路逐步归口到一套可观察、可恢复、可扩展的运行时边界里。

MVP 完成后应达到：

- 所有入口先进入 Director Runtime 门面。
- 接管已有小说先经过 Workspace Analyzer，而不是走独立接管链。
- 关键阶段至少能写入 StepRun 和 DirectorEvent。
- 关键产物能被 Artifact Ledger 索引。
- 自动、手动、半自动由 Policy Engine 控制，而不是散落在阶段分支。
- 旧阶段可以被 Node Runner 包装成标准节点。
- 单个审核或修复失败不会冻结整条链。
- 后续低风险 LangGraph 试点只替换编排壳，不重写节点能力。

## 4. MVP 明确不做什么

第一阶段不做：

- 不一次性把所有产物纳入 Artifact Ledger。
- 不一次性拆完 `NovelDirectorService`。
- 不一开始就完整 LangGraph 化章节执行、修复和 pipeline job。
- 不一开始就做完整 Capability Registry。
- 不一开始就把世界观治理、角色治理、知识库编排全部主链化。
- 不让 Director Runtime 直接拼 prompt、生成正文或判断复杂创作质量。
- 不在没有稳定事件与幂等机制前做大范围自动重算。

## 5. 最小模块边界

### 5.1 DirectorRuntime

只负责 run 生命周期：

- 创建 run。
- 恢复 run。
- 暂停 run。
- 继续 run。
- 切换 policy。
- 调用 Workspace Analyzer。
- 调用 Node Runner。
- 处理事件和状态同步。

DirectorRuntime 不应该：

- 直接生成小说内容。
- 直接拼 prompt。
- 直接写角色、卷、章节正文。
- 直接判断复杂创作质量。
- 直接拼 UI 文案。
- 直接绕过策略层覆盖用户内容。

一旦 DirectorRuntime 开始承载 prompt、章节上下文、正文写入和 UI 解释，它就会变成第二个 `NovelDirectorService`。

### 5.2 WorkspaceAnalyzer

分成两层：

- Workspace Inventory：确定性扫描，负责资产存在性、版本、任务、运行状态、用户编辑记录。
- Workspace Interpretation：AI 结构化分析，负责生产阶段、风险、推荐动作、改动影响和最小修复路径。

确定性扫描适合判断：

- 哪些资产存在。
- 哪些章节已有正文。
- 哪个产物版本最新。
- 产物依赖的上游版本是否变化。
- 用户是否编辑过某章。
- 是否有 active run。
- 是否允许覆盖用户手写内容。

AI 结构化分析适合判断：

- 主角动机变化是否影响后续卷目标。
- 用户改写第 3 章是否破坏前 30 章承诺。
- 世界观设定是否足以支撑当前冲突。
- 最近 5 章是否节奏重复。
- 某个角色是否工具人化。
- 当前小说下一步最自然该补什么。

概念契约：

```ts
type WorkspaceAnalysis = {
  inventory: DeterministicInventory;
  interpretation: AiWorkspaceInterpretation;
  recommendation: DirectorNextAction;
  confidence: number;
  evidenceRefs: string[];
};
```

### 5.3 ArtifactLedger MVP

第一版只做索引、版本、依赖、来源和健康状态，不替代所有业务表。

MVP 优先纳入：

- `book_contract`
- `story_macro`
- `character_cast`
- `volume_strategy`
- `chapter_task_sheet`
- `chapter_draft`
- `audit_report`
- `repair_ticket`

暂缓纳入但为后续保留：

- `reader_promise`
- `character_governance_state`
- `world_skeleton`
- `source_knowledge_pack`
- `chapter_retention_contract`
- `continuity_state`
- `rolling_window_review`

第一版至少回答四个问题：

1. 这个产物是什么类型？
2. 这个产物当前可信版本是哪一个？
3. 它依赖哪些上游产物？
4. 它被谁生成或修改过？

概念契约：

```ts
type DirectorArtifact = {
  id: string;
  novelId: string;
  runId?: string;

  artifactType: DirectorArtifactType;
  targetType: "novel" | "volume" | "chapter" | "global";
  targetId?: string;

  version: number;
  status: "draft" | "active" | "superseded" | "stale" | "rejected";
  source: "ai_generated" | "user_edited" | "auto_repaired" | "imported" | "backfilled";

  dependsOn: Array<{
    artifactId: string;
    version: number;
  }>;

  contentRef: {
    table: string;
    id: string;
  };

  contentHash?: string;
  schemaVersion: string;
  promptAssetKey?: string;
  promptVersion?: string;
  modelRoute?: string;
};
```

关键原则：不要把所有产物正文都塞进 Ledger。`contentRef` 指向旧业务表或专用内容表，Ledger 负责索引和依赖。

### 5.4 PolicyEngine V1

第一版控制策略只保留四种：

```ts
type DirectorPolicyMode =
  | "suggest_only"
  | "run_next_step"
  | "run_until_gate"
  | "auto_safe_scope";
```

策略决策关注：

```ts
type PolicyDecision = {
  canRun: boolean;
  requiresApproval: boolean;
  reason: string;

  mayOverwriteUserContent: boolean;
  affectedArtifacts: string[];

  autoRetryBudget: number;
  onQualityFailure:
    | "repair_once"
    | "pause_for_manual"
    | "continue_with_risk"
    | "block_scope";
};
```

硬规则：

- 覆盖用户手写内容必须经过 Policy Engine。
- 自动修复默认最多一次。
- 质量失败必须带 `affectedScope`。
- 非破坏性质量问题默认不全局阻断。
- 高风险问题只阻断受影响范围。

### 5.5 NodeRunner

NodeRunner 负责执行一个节点，但不把每个节点的业务逻辑写进自己内部。

节点契约从 Phase 2 就要图兼容：

```ts
type DirectorNodeContract = {
  nodeKey: string;
  label: string;

  reads: DirectorArtifactType[];
  writes: DirectorArtifactType[];

  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;

  run(input: DirectorNodeInput): Promise<DirectorNodeResult>;
};
```

节点结果：

```ts
type DirectorNodeResult = {
  status:
    | "completed"
    | "needs_approval"
    | "repairable"
    | "blocked_scope"
    | "failed";

  producedArtifacts: DirectorArtifactRef[];
  events: DirectorEvent[];
  suggestedNextAction?: DirectorNextAction;
};
```

这样即使第一阶段不用 LangGraph，后续图化也只是替换编排壳，而不是重写节点。

## 6. 运行可靠性约束

### 6.1 幂等性

任何会写数据库的节点都必须有 `idempotencyKey`。

推荐规则：

```ts
const idempotencyKey = `${runId}:${nodeKey}:${targetType}:${targetId ?? "global"}`;
```

执行前先查 StepRun、Artifact Ledger 或 operation log：

- 如果同一个 key 已经成功完成，直接复用结果。
- 如果同一个 key 正在执行，不重复启动。
- 如果同一个 key 失败，按 retry budget 和 PolicyDecision 决定是否重试。

这能避免服务重启、用户重复点击继续、后台恢复、LangGraph resume 造成重复创建角色、卷、章节或 pipeline job。

### 6.2 并发锁

MVP 至少需要这些锁语义：

- novel-level active run lock。
- artifact-level write lock。
- chapter pipeline lock。
- pause / resume / cancel 状态锁。

目标是防止同一本小说被多个入口同时写同一批资产，例如创作中枢、任务中心和后台恢复同时触发继续。

### 6.3 成本预算

AI-first 不等于每一步无限调用模型。

建议加入 BudgetPolicy：

```ts
type DirectorBudgetPolicy = {
  maxModelCallsPerRun?: number;
  maxTokensPerStep?: number;
  maxAutoRepairAttempts: 1;
  allowExpensiveReview: boolean;
  modelTier: "cheap_fast" | "balanced" | "high_quality";
};
```

MVP 阶段默认：

- Workspace Analyzer 可以调用 AI，但应先使用确定性 Inventory 缩小上下文。
- 自动修复最多一次。
- Rolling Window Review 暂不进入基础运行时，后续作为能力模块试点。
- 高成本审查需要 policy 或用户授权。

### 6.4 事件与投影

DirectorEvent 是事实记录，不是 UI 文案、WorkflowTask 状态或 Artifact Ledger。

示例事件：

```ts
type DirectorEvent =
  | { type: "run_started"; runId: string }
  | { type: "node_started"; runId: string; nodeKey: string }
  | { type: "artifact_produced"; artifactId: string; artifactType: string }
  | { type: "approval_required"; approvalType: string; affectedScope: string }
  | { type: "quality_issue_found"; issueId: string; severity: string; affectedScope: string };
```

投影层负责把事件转换给不同界面：

- DirectorEvent -> TaskCenterProjection。
- DirectorEvent -> FrontendProgressProjection。
- DirectorEvent -> CreativeHubMessageProjection。

节点不直接拼用户可见文案，避免后端流程、任务中心和前端解释继续互相缠绕。

## 7. MVP 迁移路线

### Phase 0：运行可见性，不改主链

目标：先让当前系统可观察，便于后续对比旧链路和新链路行为。

交付：

- StepRun 账本草案。
- DirectorEvent 事件记录草案。
- 自动导演长阶段 heartbeat。
- 候选阶段接入 tracked step。
- 前端任务中心优先读事件投影草案，而不是继续猜状态。

验收：

- 自动导演进度不会长时间停在无解释状态。
- 服务端能看到每个主要步骤开始、完成、失败、恢复。
- 不改变当前主链业务结果。

### Phase 1：Director Runtime 门面

目标：所有入口先进入统一门面，再转调旧实现。

入口包括：

- 新建小说。
- 接管已有小说。
- 继续任务。
- 失败恢复。
- 手动修改后继续。

交付：

- DirectorRuntime facade。
- run 生命周期状态。
- 旧 API 兼容。
- 运行状态快照。

验收：

- 旧功能仍能跑。
- 新入口和旧入口都能归档到 run。
- `NovelDirectorService` 开始退化为兼容旧 API 的 facade，而不是继续扩张。

### Phase 2：Workspace Analyzer V1

目标：接管、手动继续和失败恢复先进入工作区分析。

交付：

- Deterministic Inventory。
- AI Workspace Interpretation。
- Recommended Next Action。
- 接管入口调用 Analyzer，再映射到旧链路继续动作。

验收：

- 已有小说启用 AI 接管时，系统先输出当前状态和推荐下一步。
- 用户手动修改后，系统能判断是否直接继续、复核、局部重算或人工确认。
- 接管链路不再独自猜测主链状态。

### Phase 3：Artifact Ledger MVP

目标：先做 ledger wrapper，不一次性迁移旧表。

接入方式：

```text
旧服务生成产物
  ↓
原样写旧业务表
  ↓
额外写 DirectorArtifact 记录
```

优先接入：

- `book_contract`
- `story_macro`
- `character_cast`
- `volume_strategy`
- `chapter_task_sheet`
- `chapter_draft`
- `audit_report`
- `repair_ticket`

交付：

- DirectorArtifact wrapper。
- imported / backfilled artifact 记录。
- trustLevel 或 status 的最小标记。
- dependsOn 的最小记录。

验收：

- 新生成产物能写入旧业务表和 Ledger。
- 已有小说能 backfill 出基础 artifact 索引。
- Workspace Analyzer 能读取 Ledger 判断可信产物和缺失产物。

### Phase 4：Policy Engine V1

目标：把自动、手动、半自动、修复、覆盖保护从各阶段分支中抽出来。

交付：

- `suggest_only`
- `run_next_step`
- `run_until_gate`
- `auto_safe_scope`
- PolicyDecision。
- QualityGateResult。
- 覆盖保护。
- 一次自动修复策略。

验收：

- 覆盖用户内容必须经过 Policy Engine。
- 单个章节审核失败只生成 repair_ticket 或 blocked_scope，不冻结整条链。
- 自动修复失败后进入人工修复或带风险继续。

### Phase 5：Node Runner 包旧阶段

目标：减少 `NovelDirectorService` 的主编排负担。

先包装旧阶段，不急着细拆：

- `candidate_generation_node`
- `book_contract_node`
- `story_macro_node`
- `character_setup_node`
- `volume_strategy_node`
- `structured_outline_node`
- `chapter_execution_node`
- `quality_repair_node`

每个节点统一声明：

- 读哪些 artifact。
- 写哪些 artifact。
- 是否需要审批。
- 是否可能覆盖用户内容。
- 如何记录事件。
- 如何记录 StepRun。
- 如何失败恢复。

验收：

- 旧阶段可以通过 Node Runner 执行。
- 新旧入口都能复用同一节点包装。
- 节点执行结果能写 StepRun、DirectorEvent 和 Artifact Ledger。

### Phase 6：低风险 LangGraph 试点

目标：验证图编排，而不是全面迁移主链。

推荐试点：

```text
Workspace Analyzer -> 推荐下一步 -> run_next_step -> gate
```

或：

```text
候选方向生成 -> 标题包 -> candidate_selection_required interrupt
```

候选阶段适合作为试点，因为：

- 写入少。
- 人工确认点明确。
- 失败影响小。
- 可以验证 interrupt / resume。
- 可以验证 stream updates。
- 可以验证事件投影。

验收：

- LangGraph 只负责编排、暂停、恢复和追踪。
- 业务状态仍来自 DirectorRuntime、ArtifactLedger 和 PolicyEngine。
- 不把章节执行和 pipeline job 一次性搬进图。

### Phase 7：创作质量模块逐步主链化

目标：在统一运行时稳定后，再增强网文创作质量。

建议顺序：

1. Source and Knowledge Pack。
2. World Skeleton / World Rules。
3. Character Governance State。
4. Chapter Retention Contract。
5. Rolling Window Review。

优先级最高的是 Chapter Retention Contract，因为它直接改善章节留存。

## 8. 三张迁移表

### 8.1 产物类型表

| Artifact Type | 作用 | 上游依赖 | 下游影响 | 自动覆盖策略 |
| --- | --- | --- | --- | --- |
| `book_contract` | 固化书级方向、读者承诺、题材边界 | candidate / user seed | story macro、角色、卷规划、章节任务 | 高风险，需要确认 |
| `story_macro` | 固化主线、冲突引擎、长线推进 | book contract | 角色、分卷、章节计划 | 高风险，需要确认 |
| `character_cast` | 核心角色阵容 | book contract / story macro | 角色治理、卷规划、章节任务 | 中高风险 |
| `volume_strategy` | 分卷目标和升级路线 | book contract / story macro / characters | chapter plan | 中风险 |
| `chapter_task_sheet` | 章节执行合同 | volume strategy / characters / world rules | chapter draft | 中风险 |
| `chapter_draft` | 正文草稿 | task sheet / context | audit / continuity | 用户编辑后高保护 |
| `audit_report` | 质量审核结果 | chapter draft / recent context | repair ticket | 可自动生成 |
| `repair_ticket` | 修复任务 | audit report | repair action | 可自动生成 |

### 8.2 节点契约表

| Node | Reads | Writes | Gate | 可重试 | 是否可能覆盖用户内容 |
| --- | --- | --- | --- | --- | --- |
| `workspace_analyze` | novel assets | analysis snapshot | no | yes | no |
| `candidate_generation` | user seed / source pack | candidate batch | yes | yes | no |
| `book_contract_generate` | seed / candidate | book_contract | yes | yes | no |
| `story_macro_generate` | book_contract | story_macro | optional | yes | maybe |
| `character_setup` | book_contract / story_macro | character_cast | optional | yes | maybe |
| `volume_strategy_generate` | book_contract / story_macro / characters | volume_strategy | optional | yes | maybe |
| `chapter_task_sheet_generate` | volume_strategy / characters | chapter_task_sheet | optional | yes | maybe |
| `chapter_execution` | chapter_task_sheet / context | chapter_draft | optional | limited | yes |
| `quality_repair` | chapter_draft / audit_report | repair_ticket / revised draft | optional | once | yes |
| `rolling_window_review` | recent drafts | audit_report / repair_ticket | no | yes | no |

### 8.3 旧模块迁移表

| 旧模块 | 新位置 | 迁移方式 |
| --- | --- | --- |
| `NovelDirectorService` | facade + DirectorRuntime caller | 逐步瘦身 |
| Candidate Stage | Candidate nodes | 包装后迁移 |
| Story Macro Phase | Planning nodes | 先包旧函数 |
| Pipeline Phases | Character / Volume nodes | 分阶段拆分 |
| Structured Outline Phase | Outline subgraph / chapter planning nodes | 重点拆节点 |
| Auto Execution Runtime | ChapterExecution adapter | 保留为子执行器 |
| Takeover Runtime | WorkspaceAnalyzer + RecoveryPolicy | 并入统一入口 |
| Workflow Service | Task projection + legacy compatibility | 不再承载业务真相 |

## 9. 网文质量模块的收敛优先级

总纲中的创作质量增强方向是对的，但 MVP 后第一批只建议做三个。

### 9.1 Reader Promise Ledger

把读者承诺变成可追踪产物：

```text
书级承诺
  ↓
卷级承诺
  ↓
节奏段承诺
  ↓
章节承诺
  ↓
审核承诺兑现度
```

这能提升长篇一致性，也能让自动导演知道每一章为什么值得写。

### 9.2 Chapter Retention Contract

章节任务单应升级为留存合同。

概念契约：

```ts
type ChapterRetentionContract = {
  chapterId: string;

  chapterGoal: string;
  readerPromiseRefs: string[];

  newInformation: string[];
  visibleChange: string;
  smallPayoff: string;
  unresolvedPressure: string;

  hookType:
    | "threat"
    | "reveal"
    | "choice"
    | "misunderstanding"
    | "reward_delayed"
    | "relationship_shift"
    | "new_goal";

  endingHook: string;

  characterDrivers: Array<{
    characterId: string;
    desire: string;
    pressure: string;
    choiceOrAction: string;
    stateChange: string;
  }>;

  worldRuleUsed?: {
    ruleId: string;
    dramaticFunction: string;
  };
};
```

它比单纯“章节大纲”更适合网文生产，因为它直接约束读者获得感、变化、压力和章末追读理由。

### 9.3 Rolling Window Review

第一版只做最近 5 章：

- 最近 5 章是否同质。
- 主角目标有没有推进。
- 读者承诺有没有兑现或加码。
- 结尾钩子是否重复。
- 角色关系是否停滞。
- 世界规则是否参与冲突。

这个模块适合作为 Capability Registry 的第一个新增审核模块。

## 10. 创作中枢接入边界

创作中枢应调用 Director Runtime 的公开动作：

- `analyze_director_workspace`
- `get_director_run_status`
- `explain_director_next_action`
- `run_director_next_step`
- `run_director_until_gate`
- `switch_director_policy`
- `evaluate_manual_edit_impact`

不应直接调用：

- `generateVolumeStrategy()`
- `runStructuredOutlinePhase()`
- `continueTakeoverExecution()`
- `repairChapterTitle()`

边界：

```text
创作中枢 = 用户对话入口 + 审批展示 + 工具调用协调
自动导演 = 长运行小说生产系统
```

两个系统都可以使用 LangGraph，但不应揉成一个超级图。

## 11. MVP 验收场景

第一批至少覆盖以下场景：

1. 一句话灵感新建小说，生成候选并停在候选确认。
2. 确认候选后生成 Book Contract、角色、卷规划、前 10 章任务单。
3. 已有小说有角色和前 8 章正文，接管后推荐补第 9-20 章任务单。
4. 用户修改主角动机，系统判断角色治理和后续章纲需要复核。
5. 用户只润色第 3 章正文，系统只更新连续性记忆，不重做宏观规划。
6. 第 5 章审核失败，生成 repair_ticket，不冻结整本书。
7. 自动修复一次失败后，进入人工修复或带风险继续选择。
8. 服务重启后，从最后成功 artifact / step 恢复，不重复创建章节。

## 12. 第一轮开工建议

第一轮最建议只做四件事：

1. 建 StepRun / DirectorEvent 的最小可见性。
2. 建 DirectorRuntime facade，让所有入口先归口。
3. 建 Workspace Analyzer V1，先把接管和手动继续统一成工作区分析。
4. 建 Artifact Ledger wrapper，只给 6-8 个核心产物补索引，不迁移旧业务表。

这四件事做完，系统还没有完全重构，但已经从“多条链路各自演化”变成“同一运行时逐步接管旧能力”。这时再做 Policy Engine、Node Runner、低风险 LangGraph 试点，风险会小很多。

## 13. 2026-04-28 MVP 实现进度

本轮实现已把 MVP 的底座接入现有链路，仍以旧阶段为执行主体，避免一次性重写自动导演：

- 新增共享运行时契约：`DirectorRuntimeSnapshot`、`DirectorStepRun`、`DirectorEvent`、`DirectorArtifactRef`、`DirectorWorkspaceAnalysis`、`DirectorPolicyDecision`。
- 新增 `DirectorRuntimeService` 门面，封装 run 初始化、状态快照、工作区分析、策略切换、节点记录和 NodeRunner。
- 新增 `DirectorWorkspaceAnalyzer`，先做确定性 Inventory，再通过注册 PromptAsset 进行 AI 结构化解释。
- 新增 Artifact Ledger wrapper：暂存于 workflow task 的 `directorRuntime.artifacts`，通过 `contentRef` 指向旧业务表，不迁移数据表。
- 新增 Policy Engine V1：支持 `suggest_only`、`run_next_step`、`run_until_gate`、`auto_safe_scope`，并把自动修复预算固定为一次。
- 自动导演候选、确认、接管、继续和主 pipeline 阶段已经开始写入 runtime step / event / workspace analysis。
- 新增后端路由与前端 API：工作区分析、运行时快照、策略切换、运行时继续。
- 新增策略单测，覆盖只建议模式、用户内容保护和一次自动修复预算。

仍未在本轮直接完成的内容：

- 未新增独立数据库表；Artifact Ledger 先作为旧 workflow seed payload 的 wrapper 索引。
- 未把章节执行、质量修复和 pipeline job 完整拆成标准 NodeContract，只在运行时层记录关键入口和交接事件。
- 未把 LangGraph 接到自动导演主链；当前仍保持“运行时先统一，图编排后替换”的路线。
- 未把世界观生成、角色治理、拆书知识库编排纳入主链执行，只在 Workspace Inventory 中保留是否已绑定的判断基础。

下一轮更适合做：

1. 把章节执行与质量修复封装成标准节点，保证失败后只阻断受影响范围。
2. 把 `reader_promise`、`chapter_retention_contract`、`character_governance_state` 升级成真实产物索引。
3. 在创作中枢中调用 runtime API，而不是直接碰旧自动导演阶段函数。
4. 选候选确认或 workspace analyze -> run next step 做低风险 LangGraph 试点。

## 14. 一句话结论

总纲是方向，MVP 是切片。先做可见性、统一入口、工作区分析、产物索引和策略边界，再包装旧节点，最后用低风险 LangGraph 试点验证编排。不要一开始就把所有创作质量模块和完整图编排同时上线。
