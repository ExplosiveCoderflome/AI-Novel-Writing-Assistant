# 懒规划（JIT task sheet）重构（Phase 1）

## 背景

### 问题

原有流程要求在执行任何章节前，必须先为所有 N 章预生成 task sheet（`chapter_detail_bundle` 步骤），并将它们全量同步到执行区（`chapter_sync` 步骤），才能通过门控开始写章。这引入了两个系统性缺陷：

| 缺陷 | 描述 |
|------|------|
| **缺陷1：全量拆章门控** | 100 章的小说必须等所有 task sheet 生成完毕才能开始执行，延迟巨大 |
| **缺陷2：task sheet 与正文脱节** | task sheet 在"规划期"生成，不知道已经写了哪些章节的事实，义务设计可能与实际前文矛盾 |

### 解决方案

**懒规划（Lazy Planning / JIT）**：把 task sheet 从"规划阶段全量预生成"改为"执行前即时生成（Just-In-Time）"，并将已发生事实（Fact Ledger）注入到生成上下文，从根本上解决义务不可达（根因 D）问题。

快速启动把懒规划扩展为“滚动路线窗口 + 下一章执行合同”：系统始终保证未来至少 3 章、目标 5 章的简略路线，但只为下一章准备完整 task sheet、scene cards、字数和避坑约束。路线回答“接下来往哪里走”，执行合同回答“下一章具体怎么写”，两者不能混成整卷全量细化。

---

## 架构变化

### 旧流程

```
structured_outline 阶段（串行，全量）
  beat_sheet → chapter_list → chapter_detail_bundle（N 章逐一）→ chapter_sync（全量）
        ↓ 门控：syncedChapterCount >= plannedChapterCount（N/N 全部 task sheet）
chapter_execution 阶段
  第 1 章：GenerationContextAssembler.assemble → plannerService.ensureChapterPlan → 写章
  第 2 章：...
```

### 新流程（full_book_autopilot 模式）

```
structured_outline 阶段（跳过 chapter_detail_bundle）
  beat_sheet → chapter_list → ✗chapter_detail_bundle（已跳过）→ chapter_sync（仅同步章节标题）
        ↓ 门控：syncedChapterCount >= plannedChapterCount（章节记录在 DB 中即通过）
chapter_execution 阶段
  第 1 章：JIT 生成 task sheet（factLedger 为空，生成基础 task sheet）
           → plannerService.ensureChapterPlan → 写章 → 落库
           → ChapterContentFinalizationService 写入 factLedger（第 1 章事实）
  第 2 章：JIT 生成 task sheet（factLedger 含第 1 章事实）
           → plannerService.ensureChapterPlan → 写章 → ...
```

---

## 关键组件

### ChapterPlanJITService

**文件**：`server/src/services/novel/planning/ChapterPlanJITService.ts`

`ChapterPlanJITService` 在自动成书模式下先调用 `ChapterRouteWindowService` 检查路线窗口，再细化当前章。未写路线少于 3 章时补齐到目标 5 章；补齐按节拍块增量生成并复用现有卷文档与章节同步，不重建已完成路线，也不触发无变化的 Payoff Ledger 同步。

核心方法：`ensureExecutionReady(novelId, chapterId)`

| 场景 | 行为 |
|------|------|
| task sheet 与 sceneCards 完整 | 直接复用，不读取事实账本，不重新生成 |
| task sheet 或 sceneCards 缺失 | 生成一次（含 Fact Ledger guidance，若有） |

同一章在一个服务进程内同时进入 JIT、手动入口或恢复入口时，统一合同服务按 `novelId + chapterId` 合并在途请求；首个调用完成后，结果仍以 `Chapter` 的任务单、场景卡和边界字段为唯一持久化事实。禁止在不同入口各自提前生成合同。

任务单质量检查分为两层：结构完整性（目的、边界、任务单、场景卡）是正文前置条件；全书自动执行中的语义建议只作为后续正文验收与质量债的输入，不重写同一份合同。这样既保留检查，又不会把一条可继续生产的语义建议放大为额外的整份合同调用。

**依赖注入**（通过 `ChapterPlanJITDeps`）：
- `ensureChapterExecutionContract`：委托给 `NovelVolumeService.ensureChapterExecutionContract`

**Fact Ledger 注入格式**（`guidance` 字段）：
```
【已发生事实 / Fact Ledger — 请将以下事实纳入 task sheet 设计，避免重复或矛盾】
已完成目标：
  - [第N章] ...
已揭示信息：
  - [第N章] ...
近期状态变化：
  - [第N章] ...
```

### 结构化大纲阶段改造

**文件**：`server/src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts`

变更：
1. `chapter_detail_bundle` 步骤：当 `isFullBookAutopilotRunMode(request.runMode)` 时直接 `break`，跳过全量 task sheet 预生成
2. `missingExecutionContextOrders` 检查：JIT 模式下章节没有 task sheet 是预期状态，条件跳过检查

### 执行入口接入

**文件**：`server/src/services/novel/runtime/GenerationContextAssembler.ts`

在 `plannerService.ensureChapterPlan` 之前插入：
```typescript
if (request.controlPolicy?.advanceMode === "full_book_autopilot") {
  await this.chapterPlanJITService.ensureExecutionReady(novelId, chapterId);
}
```

`ensureChapterPlan` 通过 `buildChapterExecutionContractHash` 检测到 task sheet 变化后，自然重算执行计划。

---

## 兼容性

| 场景 | 行为 |
|------|------|
| 旧小说（已有完整 task sheet） | 直接复用；事实变化进入正文运行时上下文，不重建合同 |
| 手动单章模式（manual / co_pilot） | `advanceMode ≠ full_book_autopilot` → 不触发 JIT |
| 全书 autopilot，章节缺少 task sheet | JIT 即时生成 |

---

## 门控逻辑

门控（`createChapterExecutionContractSyncModule`）的完成条件 `syncedChapterCount >= plannedChapterCount` **不需要修改**。

原因：`chapter_sync` 步骤（结构化大纲阶段末尾）通过 `syncVolumeChaptersWithOptions` 将所有章节写入执行区 DB（即使没有 task sheet），`syncedChapterCount` 随即等于 `plannedChapterCount`，门控自然通过。

同步边界必须允许 `full_book_autopilot` 把只有标题、摘要或部分执行字段的章节先写入正式章节区。部分 `taskSheet` 或 `sceneCards` 不能被误判为“完整合同已生成”并在同步阶段阻断任务；当前章进入正文执行前，`ChapterPlanJITService` 会调用统一的执行合同生成器补齐字段、通过质量校验并保存。非 JIT 的手动同步与普通执行路径仍保留完整合同门禁。

---

## 自动执行范围预检

`full_book_autopilot` 的 `chapter_batch_ready` 表示章节列表已经同步到执行区，并且每章至少有可供 JIT 使用的执行种子（例如 `Chapter.expectation`），不表示所有章节都已经拥有完整 task sheet / scene cards。

因此自动执行启动、轮询和 takeover/recovery 的范围预检必须区分两类路径：

| 路径 | 预检要求 |
|------|----------|
| `full_book_autopilot` | 目标范围内章节必须存在，并具备可触发 JIT 的执行种子；缺少完整 task sheet 属于预期状态，由 `GenerationContextAssembler` 在写章前即时补齐 |
| 普通 `auto_to_execution`、手动章节范围、非 JIT 路径 | 目标范围内章节必须已有完整执行契约；缺少 task sheet / scene cards / 字数与冲突揭示等细化字段时，应回到节奏 / 拆章补齐 |

失败模式：如果自动执行范围预检仍按普通路径要求完整 task sheet，`full_book_autopilot` 会在 JIT 触发前被 `runFromReady` 拦截，出现“缺少完整章节细化”的失败；这不是章节数据丢失，而是预检层与 JIT 契约不一致。

相关模块：
- `server/src/services/novel/director/automation/novelDirectorAutoExecutionScopeRuntime.ts`
- `server/src/services/novel/director/automation/novelDirectorAutoExecutionRuntimePreparation.ts`
- `server/src/services/novel/director/runtime/novelDirectorTakeoverRuntime.ts`

---

## 质量修复闭环子项（1.D）

### 根因A — 修复器传入结构化义务信息

**文件**：`server/src/services/novel/runtime/repair/chapterRepairRuntime.ts`

新增 `buildRepairIssuesPayload(issues, runtimePackage)`：
- 在 `ReviewIssue[]` 之外，追加 `missingObligations`（kind/summary/evidence）和 `blockingIssueCodes`
- 局部补丁与整章重写均使用结构化 JSON，修复器可据此定向补写义务

### 根因B — 单次 patchRepair 边界

**文件**：`DirectorQualityLoopBudgetLedgerService.ts`
- `DIRECTOR_QUALITY_LOOP_BUDGET_LIMITS.patchRepair` 固定为 1，与任务策略的唯一自动处理机会保持一致。

**文件**：`chapterRepairRuntime.ts`
- 局部补丁只调用一次；`ChapterPatchRepairFailedError` 直接返回运行边界，不再以宽松锚点发起第二次 LLM 补丁。
- 局部补丁失败后保留原正文，按冻结的问题策略记录质量债或暂停等待人工处理；不得根据历史失败次数把下一次恢复静默改成 `heavy_repair`。

### 根因E — issueSignature 拆分 length/content 分别计预算

**文件**：`DirectorQualityLoopBudgetLedgerService.ts`
- 新增 `classifyIssueNoticeCode(noticeCode)` → 返回 `"length"` 或 `"content"`
- `buildDirectorQualityLoopIssueSignature` 在签名头部加入 class 前缀
- 长度类问题（`LENGTH_*`）与内容类问题获得独立预算计数器，避免补丁修好长度后内容问题被误算重复

---

## 上下文分层缓存（Phase 2）

### BatchContextCache

**文件**：`server/src/services/novel/runtime/BatchContextCache.ts`（新建）

- 进程内 singleton，按 `novelId` 缓存完整的 novel Prisma 查询结果（含 world/characters/storyMacroPlan/volumePlans）
- TTL = 30 分钟，最多缓存 8 个 novelId
- 失效：订阅 `character:changed` / `volume:updated` / `outline:revised` / `pipeline:completed` 事件自动失效

### GenerationContextAssembler 重构

**文件**：`server/src/services/novel/runtime/GenerationContextAssembler.ts`

1. **稳定层缓存**：将 novel 大查询替换为 `batchContextCache.getNovelRow(novelId)`，每章节省 10+ 并行子查询
2. **移除 timelineContext**（缺陷5）：删除 `timelineContextService.buildForChapter` 调用，`timelineContext: null`；接收闸门不处理 Timeline，最终正文由 `ChapterTimelineFinalizationService` 写入最小降级锚点
3. **合并双 contextPackage**（缺陷6）：用 `sharedFields` 对象一次性组装共享字段，最终 `contextPackage = { ...sharedFields, ragContext, chapterMission, chapterWriteContext, chapterReviewContext, chapterRepairContext }`；消除 ~30 个字段两遍手抄

---

## N+1 章边界

- 当前章结束后只允许补齐下一段简化路线窗口，不生成 N+1 章正式执行合同。
- Pipeline 的执行队列可以在章节边界追加滚动生成的新章节，不能把任务启动时查询到的章节数组视为整本书固定范围。
- N+1 正式合同由该章进入 `GenerationContextAssembler` 时唯一确认；已有完整合同直接复用，缺失时才结合当前 Fact Ledger 生成一次。
- 禁止后台预取与正式执行并发写入同一份合同。减少重复调用和竞态的收益，高于提前数秒生成合同的延迟收益。

---

## 全书目标与滚动窗口

### Background

预计章节数是整本书的完成目标，不是要求在启动前一次拆完的章节任务数量。若把当前已拆章节数当作自动导演的上限，作品写到当前卷末尾就会停止，迫使新人回到拆章页手动接力。

### Current Rule

全书自动接管以预计章节数作为长期目标，但只维护近期路线窗口：

1. 先继续当前已同步的章节；
2. 未写路线少于窗口下限时，补到近期窗口目标；
3. 当前所有卷的节奏板均已消耗、且尚未达到全书目标时，先补后续卷级骨架；
4. 只为新近卷生成节奏板和下一小段章节列表；下一章仍在写作前按 JIT 生成正式执行合同。
5. 快速接续若选定的目标章超出当前卷覆盖范围，必须改走同一条滚动规划链：保留目标章节作为停止边界，先扩展后续卷骨架和近期拆章；不能把它降级为要求当前卷已完整覆盖的普通章节范围。

追加未来卷不得改写已进入生产的卷、章节、节奏板或卷间校准结论。只有已有卷本身被删除、重排或内容修改时，才按原有规则使下游规划失效。

### Product Surface

普通“继续创作”入口在当前可执行窗口小于预计章节数时，应显示“持续推进至第 N 章”，并说明先完成当前窗口、后续按需补卷和拆章。用户把目标设在当前窗口之外时，仍由这条滚动链完成到目标章；高级设置保留手动范围选择；普通入口不要求用户理解卷骨架、节奏板或窗口管理。

### Failure Modes

- 只扩大执行目标、不补后续卷骨架：执行队列在当前卷末尾找不到下一章并进入可恢复失败。
- 补卷时清空已有节奏板：当前卷的生产路线丢失，可能导致重复拆章或无法接续。
- 预先拆完远期章节：后续事实无法影响规划，且增加等待、模型调用与修改成本。

---

## 相关文件

- `server/src/services/novel/planning/ChapterPlanJITService.ts`（新建）
- `server/src/services/novel/runtime/BatchContextCache.ts`（新建）
- `server/src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts`（改造）
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`（JIT 接入 + 缓存 + 合并）
- `server/src/services/novel/runtime/repair/chapterRepairRuntime.ts`（结构化义务 + 单次补丁边界）
- `server/src/services/novel/director/runtime/DirectorQualityLoopBudgetLedgerService.ts`（单次补丁预算 + 签名拆分）
- `server/src/services/novel/production/NovelPipelineExecutor.ts`（只补路线窗口，不预取正式合同）
- `server/src/services/novel/fact/NovelFactService.ts`（factLedger 数据源，PR-A 已就绪）

## 与四阶段优化方案的关系

懒规划保留执行前即时生成和上下文分层缓存；正式合同预取因存在双写、重复调用和并发覆盖风险而不属于当前生产规则。

## 紧凑作品的滚动窗口

紧凑作品的路线窗口仍由 JIT 服务按当前事实即时补齐，但会携带完成预算：剩余 8 章以内进入收束规划，剩余 3 章以内使用终章倒计时上下文。收束规划只能读取既有结局合同、事实账本和未兑现回报，不再扩展新的远期主线；路线补齐失败不得覆盖当前章已保存正文。
