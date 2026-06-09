# 小说生成链路四阶段优化方案

> 状态：规划中 / 待评审
> 关联：`novel-fact-ledger.md`（PR-A 已落地、PR-B 已落地，本方案是其后续）
> 目标：解决"全量拆章门控、task sheet 与正文脱节、上下文巨石、串行执行、质量债务高发"五类系统性问题。

---

## 0. 背景与现状全景

### 0.1 当前生成链路

```
【规划阶段 / structured_outline】每卷串行
  beat_sheet(节奏板) → chapter_list(拆章) → chapter_detail(逐章 task sheet) → chapter_sync(同步执行区)
        ↓ 硬门控：syncedChapterCount >= plannedChapterCount（必须 N/N 全部完成）
【执行阶段 / pipeline】逐章串行 1→N
  对每一章：GenerationContextAssembler.assemble（15+ 并行查询）
        → ChapterWritingGraph 写作 → finalizeChapterContent（接收闸门）
        → 不通过则 repairDraftContent（修 1 次）→ 仍不通过则 Director 层预算升级
        → (PR-A) 章节接收后写事实账本
```

### 0.2 已确认的架构不足

| 编号 | 缺陷 | 严重度 | 主要证据 |
|------|------|--------|----------|
| 缺陷1 | 全量拆章门控 | 🔴 | `directorExecutionStepModules.ts` `createChapterExecutionContractSyncModule` 要求 `syncedChapterCount >= plannedChapterCount` |
| 缺陷2 | task sheet 预生成，与实际正文脱节 | 🔴 | `buildChapterMissionContext` 读 `chapter.taskSheet`（执行前基于纯大纲生成），`obligationContract.mustHitNow` 全部源自该预设 |
| 缺陷3 | GenerationContextAssembler 巨石 + 每章全量重查 | 🟠 | `GenerationContextAssembler.assemble` 每章 15+ 并行查询，其中 world/bookContract/macroConstraints/storyMacroPlan/volumeWindow/characterRoster 在批次内基本稳定却被重复查询 |
| 缺陷4 | 执行完全串行，无预取 | 🟠 | `novelCorePipelineService.executePipeline` 逐章 `await`，零并发 |
| 缺陷5 | PR-B 残留：timelineContext 仍每章构建 | 🟡 | `GenerationContextAssembler` 第 399 行仍调用 `timelineContextService.buildForChapter`，写作路径已不消费 |
| 缺陷6 | 双 contextPackage 构建 | 🟡 | `baseContextPackage` 与 `contextPackage` 近乎相同，字段手抄两遍 |

### 0.3 质量债务根因（已追踪，待埋点确认占比）

"修复一次仍失败 → 已记录质量债务/留存风险"的候选根因：

- **根因A（开环修复）**：接收闸门产出结构化 `blockingIssues + repairDirectives + missingObligations`，但 pipeline 的 `toReviewIssues`/`toAcceptanceDirectiveIssues` 压扁为 `{severity,category,evidence,fixSuggestion}`，丢失 `code`/义务结构/`repairability`。修复器修症状不修义务，重评同条义务再失败。
- **根因D（义务不可达）**：预生成 task sheet 义务与实际前文矛盾（即缺陷2），章节级修复永远命不中 → 升级 → defer。与懒规划同源。
- **根因B（patch 锚点脆弱）**：`ChapterPatchRepairService` 要求精确锚定原文片段，锚点失配即 `!applied.success` 抛错升级；而 `patchRepair` 预算只有 1。
- **根因C（无重评内循环）**：`effectiveMaxRetries = min(maxRetries, 1)`，修 1 次即退出；真正升级跨多个冷启动 job，丢上下文。
- **根因E（签名漂移）**：长度问题与内容问题混在同一 issueSignature，补丁修好长度后浮出内容问题，被算作同签名再失败。

---

## 阶段0：质量债务根因诊断（先行，必做）

> 原则：用归因数据决定阶段一/二的侧重，不凭经验拍脑袋。改动小、零风险、先落地。

### 0.A 埋点：defer_and_continue 落库时写结构化归因

**位置**：`novelDirectorAutoExecutionRuntime.ts` 的 `buildDirectorAutoExecutionDeferredQualityState` 调用处 + `chapterQualityLoopService.recordAssessment`（`terminalAction: "defer_and_continue"`）。

**新增归因字段**（写入 `riskFlags` JSON 或 `qualityLoopLedger` 条目 metadata）：

```ts
interface QualityDebtAttribution {
  repairability: "none" | "patchable_obligation_gap" | "plan_misalignment" | string; // 判 D
  budgetActionsConsumed: Array<"patch_repair" | "chapter_rewrite" | "window_replan">; // 升级路径
  firstFailureIssueCodes: string[];   // 首次失败 blockingIssues.code
  secondFailureIssueCodes: string[];  // 二次失败 blockingIssues.code
  sameObligationRepeated: boolean;    // 首次=二次同义务 → 判 A
  planMisaligned: boolean;            // repairability==="plan_misalignment" → 判 D
  patchAnchorFailed: boolean;         // patch 升级 heavy 的 escalatedFromPatch → 判 B
  lengthVsContentDrift: boolean;      // 首次 length 类、二次 content 类 → 判 E
  missingObligationKinds: string[];   // must_hit_now / forbidden_crossing / ...
}
```

实现要点：
- 在 `chapterRuntimePipeline.ts` 收集首次/二次 acceptance 的 `blockingIssues.code` 与 `repairability`，透传到返回结果（`PipelineRuntimeResult` 增加可选 `qualityDebtAttribution`）。
- `repairDraftContent` 已知道 `escalatedFromPatch`（patch 锚点失配），一并上抛。

### 0.B 聚合工具：质量债务归因报告

新增 Agent 工具 `analyze_quality_debt_attribution`（参考 `audit_chapter_continuity` 的确定性扫描风格，无 LLM 调用）：
- 输入：novelId（可选章节区间）
- 输出：对所有 `defer_and_continue` 章节的归因聚合 —— A/B/D/E 各占比、Top 重复义务、Top 失败 code。

### 0.C 决策门

- 若 **D 主导** → 阶段一（懒规划）优先级最高，预期顺带消解大部分质量债务。
- 若 **A/B 主导** → 先做阶段一的"修复闭环子项"（见 1.D），再做懒规划主体。

### 阶段0 验收
- [ ] 质量债务章节 100% 带结构化归因
- [ ] 聚合工具能产出 A/B/D/E 占比报告
- [ ] 据报告确定阶段一/二最终侧重

---

## 阶段一：懒规划重构（解决缺陷 1 + 2，核心，并直接缓解根因 D）

> 把 task sheet 从"规划阶段全量预生成"改为"执行前即时生成（just-in-time）"，输入包含已发生事实（Fact Ledger）。

### 1.A 新增 ChapterPlanJITService

**文件**：`server/src/services/novel/planning/ChapterPlanJITService.ts`（新建）

```ts
class ChapterPlanJITService {
  // 执行第 N 章前调用，确保 task sheet 基于实际前文即时生成
  async ensureExecutionReady(novelId, chapterId): Promise<void>
}
```

生成时输入（均已有数据源）：
- 第 1..N-1 章 `factLedger`（`novelFactService.listForChapter`，PR-A 已就绪）
- `canonicalState` + `payoffLedger` 实际进度
- 本卷 `beat_sheet` 中第 N 章的节奏锚点（保留宏观约束）
- 前一章尾段 `previousChapterTail`

产出：写回 `chapter.taskSheet` / `sceneCards` / `targetWordCount` / `mustAvoid` / `hook`（与现有字段兼容）。

### 1.B 门控降级

**文件**：`directorExecutionStepModules.ts` `createChapterExecutionContractSyncModule`

- `inspectReadiness` / `inspectCompletion` 的完成条件从"task sheet 全同步"降为 **"chapter_list（标题+节奏锚点）全同步"**。
- 即 `structured_outline` 阶段只需生成到 chapter_list 即可进入执行；chapter_detail 改为执行前 JIT。

**文件**：`novelDirectorStructuredOutlinePhase.ts`

- `chapter_detail_bundle` 步骤改为可选/可跳过（autopilot 模式下不再强制全量细化）。
- `chapter_batch_ready` checkpoint 的前置校验从"全部 task sheet 就绪"改为"全部 chapter_list 就绪"。

### 1.C 执行入口接入 JIT

**文件**：`GenerationContextAssembler.assemble`

- 在 `plannerService.ensureChapterPlan` 之前插入 `chapterPlanJITService.ensureExecutionReady(novelId, chapterId)`。
- 复用现有 `buildChapterExecutionContractHash` 机制：JIT 生成后 hash 变化，`ensureChapterPlan` 自然重算 plan。

### 1.D 修复闭环子项（按阶段0 结论决定是否纳入本阶段）

针对根因 A/B：
- **A**：让修复器拿到结构化义务。`prepareChapterRepairExecution` 的 `issues` 旁路增加 `missingObligations` + `blockingIssues.code` 透传到修复 prompt（review/patch prompt 的 contextBlocks），不再只传压扁文本。
- **B**：`DIRECTOR_QUALITY_LOOP_BUDGET_LIMITS.patchRepair` 从 1 提到 2；patch 锚点失配时允许一次"宽松锚点"重试再升级。
- **E**：issueSignature 拆分 length 类与 content 类，分别计预算。

### 1.E 兼容与迁移
- 已存在预生成 task sheet 的旧小说：JIT 检测到 `factLedger` 为空（前文未写）时回退到现有 taskSheet，不破坏存量。
- 手动单章模式（manual）：保持现有行为，JIT 仅在 autopilot/pipeline 路径强制。

### 阶段一验收
- [ ] 首章执行延迟从"N 次拆章"降到"1 次拆章 + 1 次 JIT"
- [ ] task sheet 含已发生事实，replan 触发率下降（与阶段0 报告对比）
- [ ] 存量小说回退路径正常
- [ ] typecheck 通过

---

## 阶段二：上下文分层缓存（解决缺陷 3 + 5 + 6）

> 把 GenerationContextPackage 字段按变化频率分层缓存，消除每章重复重查。

### 2.A 分层定义

| 层级 | 字段 | 缓存生命周期 |
|------|------|--------------|
| 批次稳定层 | world, bookContract, macroConstraints, storyMacroPlan, characterRoster, characterHardFacts, styleContext | 一个 pipelineJob |
| 卷稳定层 | volumeWindow, beat_sheet | 跨卷边界失效 |
| 每章变化层 | canonicalState, payoffLedger, factLedger, recentChapters, openConflicts, RAG, openingHint | 每章重查 |

### 2.B 实现

**文件**：`server/src/services/novel/runtime/BatchContextCache.ts`（新建）
- 生命周期绑定 pipelineJob（key = `novelId:jobId`）。
- 提供 `getStableLayer()` / `getVolumeLayer(volumeId)`，miss 时构建并缓存。

**文件**：`GenerationContextAssembler.assemble`
- 稳定层/卷层从 `BatchContextCache` 取；每章层仍实时查。
- 移除 `timelineContextService.buildForChapter` 调用（缺陷5，PR-B 已不消费）。
- 合并 `baseContextPackage` 与 `contextPackage`（缺陷6）：用单一对象 + 后置补字段（chapterWriteContext/rag/mission），消除字段手抄两遍。

### 2.C 失效与一致性
- 批次稳定层在 world/character/bookContract 被 Agent 工具修改时主动失效（监听现有事件总线 `novelEventBus`）。
- 卷层在跨卷时按 volumeId 切换。

### 阶段二验收
- [ ] 每章查询量从 15+ 降到 5-6
- [ ] timelineContext 构建从热路径移除
- [ ] 双 contextPackage 合并为单一构建
- [ ] 批次内修改世界/角色后缓存正确失效
- [ ] typecheck 通过

---

## 阶段三：执行流水线化（解决缺陷 4，可选增强）

> 写第 N 章时后台预取第 N+1 章的稳定层 + 可提前算的每章层。

### 3.A 部分预取

**文件**：`novelCorePipelineService.executePipeline`
- 第 N 章写作（LLM）期间，后台触发第 N+1 章的"批次稳定层 + 卷稳定层 + JIT task sheet"预取。
- 注意：第 N+1 章的 factLedger/canonicalState 依赖第 N 章 finalize 结果，**不能提前**；仅预取稳定部分。

### 3.B 协调
- 预取结果写入 `BatchContextCache`（阶段二基础设施）。
- 第 N+1 章正式组装时命中预取缓存，组装近乎瞬时。

### 阶段三验收
- [ ] 第 N+1 章组装命中预取缓存
- [ ] 整批吞吐提升（对比基线）
- [ ] 取消/失败路径下预取任务正确清理
- [ ] typecheck 通过

---

## 总体路线图与优先级

| 阶段 | 解决缺陷/根因 | 改动量 | 收益 | 顺序 |
|------|--------------|--------|------|------|
| 阶段0 诊断 | 根因归因 | 小 | 决策依据 | **最先** |
| 阶段一 懒规划 | 缺陷1+2、根因D（+A/B/E 子项） | 大 | 消除等待+提质+降债务 | 紧随 |
| 阶段二 分层缓存 | 缺陷3+5+6 | 中 | 降延迟降压力+清债务 | 独立 PR |
| 阶段三 流水线 | 缺陷4 | 中大 | 吞吐 | 验证一/二后 |

### 分支与提交策略（遵循 AGENTS.md）
- 每阶段独立 PR，feature 分支 → beta → main。
- 阶段0 可在当前 `feat/novel-fact-ledger` 分支续做（同源），或新开 `feat/quality-debt-attribution`。
- 阶段一新开 `feat/lazy-chapter-planning`。

### 风险登记
- 阶段一门控降级若 chapter_list 节奏锚点不足，JIT 生成质量可能下降 → 需保证 beat_sheet 锚点完整。
- 阶段二缓存失效遗漏会导致脏上下文 → 失效事件需全覆盖。
- 阶段三预取与取消竞态 → 需幂等清理。

### 待补充
- 阶段0 聚合报告产出后，回填"A/B/D/E 实际占比"，据此微调阶段一 1.D 子项范围。
