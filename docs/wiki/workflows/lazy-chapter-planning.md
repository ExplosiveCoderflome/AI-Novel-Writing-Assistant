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

核心方法：`ensureExecutionReady(novelId, chapterId)`

| 场景 | 行为 |
|------|------|
| task sheet 存在 + factLedger < 3 条 | 跳过（旧小说 / 首章，保留已有 task sheet） |
| task sheet 存在 + factLedger ≥ 3 条 | 重新生成，将事实注入为 `guidance` |
| task sheet 缺失 | 生成（含 factLedger guidance，若有） |

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
| 旧小说（已有 task sheet，factLedger 为空） | factLedger < 3 条 → 跳过 JIT，保留已有 task sheet |
| 旧小说（已有 task sheet，factLedger 有数据） | 重新生成，纳入已发生事实 |
| 手动单章模式（manual / co_pilot） | `advanceMode ≠ full_book_autopilot` → 不触发 JIT |
| 全书 autopilot，章节缺少 task sheet | JIT 即时生成 |

---

## 门控逻辑

门控（`createChapterExecutionContractSyncModule`）的完成条件 `syncedChapterCount >= plannedChapterCount` **不需要修改**。

原因：`chapter_sync` 步骤（结构化大纲阶段末尾）通过 `syncVolumeChaptersWithOptions` 将所有章节写入执行区 DB（即使没有 task sheet），`syncedChapterCount` 随即等于 `plannedChapterCount`，门控自然通过。

---

---

## 质量修复闭环子项（1.D）

### 根因A — 修复器传入结构化义务信息

**文件**：`server/src/services/novel/runtime/repair/chapterRepairRuntime.ts`

新增 `buildRepairIssuesPayload(issues, runtimePackage)`：
- 在 `ReviewIssue[]` 之外，追加 `missingObligations`（kind/summary/evidence）和 `blockingIssueCodes`
- 两处重写路径（patch 失败升级 + 强制重写）均使用结构化 JSON，修复器可据此定向补写义务

### 根因B — patchRepair 预算提升 + 宽松锚点重试

**文件**：`DirectorQualityLoopBudgetLedgerService.ts`
- `DIRECTOR_QUALITY_LOOP_BUDGET_LIMITS.patchRepair`: 1 → 2

**文件**：`chapterRepairRuntime.ts`（patch 失败 catch 块）
- 首次 `ChapterPatchRepairFailedError` → 用 `continuity_only` 模式重试一次（宽松锚点）
- 宽松重试成功 → 返回 patch 结果
- 宽松重试仍失败 → 升级 `heavy_repair`

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
2. **移除 timelineContext**（缺陷5）：删除 `timelineContextService.buildForChapter` 调用，`timelineContext: null`；`ChapterQualityGateService` 对 null 有防御
3. **合并双 contextPackage**（缺陷6）：用 `sharedFields` 对象一次性组装共享字段，最终 `contextPackage = { ...sharedFields, ragContext, chapterMission, chapterWriteContext, chapterReviewContext, chapterRepairContext }`；消除 ~30 个字段两遍手抄

---

## N+1 章执行预取（Phase 3）

**文件**：`server/src/services/novel/novelCorePipelineService.ts`

- 在每章 `runPipelineChapter` 完成后（factLedger 已写入），**非阻塞**触发下一章（N+1）的 JIT task sheet 预取
- 仅在 `advanceMode === "full_book_autopilot"` 时启用
- 预取失败不影响流水线，下一章正式组装时会自动重试
- 配合 `BatchContextCache`：novel 稳定层已缓存，预取仅需生成 task sheet，组装近乎瞬时

---

## 相关文件

- `server/src/services/novel/planning/ChapterPlanJITService.ts`（新建）
- `server/src/services/novel/runtime/BatchContextCache.ts`（新建）
- `server/src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts`（改造）
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`（JIT 接入 + 缓存 + 合并）
- `server/src/services/novel/runtime/repair/chapterRepairRuntime.ts`（结构化义务 + 宽松锚点重试）
- `server/src/services/novel/director/runtime/DirectorQualityLoopBudgetLedgerService.ts`（预算提升 + 签名拆分）
- `server/src/services/novel/novelCorePipelineService.ts`（N+1 预取）
- `server/src/services/novel/fact/NovelFactService.ts`（factLedger 数据源，PR-A 已就绪）

## 与四阶段优化方案的关系

本改动实施方案文档 `.claude/plan/novel-generation-pipeline-optimization.md` 阶段一（懒规划重构）、阶段二（上下文分层缓存）、阶段三（N+1 预取），以及 1.D 质量修复闭环子项（根因 A/B/E）的全量实施。
