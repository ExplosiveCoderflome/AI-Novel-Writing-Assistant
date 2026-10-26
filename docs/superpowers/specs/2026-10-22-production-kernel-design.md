# 长篇正文生产内核设计（Production Kernel）

状态：设计稿，方向已与用户确认，细节待盘点后定稿。
分支：`refactor/production-kernel`（基于 `main` 的 `7f06e54b`）。
关联文档：

- `docs/superpowers/specs/2026-09-30-director-rebuild-design.md`：V2 导演。
- `docs/wiki/workflows/chapter-production-chain.md`：现有章节生产规则。
- `docs/wiki/workflows/director-version-isolation.md`：V1 与 V2 的隔离。
- `server/src/modules/novel/short-story/README.md`：短篇模块边界。

## 1. 背景

### 1.1 V2 解决了什么、没解决什么

V2 导演重做的是"组织生产"这一层：做什么、何时暂停、如何恢复、如何展示。它没有触及"生产本身"，也就是正文写作、审校、修复、修后核对、状态回灌和编辑保护。

V2 的正文步骤 `modules/director/steps/production/chapterBatch.ts` 只是启动旧的正文流水线作业，然后等待它结束。真正的生产逻辑仍在旧代码中：

- `services/novel/runtime/`：约 9,600 行。
- `services/novel/production/`：约 2,650 行。
- `services/novel/state/`：约 2,200 行。
- 另有 `fact/`、`dynamics/`、`quality/`、`chapterEditor/` 等目录。

10 月 10 日（V2 设为默认）以来共有 46 个修复提交，其中约 23 个与章节、正文、审校、状态有关。这说明当前不稳定的主体已经在生产层，而不在导演层。

### 1.2 现状痛点（有证据）

| 痛点 | 证据 |
| --- | --- |
| 单章生产的判断集中在一个大过程函数里 | `runtime/chapterRuntimePipeline.ts` 的 `runPipelineChapterWithRuntime` 约 320 行。修复次数、候选选择、修后核对、风格泄漏、正文退化、暂停与质量债的判断交织在同一个循环里，没有可以单独测试的决策点 |
| 共用代码被 V2 分支污染 | 旧生产代码中有 14 个文件、96 处 V2 专属判断，例如 `artifactSyncPolicy === "director_v2"`。V1 已经冻结，却仍要背着这些分支 |
| 中间状态分散 | 一章的中间状态分布在流水线作业载荷、正文定稿记录、资产检查点、审校重试记录和章节风险标记中，恢复时需要拼接判断 |
| 状态事实分散 | 约 20 张表分别承载事实与状态，例如 `ConsistencyFact`、`NovelFactEntry`、`StoryStateSnapshot`、`CharacterTimeline`、`PayoffLedgerItem`、`CharacterResourceLedgerItem`、`StateChangeProposal`、`CanonicalStateVersion`、`TimelineHook`、`AuditReport` |
| 规则靠文档维持 | `chapter-production-chain.md` 积累了约 100 条"必须 / 不得"规则，多数只能靠人记住，代码结构本身并不阻止违反 |
| 大文件 | `ChapterArtifactDeltaService.ts` 1,235 行，`NovelPipelineExecutor.ts` 1,095 行，`ChapterArtifactBackgroundSyncService.ts` 860 行 |

### 1.3 已定决策（来自用户）

1. V1 冻结，只修 bug；默认入口为 V2。V1 不迁移到新内核，继续使用旧生产代码，直到退役。
2. 新内核是后续长篇正文产出的核心，需要优先考虑灵活性。
3. **内核只服务长篇。** 短篇与长篇的运行逻辑不同（见第 2 节），短篇保留独立的生产逻辑，不进入内核。
4. **短篇的任务、恢复与状态展示挂到 V2 的运行记录上**，用 V2 的一份短篇计划来组织，脱离 V1 的工作流任务。
5. 长篇和短篇共用"约定与小工具"，不共用生产流程。
6. V1 界面主题化放在 V2 完善之后，不在本设计范围内。

## 2. 长篇与短篇的本质差别

真正的差别不在"写一段、审一次、修一次"这些步骤本身，而在两件事：故事的记忆放在哪里，以及质量在什么粒度上判断。

| 方面 | 短篇 | 长篇 |
| --- | --- | --- |
| 记忆模型 | 整篇放在模型上下文内：写作时带上全篇计划、上一段尾部和连续性摘要；审校时读取全文 | 外部账本：每章写完后回灌事实、人物、信息边界、伏笔和资源，写下一章前再按需组装 |
| 验收粒度 | 片段只是内部生成单位，全部写完后做一次全篇审校和全文修复 | 每章都有接收闸门、一次修复和候选选稿，每章都是用户可见的落库单位 |
| 规划 | 一次定好钩子、节拍和结尾牵引，按全篇预算分配 | 滚动规划：卷、路线窗口、懒加载的章节合同，中途可以重规划 |
| 承诺兑现 | 篇内埋下的线必须在结尾前收束 | 伏笔有跨章、跨卷的兑现窗口，逾期只记提醒 |
| 恢复 | 片段游标 | 章节、批次、运行三层恢复 |

因此，"事实一致、人物状态、信息来源"在两边的目的相同，但机制完全不同：短篇靠"整篇都在眼前"，长篇靠"外部账本加按需取回"。如果硬放进同一个内核，内核就要为唯一的使用者额外增加作品级阶段、不回灌的记忆模式等抽象，每次改内核都会牵连短篇。

### 2.1 短篇与长篇的分界

- **短篇模式成立的条件**：审校模型能可靠地一次读完整篇。这里的瓶颈是全篇审校与修复，不是写作。
- **字数上限**：产品上保留 3 万字（与 `shortStory.prompts.ts` 第 27 行一致）。按每个汉字约 0.6～1 个 token 估算，3 万字的全篇审校输入约为 2.5～3.5 万 token。精细审校只宜使用标称上下文的三分之一到一半，所以 128k 级别的模型可以覆盖，32k 级别以下的模型和默认配置的本地模型不能覆盖。
- **中篇（3～10 万字）归长篇内核**，按章节加外部记忆来生产。
- **运行时校验**：全篇审校开始前，估算"正文加审校材料"的 token 数，与所选模型的有效预算（初值为上下文窗口的 40%）比较。超出时不硬审，而是提示用户更换模型或拆分处理。这是输入安全校验，不涉及语义判断。
- **折算比例需要用真实数据校准**：使用已有的逐次调用用量记录，统计常用模型下"输入 token 数 / 正文字数"的比例。

## 3. 目标与非目标

### 目标

1. 用一个与引擎无关的长篇内核，统一提供七项能力：事实一致、人物状态、信息来源、因果与承诺兑现、审校、修后核对、编辑保护。
2. 单章生产变成显式状态机，配一个纯函数决策器。现有规则落成可测试、可回放的决策表。
3. V2 长篇的自动生产，以及 V2 书的手动写章、修章和重新审校，都走同一个内核。
4. 抽出长篇和短篇共用的约定与小工具，保证两边对质量债、暂停和编辑保护的理解一致。
5. 短篇挂到 V2 运行记录上，脱离 V1 工作流任务。
6. V2 全部切换后，删除旧生产代码中的 V2 分支，让旧代码回到只服务 V1 的状态。

### 非目标

- 不合并现有状态表。内核通过端口读写现有表；状态表整合是下一阶段的独立课题（见第 12 节）。
- 不重写已注册的 Prompt。阶段适配器先复用现有 PromptAsset；需要改动时，按 Prompt Governance 新增版本。
- 不改变 V1 的任何行为。
- 不把短篇的生产逻辑并入内核。
- 不新增状态展示面。进度和结论通过 V2 运行记录投影到现有导演台。

## 4. 内核核心概念

### 4.1 章节单元（Unit）

```ts
interface UnitRef {
  novelId: string;
  chapterId: string;
  order: number;
}
```

### 4.2 生产配置（Production Profile）

配置是数据，随调用方的计划快照一起冻结，用来表达快速产文、严格模式、不同平台写法等差异：

```ts
interface ProductionProfile {
  id: string;                        // 例："long_chapter@1"、"long_chapter_strict@1"
  stages: StageId[];                 // 启用的阶段
  repair: { maxAttempts: 0 | 1; mode: "light_repair" | "heavy_repair" | "detect_only" };
  context: ContextPolicyId;          // 跨章、跨卷状态与长期伏笔的组装策略
  reconcile: "adaptive" | "deferred" | "strict";   // 与现有资产同步模式同义
  outputBudgets: Partial<Record<StageId, number>>; // 每个阶段的输出上限
  capabilities: CapabilityId[];      // 启用的能力，例如 "promise_fulfillment"
}
```

### 4.3 故事状态（Story State）

七项能力共用的事实面，以端口形式提供。

- **读取**：事实、人物硬事实与当前状态、信息边界（谁知道什么、从哪里得知）、承诺与伏笔窗口、资源。
- **写入**：只能通过状态变更集（StateDelta）提交，并且必须带上来源章节、正文内容哈希和幂等键。

端口背后是现有的表，内核不感知具体是哪些表。

## 5. 单章生产状态机

```text
prepare ──> draft ──> accept ──┬─> commit ──> reconcile ──> done
   │                           │
   │                           └─> repair ──> verify ──> select ──> commit ...
   └─(准备失败)─> failed
```

| 阶段 | 职责 | 对应现有实现（由适配器复用） |
| --- | --- | --- |
| `prepare` | 准备执行合同，组装上下文；组装过程只读 | `ChapterExecutionPreparationService`、`GenerationContextAssembler` |
| `draft` | 整章一次生成；空稿重试在阶段内部处理 | `ChapterWritingGraph` 与 writer |
| `accept` | 一次结构化审校，输出问题、缺失义务、可修复性和事实证据；按"正文哈希加输入指纹"缓存 | `ChapterAcceptanceAssessmentService`、`ChapterQualityGateService` |
| `repair` | 生成候选稿，**候选稿不是正史** | `repair/chapterRepairRuntime` |
| `verify` | 候选稿复审，并核对修后事实是否保持 | 现有 `repairVerification.factPreservation` |
| `select` | 只在产生过候选稿时执行：原稿与候选稿二选一，只使用已有的结构化结论 | `selection/ChapterRepairCandidateSelection` |
| `commit` | 带版本围栏写入正文和生命周期状态；不得覆盖用户编辑过的内容 | `ChapterLifecycleService`、`ChapterTimelineFinalizationService` |
| `reconcile` | 抽取状态变更集并分消费者应用；每个消费者有独立检查点，写入前再次校验正文版本 | `ChapterArtifactDeltaService` 及其消费者 |

**最终选稿：** `commit` 只写入"最终选稿"。没有进入修复时，原稿直接成为最终选稿，不经过 `select`；进入修复后，由 `select` 在原稿与候选稿之间选定。"候选稿被选中之前不得落库"只约束已经产生候选稿的路径。

### 5.1 决策器（纯函数）

```ts
decideNext(input: {
  profile: ProductionProfile;
  policy: IssuePolicySnapshot;     // 调用方冻结的问题策略
  unit: UnitProgress;              // 已完成的阶段、已用修复次数、原稿评估、候选评估
  lastVerdict?: AcceptanceVerdict;
}): UnitAction
// UnitAction = run_stage | select_final | record_debt | pause_for_manual | stop_for_replan | fail | done
```

`runPipelineChapterWithRuntime` 中散落的判断，全部变成决策器里的具名规则，每条规则配测试。例如：

- 修复最多一次；技术失败不升级为整章重写。
- 只有"审校系统不可用"这一类风险时，不进入修复。
- 候选稿新增高或严重问题、新增未兑现义务、事实核对未通过时，保留原稿。义务按结构化 kind + summary 识别，不能只比较类别或总数量。
- 正文可用时，局部质量问题记为质量债并继续。只有以下情况可以停止：结构化的 `stop_for_replan` 或 `replan_required`、问题策略明确要求暂停、没有可用正文、数据完整性失败。

### 5.2 执行器

执行器只做三件事：调用 `decideNext`；执行对应阶段的适配器；把阶段结果写回单元进度。

无修复路径通过显式 `select_final` 动作和纯状态转换保存最终选稿、正文哈希与原因；候选路径通过 `select` 阶段结果保存。选稿进度必须先持久化，之后才执行 `commit`。修复额度只限制下一次修复，不能跳过已有候选稿的 `verify → select`，也不能覆盖已保存的选稿。

崩溃恢复就是重新调用 `decideNext`。已完成阶段的结果按正文哈希复用，不会重复调用模型。执行器内不写业务判断。

## 6. 与调用方的契约

内核**不认识** V1、V2、运行记录、任务和 Seed。调用方注入以下内容：

```ts
interface UnitRequest {
  unit: UnitRef;
  profile: ProductionProfile;
  policy: IssuePolicySnapshot;
  model: ModelSelection;
  fence: () => Promise<void>;            // 所有权与取消检查；不通过时抛错，内核立即停止写入
  budget: BudgetPort;                    // 预算检查与用量记账，由调用方实现
  observe?: (event: UnitEvent) => void;  // 阶段进度事件，由调用方投影到自己的展示面
}

interface UnitOutcome {
  unit: UnitRef;
  finalContentHash: string | null;
  selected: "original" | "candidate" | null;
  verdict: AcceptanceVerdict | null;
  debts: QualityDebt[];                  // 使用共用约定中的质量债结构
  stopSignal?: StopSignal;               // 与 V2 的 StopSignal 语义一致
  reconcile: "completed" | "degraded" | "pending" | "failed";
}
```

| 调用方 | 适配位置 | 职责 |
| --- | --- | --- |
| V2 长篇自动生产 | `app/director` 的生产组装 | 注入运行记录的所有权围栏、预算和问题策略，把单元结果映射为 V2 的产物与质量债 |
| V2 书的手动入口 | 章节编辑器以及手动写章、修章路由 | 按 `Novel.directorVersion` 路由：V2 书进入内核，V1 书仍走旧链路 |

## 7. 七项能力在内核中的归属

| 能力 | 内核位置 | 生效方式 |
| --- | --- | --- |
| 事实一致 | 故事状态端口的事实读取、`accept` 的证据、`verify` 的事实保持核对 | 写作前作为必需上下文；写作后审校；修复后核对 |
| 人物状态 | 故事状态端口的人物硬事实与当前状态 | 必需上下文不可裁剪；在 `reconcile` 中更新 |
| 信息来源 | 故事状态端口的信息边界 | 在 `reconcile` 中记录谁知道什么；写作和审校时约束越界 |
| 因果与承诺兑现 | 章节义务合同，以及承诺与伏笔窗口 | `accept` 输出缺失义务；长期承诺按窗口跟进，不单独触发停止 |
| 审校 | `accept` | 每章一次结构化审校 |
| 修后核对 | `verify` 与 `select` | 候选稿必须复审并通过事实核对，才可能被采用 |
| 编辑保护 | `commit` 与 `reconcile` 的版本围栏 | 用户编辑后，旧结果一律不得落库；编辑后的内容重新审校并回灌 |

## 8. 共用约定与小工具（长篇和短篇都使用）

长篇和短篇共用的是**质量标准和语义**，不是生产流程。这部分单独成层，不依赖内核的领域层或应用层：

| 类别 | 内容 |
| --- | --- |
| 约定 | 质量债结构；问题策略（继续、暂停、重规划）的语义；"什么情况才能停止整条生产"的判定；编辑保护规则（版本校验、保存前快照、人工编辑内容不被覆盖） |
| 小工具 | 补丁应用（先在原文中统一定位，校验唯一且互不重叠，再从后往前应用；任何一步失败都返回完整原文）；带版本围栏的保存；用量与预算记账；全篇审校前的上下文预算校验 |

位置：`server/src/modules/production/common/`。它有自己的 `index.ts`，短篇只能从这里导入；内核本身也从这里取约定，不重复定义。

## 9. 短篇：独立生产，挂到 V2 运行记录

- **生产逻辑**保持在 `modules/novel/short-story/`：计划、逐段写作、全篇审校、一次修复。它使用共用约定与小工具，不使用内核。
- **任务底座**：用 V2 的"计划即数据"注册一份短篇计划，四个步骤各由一个步骤适配器调用短篇模块。V2 运行契约的 `chapterRange` 可以为空，计划按 `planVersion` 区分，V2 内核不需要为短篇增加分支。
- **获得的能力**：命令幂等、版本冲突检测、按运行加租约、崩溃后重新计算下一步、人工暂停锁、计划确认门（半自动），以及与长篇统一的状态徽标、导演台和运行记录。
- **边界**：
  - 短篇只依赖 V2 的稳定内核，包括运行记录、控制状态、产物台账、守卫和命令；不复用任何长篇步骤。
  - V2 内核里出现"如果是短篇"的分支，就说明契约有缺口，应补成通用能力。
  - 面向用户的文案用"创作进度"一类表达，不出现"导演"。
  - 历史短篇任务（V1 工作流任务）只读保留，不做转换；新开的短篇才走 V2。
- **需要补齐的能力**：在 `main` 上，短篇修复后没有复审（`ShortStoryProductionService.ts` 第 387～440 行），缺少修后核对。由短篇模块使用共用的补丁工具补上，再加一次核对。具体以合入短篇修复分支后的代码为准。

## 10. 新引擎的收益与局限

### 10.1 收益

| 收益 | 依据 |
| --- | --- |
| 已修过的一类 bug 从结构上消失 | 重复审校、重复调用模型由"按正文哈希复用阶段结果"消除；保存回退和并发覆盖由"唯一写入口加版本围栏"消除；预算暂停后的恢复点由"阶段之间暂停"确定；输出上限由各阶段自行声明 |
| 恢复更简单 | 每章一份按阶段的进度，替代分散在五处的中间状态 |
| 测试可以不花钱地回放 | 决策器的输入是 AI 的结构化结论，真实运行的结论可以作为夹具反复回放；修改规则时，可以直接看出哪些章节的处理方式会变化 |
| AI 进步时只需替换零件 | 写作、审校、回灌阶段都可以单独替换实现或模型；分阶段的用量记账可以直接对比成本与效果 |
| 开发影响面变小 | 新能力就是新增一个阶段或一条规则；V1 与 V2 路径分开；手动生产和自动生产在结构上保持一致 |

### 10.2 局限

- **不会直接提高文字质量。** 质量取决于提示词、模型和上下文；内核的作用是让质量改进更便宜、更安全地试错。
- **第一阶段不解决状态表分散。** 事实一致类问题如果根因在重复的事实来源，要等状态表整合才能根治。
- **过渡期更复杂。** 会同时存在三条路径：V1 旧链路、V2 走旧流水线、V2 走内核。每一步都必须有开关，并尽快推进到删除 V2 分支那一步。

## 11. 模块布局与依赖规则

```text
server/src/modules/production/
  common/          共用约定与小工具（长篇和短篇都用），有自己的 index.ts
  domain/          纯类型、配置结构、状态机、决策器、候选选择；不允许任何 IO
  application/     执行器、用例、端口定义
  infrastructure/  适配器：把现有 runtime、state、prompt 服务接到端口上
  profiles/        长篇配置（数据）
  index.ts         内核唯一对外出口
```

- 依赖方向：`common ← domain ← application ← infrastructure`。
- 外部只能从 `modules/production/index.ts` 或 `modules/production/common/index.ts` 导入。
- 内核不得导入 `modules/director`、`services/novel/director`、`modules/novel/director-routing`、`services/novel/workflow` 和 `modules/novel/short-story`。
- 适配器可以调用现有的底层服务，但不得为了内核去修改它们的行为。需要不同行为时，把实现复制进内核再修改，以保证 V1 冻结。

## 12. 迁移策略

采用逐步替换，不一次性重写：

1. 内核先替换"编排"，即 320 行的过程函数和批量执行的粘合代码；各阶段的具体能力先通过适配器复用旧的底层服务。
2. 抽出共用约定与小工具。
3. V2 长篇正文切换到内核：`chapterBatch` 从"等待旧流水线作业"改为逐章调用内核。
4. 短篇挂到 V2 运行记录，同时补上修后核对和上下文预算校验。
5. V2 书的手动入口接入内核。
6. 删除旧代码中的 V2 分支。
7. 下一阶段课题：状态表整合，以及能力增强（承诺兑现、信息来源约束、按阶段换用更强的模型或 Agent）。

每一步都有开关，并且可以独立回退。

## 13. 必须继承的现有规则

完整清单由盘点计划产出。以下几条在设计阶段已经确定：

- 正文和生命周期字段只能经由唯一的写入口落库，版本围栏不可绕过。
- 候选稿被选中之前，不得写入正文、时间线、事实或终态事件。
- 审校缓存只保存成功的结果，"审校不可用"不进入缓存。
- 会调用模型的后置抽取必须先抢占检查点；同一正文哈希、同一产物类型、同一模式下，不得重复调用模型。
- 消费者写入前要再次确认正文版本，比对时使用原始正文，不使用归一化后的文本。
- 问题策略由调用方在开始时冻结，运行中修改策略不影响已经开始的任务。
- 质量债不阻塞全链路（见 `AGENTS.md` 自动导演质量门规则）。

## 14. 验收标准

1. 决策器的规则测试覆盖盘点清单中的每一条"必须 / 不得"规则，并通过变异检查。
2. 用同一组章节夹具对比内核与旧流水线的阶段决策。存在差异的项列入差异清单，由用户确认为有意改进。
3. 回放测试：用记录下来的 AI 结构化结论回放决策，结果稳定。
4. 端到端测试只使用临时 SQLite，不连接开发库。
5. 切换期间，V1 所属代码的差异只允许是"删除 V2 分支"。
6. 内核单个文件不超过 1,200 行，领域层不包含 IO。

## 15. 风险

| 风险 | 应对 |
| --- | --- |
| 适配器复用旧的底层服务时，被其中的 V2 分支反向影响 | 适配器显式传参，不走 V2 分支；迁移第 6 步删除这些分支 |
| 与 V1 共用业务表，写入语义不一致 | `commit` 经由 `ChapterLifecycleService` 写入，状态取值的语义与 V1 相同；同一本书同一时刻只归属一个版本（已有 epoch 围栏） |
| 短篇修复分支（`codex/short-story-revision-recovery`）与短篇迁移冲突 | 短篇迁移安排在该分支合入之后，迁移前重新盘点 |
| V2 仍在演进，改动会波及短篇 | 短篇只依赖 V2 的稳定内核接口；V2 内核改动时，把短篇测试纳入回归 |
| 行为等价验证成本高 | 先用夹具验证决策等价，不验证模型输出等价 |

## 16. 开放问题（盘点后决定）

1. 故事状态端口第一版覆盖哪些表，以及如何处理重复的事实来源，例如 `ConsistencyFact` 与 `NovelFactEntry`。
2. 单元进度存在哪里：新建 `ProductionUnitRun` 表，还是复用 `GenerationJob` 的载荷。设计倾向于新建表。
3. V2 书的手动入口是全部进入内核，还是只让写章和修章进入。
4. 上下文有效预算比例的初值（暂定 40%），以及各常用模型的 token 折算比例（由用量记录校准）。
