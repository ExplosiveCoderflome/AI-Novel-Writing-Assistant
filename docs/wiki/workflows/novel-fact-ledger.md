# 事实账本（Novel Fact Ledger）

## 背景

当前 timeline 模块对写章的介入效果有限（见 [timeline 诊断](../prompts/novel-generation-quality-guards.md)），
且其功能与 PayoffLedger、ChapterMission、ObligationContract 等模块大量重叠。

事实账本是对 timeline 写章介入的替代方案：用一个极简的"已发生不可逆事实列表"
防止 LLM 在后续章节重复写出已发生的事件，而不依赖 LLM 事后抽取。

## 核心原则

> 事实由规划链路写入，不由 LLM 从正文抽取。

- 无额外 LLM 调用
- 数据来源于已有的义务合同（ObligationContract）和伏笔指令（PayoffDirective）
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

**触发时机**：章节接收通过后（`ChapterContentFinalizationService.finalizeChapterContent`），
与 timeline finalization 同步触发，异步执行，失败不影响主流程。

**数据来源**（均来自 `chapterWriteContext`）：

| 来源 | category | 示例 |
|------|----------|------|
| `obligationContract.mustHitNow` 中的条目 | `completed` | "第7章已完成：取得个体户执照" |
| `payoffDirectives[operation=payoff]` | `revealed` | "第12章已完全揭示：幕后主使身份" |
| `payoffDirectives[operation=partial_reveal]` | `revealed` | "第9章已部分揭示：灰棉袄的真实目的" |

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
- `server/src/services/novel/runtime/ChapterContentFinalizationService.ts`（写入触发）
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`（读取注入）
- `server/src/prisma/schema.prisma`（NovelFactEntry 模型）
- `shared/types/chapterRuntime.ts`（completedMilestones 字段，已有）

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
