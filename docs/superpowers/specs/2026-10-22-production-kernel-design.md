# 正文生产内核设计（Production Kernel）

状态：设计稿，待用户确认。
分支：`refactor/production-kernel`（基于 `main` 的 `7f06e54b`）。
关联：`docs/superpowers/specs/2026-09-30-director-rebuild-design.md`（V2 导演）、`docs/wiki/workflows/chapter-production-chain.md`（现有章节生产规则）、`docs/wiki/workflows/director-version-isolation.md`（V1/V2 隔离）。

## 1. 背景

### 1.1 V2 解决了什么、没解决什么

V2 导演重做了"组织生产"这一层：做什么、何时暂停、如何恢复、如何展示。它没有触及"生产本身"：正文写作、审校、修复、修后核对、状态回灌、编辑保护。

V2 的正文步骤 `modules/director/steps/production/chapterBatch.ts` 只负责启动旧的正文流水线作业，然后等待它结束。真正的生产逻辑仍在旧代码中：

- `services/novel/runtime/`：约 9,600 行。
- `services/novel/production/`：约 2,650 行。
- `services/novel/state/`：约 2,200 行。
- 另有 `fact/`、`dynamics/`、`quality/`、`chapterEditor/` 等目录。

### 1.2 现状痛点（有证据）

| 痛点 | 证据 |
| --- | --- |
| 单章生产的判断是一个大过程函数 | `runtime/chapterRuntimePipeline.ts` 的 `runPipelineChapterWithRuntime` 约 320 行。修复次数、候选选择、修后核对、风格泄漏、正文退化、暂停与质量债的判断交织在同一个循环里，没有可单独测试的决策点 |
| 共用代码被 V2 分支污染 | 旧生产代码里有 14 个文件、96 处 V2 专属判断，例如 `artifactSyncPolicy === "director_v2"`。V1 已冻结，却仍要背着 V2 的分支 |
| 短篇另起一套 | `modules/novel/short-story/application/ShortStoryProductionService.ts`（460 行）有自己的审校、单次修复、质量债、编辑保护和连续性摘要，与长篇没有共享任何代码 |
| 状态事实分散 | 事实与状态分布在约 20 张表中：`ConsistencyFact`、`NovelFactEntry`、`StoryStateSnapshot`、`CharacterTimeline`、`PayoffLedgerItem`、`CharacterResourceLedgerItem`、`StateChangeProposal`、`CanonicalStateVersion`、`TimelineHook`、`AuditReport` 等。每类能力自己决定读哪张表 |
| 规则靠文档维持 | `chapter-production-chain.md` 积累了约 100 条"必须 / 不得"规则。多数规则只能靠人记住，代码结构本身并不阻止违反 |
| 大文件 | `ChapterArtifactDeltaService.ts` 1,235 行，`NovelPipelineExecutor.ts` 1,095 行，`ChapterArtifactBackgroundSyncService.ts` 860 行 |

### 1.3 已定决策（来自用户）

- V1 冻结，只修 bug；默认入口是 V2。
- 新内核归新生产线所有，**V1 不迁移到新内核**，V1 继续使用旧生产代码直到退役。
- 内核是后续所有正文产出的核心，需要优先考虑灵活性。
- 短篇作为 V2 的一份计划，调用共同内核。
- V1 界面主题化放在 V2 完善之后，不在本设计范围内。

## 2. 目标与非目标

### 目标

1. 用一个与引擎无关的内核，统一提供七项共同能力：事实一致、人物状态、信息来源、因果与承诺兑现、审校、修后核对、编辑保护。
2. 篇幅差异只通过"生产配置"表达，不形成第二套生产实现。短篇侧重全篇预算、集中冲突、及时收束；长篇侧重跨章跨卷状态、长期伏笔、阶段推进。
3. 单个正文单元的生产过程变成显式状态机，配一个纯函数决策器。现有规则落为可测试的决策表，不再藏在过程代码里。
4. V2 长篇、短篇、V2 书的手动写章与修章，都走同一个内核。
5. V2 全部切换后，删除旧生产代码中的 V2 分支，让旧代码回到"只服务 V1"的状态。

### 非目标

- 不合并现有状态表。内核通过端口读写现有表；表结构整合是独立决策，涉及数据风险，不在本设计内。
- 不重写已注册的 Prompt。阶段适配器先复用现有 PromptAsset；需要改 Prompt 时按 Prompt Governance 新增版本。
- 不改变 V1 的任何行为。
- 不新增状态展示面。进度和结论通过调用方（V2 Run）投影到现有导演台。

## 3. 核心概念

### 3.1 正文单元（Unit）

内核处理的最小对象，与篇幅无关：

```ts
interface UnitRef {
  novelId: string;
  unitId: string;            // 长篇是 chapterId；短篇是片段 id，或"全篇"虚拟单元
  kind: "chapter" | "short_segment";
  order: number;
}
```

### 3.2 作品范围（Work Scope）

一组单元，用于跨单元能力：

- 短篇的全篇审校与修复；
- 将来长篇的卷级回顾。

内核同时提供"单元级"和"作品级"两种操作，作品级操作的结果会落回各个单元。

### 3.3 生产配置（Production Profile）

篇幅差异的唯一表达方式。配置是数据，随调用方的计划快照一起冻结：

```ts
interface ProductionProfile {
  id: string;                       // 例："long_chapter@1"、"short_story@1"
  stages: StageId[];                // 本配置启用的单元阶段（见第 4 节）
  workStages: WorkStageId[];        // 作品级阶段，短篇用"全篇审校"和"全篇修复"
  budget: { unitTokens?: number; workTokens?: number; unitWords?: [number, number] };
  repair: { maxAttempts: 0 | 1; mode: "light_repair" | "heavy_repair" | "detect_only" };
  context: ContextPolicyId;         // 长篇：跨章跨卷状态加长期伏笔；短篇：全篇计划加前段连续性
  reconcile: "per_unit" | "per_work" | "none";
  capabilities: CapabilityId[];     // 启用的共同能力，例如 "promise_fulfillment"
}
```

### 3.4 故事状态（Story State）

七项能力共用的事实面，以端口形式提供：

- **读取**：事实、人物硬事实与当前状态、信息边界（谁知道什么、从哪里得知）、承诺与伏笔窗口、资源。
- **写入**：只能通过"状态变更集"（StateDelta）提交，并且必须带来源单元、正文内容哈希和幂等键。

端口背后是现有的表，内核不感知具体有哪些表。

## 4. 单元生产状态机

每个单元的生产过程是显式阶段序列。启用哪些阶段由配置决定：

```text
prepare ──> draft ──> accept ──┬─> commit ──> reconcile ──> done
   │                           │
   │                           └─> repair ──> verify ──> select ──> commit ...
   └─(准备失败)─> failed
```

| 阶段 | 职责 | 对应现有实现（适配器复用） |
| --- | --- | --- |
| `prepare` | 准备执行合同，组装上下文；上下文组装只读 | `ChapterExecutionPreparationService`、`GenerationContextAssembler` |
| `draft` | 整章或整段一次生成；空稿重试由阶段内部负责 | `ChapterWritingGraph` 与 writer |
| `accept` | 一次结构化审校，输出问题、缺失义务、可修复性和事实证据；按"正文哈希加输入指纹"缓存 | `ChapterAcceptanceAssessmentService`、`ChapterQualityGateService` |
| `repair` | 生成候选稿，**候选不是正史** | `repair/chapterRepairRuntime` |
| `verify` | 候选稿复审，加修后事实保持核对 | 现有的 `repairVerification.factPreservation` |
| `select` | 原稿和候选稿二选一，只用已有的结构化结论 | `selection/ChapterRepairCandidateSelection` |
| `commit` | 带版本围栏写入正文和生命周期状态；用户编辑过的内容不得覆盖 | `ChapterLifecycleService`、`ChapterTimelineFinalizationService` |
| `reconcile` | 抽取状态变更集并分消费者应用；每个消费者有独立检查点，写入前再次校验正文版本 | `ChapterArtifactDeltaService` 及其消费者 |

### 4.1 决策器（纯函数）

```ts
decideNext(input: {
  profile: ProductionProfile;
  policy: IssuePolicySnapshot;   // 调用方冻结的问题策略
  unit: UnitProgress;            // 已完成阶段、已用修复次数、原稿评估、候选评估
  lastVerdict?: AcceptanceVerdict;
}): UnitAction
// UnitAction = run_stage | select_original | select_candidate | record_debt
//            | pause_for_manual | stop_for_replan | fail | done
```

`runPipelineChapterWithRuntime` 里现在散落的判断，全部变成决策器里的具名规则，每条规则配测试。部分例子：

- 修复最多一次；技术失败不升级为整章重写。
- 只有"审校系统不可用"这类风险时，不进入修复。
- 候选稿新增高或严重问题、新增未兑现义务、事实核对未通过时，保留原稿。
- 正文已可用时，局部质量问题记为质量债并继续。只有结构化的 `stop_for_replan` 或 `replan_required`、问题策略明确要求暂停、没有可用正文、数据完整性失败，才能停止。
- 修复后正文出现新的严重表达问题时，保留原稿。

### 4.2 执行器

执行器只做三件事：

1. 调用 `decideNext` 得到动作；
2. 执行对应阶段的适配器；
3. 把阶段结果写回单元进度。

崩溃恢复就是重新调用 `decideNext`：已完成阶段的结果已经持久化，按正文哈希可以复用。执行器不包含任何业务判断。

## 5. 与调用方的契约

内核**不认识** V1、V2、Run、Task、Seed。调用方注入以下内容：

```ts
interface UnitRequest {
  unit: UnitRef;
  profile: ProductionProfile;
  policy: IssuePolicySnapshot;
  model: ModelSelection;
  fence: () => Promise<void>;            // 所有权与取消检查；不通过时抛错，内核立即停止写入
  budget: BudgetPort;                    // 预算检查与用量记账，由调用方实现
  observe?: (event: UnitEvent) => void;  // 进度事件，由调用方投影到自己的展示面
}

interface UnitOutcome {
  unit: UnitRef;
  finalContentHash: string | null;
  selected: "original" | "candidate" | null;
  verdict: AcceptanceVerdict | null;
  debts: QualityDebt[];
  stopSignal?: StopSignal;               // 与 V2 的 StopSignal 语义一致
  reconcile: "completed" | "degraded" | "pending" | "failed";
}
```

调用方有三类：

| 调用方 | 适配位置 | 职责 |
| --- | --- | --- |
| V2 长篇 | `app/director` 的生产组装 | 把 Run 的所有权围栏、预算、问题策略注入内核，把单元结果映射为 V2 产物与质量债 |
| 短篇 | V2 的短篇计划步骤 | 片段逐个走单元级操作，结束后走作品级审校与修复 |
| V2 书的手动入口 | 章节编辑器、手动写章与修章路由 | 先按 `Novel.directorVersion` 路由：V2 书进内核，V1 书仍走旧链路 |

## 6. 七项能力在内核中的归属

| 能力 | 内核位置 | 生效方式 |
| --- | --- | --- |
| 事实一致 | 故事状态端口的事实读取，加 `accept` 阶段证据，加 `verify` 阶段事实保持核对 | 写作前作为必需上下文注入；写作后审校；修后核对 |
| 人物状态 | 故事状态端口的人物硬事实与当前状态 | 必需上下文不能被裁掉；`reconcile` 时更新 |
| 信息来源 | 故事状态端口的信息边界 | `reconcile` 时记录谁知道什么；写作和审校时约束越界 |
| 因果与承诺兑现 | 单元义务合同，加承诺与伏笔窗口 | `accept` 输出缺失义务；长期承诺按窗口跟进，不单独触发停止 |
| 审校 | `accept` 阶段 | 每个单元一次结构化审校；作品级审校由配置启用 |
| 修后核对 | `verify` 和 `select` 阶段 | 候选稿必须复审并核对事实，才可能被采用 |
| 编辑保护 | `commit` 和 `reconcile` 阶段的版本围栏 | 用户编辑后，旧结果一律不得落库；编辑后的内容重新走审校与状态回灌 |

## 7. 模块布局

```text
server/src/modules/production/
  domain/          纯类型、配置结构、状态机、决策器、候选选择；不得有任何 IO
  application/     执行器、单元与作品用例、端口定义
  infrastructure/  适配器：把现有 runtime、state、prompt 服务接到端口上
  profiles/        long_chapter、short_story 配置（数据）
  index.ts         唯一对外出口
```

依赖规则：

- 依赖方向固定为 `domain ← application ← infrastructure`。
- 外部只能从 `modules/production/index.ts` 导入。
- 内核不得导入 `modules/director`、`services/novel/director`、`modules/novel/director-routing`、`services/novel/workflow`。
- 适配器可以调用现有的底层服务，但**不得为内核修改它们的行为**。需要不同行为时，把实现复制进内核再改，以保证 V1 冻结。旧底层服务的 bug 修复照常进行，内核通过适配器自动受益。

## 8. 迁移策略：绞杀式替换，不一次性重写

1. 内核先替换"编排"，也就是那个 320 行的过程函数和批量执行粘合层。阶段的具体能力先通过适配器复用旧的底层服务。
2. 先接短篇。短篇不依赖 V2 Run，规模小，又是当前痛点。它能证明内核确实与引擎无关。
3. 再接 V2 长篇正文：`chapterBatch` 从"等待旧流水线作业"改为"逐章调用内核"。
4. 然后让短篇进入 V2 计划，再把 V2 书的手动入口接入内核。
5. V2 全部切换后，删除旧代码中的 96 处 V2 分支。
6. 达到行为等价后，才开始能力增强，例如更强的承诺兑现核对、信息来源约束，或者把某些阶段换成更强的模型或 Agent。

每一步都有开关，并且都能独立回退。

## 9. 灵活性设计

- **配置即数据**：新篇幅、新平台、新写法，以新增配置的方式加入。
- **阶段是可替换的端口**：例如 `draft` 将来可以换成分场景写作或 Agent 写作，决策器和执行器不用改。
- **决策权**：语义判断一律来自结构化 AI 输出；决策器只对已结构化的结论做确定性后处理，这与 AI-First 规则一致。
- **作品级操作**：短篇的全篇审校是第一个用例，将来长篇的卷级回顾复用同一能力。

## 10. 必须继承的现有规则

完整清单由盘点计划产出。以下规则在设计阶段就已确定必须继承：

- 正文与生命周期字段只能由唯一写入口落库，版本围栏不能被绕过。
- 候选稿在被选中之前，不得写入正文、时间线、事实或终态事件。
- 审校缓存只保存成功结果；"审校不可用"不能被缓存。
- 调用模型的后置抽取必须先抢占检查点。同一正文哈希、同一产物类型、同一模式下，不得重复调用模型。
- 消费者写入前必须再次确认正文版本，版本比对使用原始正文而不是归一化后的文本。
- 问题策略由调用方在任务开始时冻结，运行中修改策略不影响已开始的任务。
- 质量债不阻塞全链路（`AGENTS.md` 中的自动导演质量门规则）。

## 11. 验收标准

1. 决策器的规则测试覆盖盘点清单中的每一条"必须 / 不得"规则，并通过变异检查。
2. 对同一组章节夹具，内核与旧流水线的阶段决策一致。确有差异的，必须列入差异清单，并由用户确认是有意改进。
3. 短篇和 V2 长篇的端到端测试使用临时 SQLite，不连接开发库。
4. 切换期间，V1 所属代码的差异只允许是"删除 V2 分支"。
5. 内核单个文件不超过 1,200 行；领域层没有 IO。

## 12. 风险

| 风险 | 应对 |
| --- | --- |
| 适配器复用旧底层服务时，被其中的 V2 分支反向影响 | 适配器显式传入参数，不走 V2 分支；第 5 步删除这些分支 |
| 与 V1 共用业务表，写入语义不一致 | `commit` 阶段经由 `ChapterLifecycleService` 写入，状态值语义与 V1 相同；同一本书同一时刻只属于一个版本（已有 epoch 围栏） |
| 短篇正在进行中的修改（`codex/short-story-revision-recovery`）与迁移冲突 | 短篇接入放在该分支合入之后，接入前重新盘点短篇的规则 |
| 行为等价验证成本高 | 先用夹具做决策等价验证，不做模型输出等价验证 |

## 13. 开放问题（盘点后决定）

1. 短篇"全篇"是作为一个虚拟单元，还是作为作品级操作落回各个片段。设计倾向于后者。
2. 故事状态端口第一版覆盖哪些表，如何处理重复的事实来源，例如 `ConsistencyFact` 与 `NovelFactEntry`。
3. 单元进度存放在哪里：新建一张 `ProductionUnitRun` 表，还是复用 `GenerationJob` 的载荷。设计倾向于新表，结构上与 V2 事实层同构。
4. V2 书的手动写章与修章，是否全部进入内核，还是只进入"写章"和"修章"两个入口。
