# 事实账本（Novel Fact Ledger）

## 背景

当前 timeline 模块对写章的介入效果有限（见 [timeline 诊断](../prompts/novel-generation-quality-guards.md)），
且其功能与 PayoffLedger、ChapterMission、ObligationContract 等模块大量重叠。

事实账本是对 timeline 写章介入的替代方案：用一个极简的"已发生不可逆事实列表"
防止 LLM 在后续章节重复写出已发生的事件。事实账本只记录已经被验收或正文观测确认的事实，
不能把写前计划、章节义务或伏笔指令本身当成已经发生的事实。

## 核心原则

> 事实由验收覆盖或正文观测确认后写入，不由写前指令直接推断。

- `mustHitNow` 只在章节接收闸门确认覆盖后写入 `completed`
- 接收闸门不可用时不写入义务事实，因为系统没有核实正文是否兑现
- `payoffDirectives` 是给作者的写前指令，不是“已揭示”观测；不得直接写入 `revealed`
- 正文即兴硬事实可由章节摘要的 `concreteFacts[]` 观测结果写入
- 幂等写入，不产生重复条目

## 数据模型

```prisma
model NovelFactEntry {
  id           String   @id @default(cuid())
  novelId      String
  chapterOrder Int      // 事实发生在第几章
  text         String   // 一两句话描述，如"第7章已完成：陈建国取得个体户执照"
  category     String   // completed | revealed | state_changed
  source       String   // auto | manual
  novel        Novel    @relation(...)
  createdAt    DateTime @default(now())
}
```

category 说明：
- `completed`：过程性目标已完成（证件、合同、任务）
- `revealed`：信息已揭示（身份、秘密、真相）
- `state_changed`：不可逆状态变化（人物死亡、关系破裂）

## 写入路径

**触发时机**：章节接收通过后（`ChapterContentFinalizationService.finalizeChapterContent`）。
义务事实写入会先于章节摘要执行并被 `await`，保证下一章 JIT 组装前账本已就绪；
写入失败只记录告警，不阻断章节定稿。

**数据来源**：

| 来源 | category | 示例 |
|------|----------|------|
| `obligationContract.mustHitNow` 中被 `obligationCoverage` 确认为已覆盖的条目 | `completed` | "第7章已完成：取得个体户执照" |
| 章节摘要 / 正文观测抽取出的硬事实 `concreteFacts[]` | `completed` / `revealed` / `state_changed` | "主角承诺三日内交付第一批样品" |

### 验收覆盖过滤规则

- `obligationCoverage.status === "satisfied"`：放行全部非空 `mustHitNow`。
- `obligationCoverage.status === "partial"`：只剔除 `missing.kind === "must_hit_now"` 能匹配到的义务；匹配使用去空白标点后的双向包含和字符 n-gram 相似度。
- `missing.kind === "must_hit_now"` 无法匹配回原文时，按保守原则剔除相似度最高的一项，并写入结构化告警。
- `obligationCoverage.status === "unmet"`：跳过全部 `mustHitNow` 写入。
- `riskTags` 含 `acceptance_gate_unavailable`：跳过全部 `mustHitNow` 写入。

被剔除的义务不会重复写入事实账本；它们已经通过接收闸门的 missing obligation 进入 review issue / quality debt 流。
终稿服务会为剔除项记录结构化日志，并通过 `continue_with_risk` director event 让任务中心可见。

手动写入：`NovelFactService.addManualFact()`（供未来 Agent 工具调用）。

## 读取路径

**触发时机**：`GenerationContextAssembler.buildForChapter` 组装章节写作上下文时。

**查询策略**：
- `completed` + `revealed`：全量返回（不限章节距离，里程碑性事实）
- `state_changed`：只返回最近 15 章内的条目

**注入位置**：`ChapterWriteContext.completedMilestones: string[]`

渲染效果（`chapter_mission` block 中）：
```
Already completed — do NOT re-pursue or re-trigger
- 第7章已完成：取得个体户执照
- 第12章已完全揭示：幕后主使身份
```

## 与 timeline 的边界

事实账本**不替代** timeline 的前端时间轴展示功能（`StoryTimelineEvent` 表保留）。
只替代 timeline 对写章上下文的介入（`timeline_context` block 在 PR-B 中从 requiredGroups 移除）。

## 相关模块

- `server/src/services/novel/fact/NovelFactService.ts`（读写服务）
- `server/src/services/novel/fact/factLedgerFilter.ts`（验收覆盖过滤）
- `server/src/services/novel/runtime/ChapterContentFinalizationService.ts`（写入触发）
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`（读取注入）
- `server/src/prisma/schema.prisma`（NovelFactEntry 模型）
- `shared/types/chapterRuntime.ts`（completedMilestones 字段，已有）

## 后续边界

`revealed` 类事实应来自 payoff ledger 状态迁移、timeline gate 的 resolved hook，或正文观测抽取结果。
如果未来接收闸门 schema 增加 `missingObligations[].sourceText`，`factLedgerFilter` 应优先使用精确源文本匹配，
并把相似度匹配降级为兼容旧缓存的兜底。

## PR-B 变更记录（已完成）

PR-B 目标：从写章路径彻底移除 timeline 干预，写章上下文不再有 `timeline_context` block。

已修改文件：

| 文件 | 变更内容 |
|------|---------|
| `chapterWriter.prompts.ts` | `requiredGroups` / `preferredGroups` / `contextRequirements` 移除 `timeline_context` |
| `ChapterContentFinalizationService.ts` | 移除 `timelineFinalizer` 依赖及 finalize 调用 |
| `ChapterStreamGenerationOrchestrator.ts` | 移除 `timelineFinalizer` 依赖及 `ensurePreviousChapterTimelineFinalized` 调用和方法 |
| `ChapterPipelineRuntimeAdapter.ts` | 移除 `timelineFinalizer` 依赖及 `finalizeChapterTimeline` callback |
| `ChapterRuntimeCoordinator.ts` | 移除 `timelineFinalizer` 可选依赖及向所有子服务的注入 |
| `ChapterRepairStreamRuntime.ts` | 移除 `timelineFinalizer` 可选依赖及修复通过后的 finalize 调用 |
| `chapterRuntimePipeline.ts` | 移除 `finalizeChapterTimeline?` 接口定义及两处调用点，移除 `shouldFinalizeDegradedForDeferredQualityDebt` 函数 |

> `ChapterTimelineFinalizationService` 本身及 `StoryTimelineEvent` 表保留，前端时间轴展示功能不受影响。
