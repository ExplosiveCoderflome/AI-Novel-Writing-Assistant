# 事实账本（Novel Fact Ledger）实施计划

## 目标
用一张极简的 `NovelFactEntry` 表替代 timeline 对写章的介入，
让 `ChapterWriteContext.completedMilestones` 得到真实填充，防止剧情重复。

## 分支
`feat/novel-fact-ledger`（从 feat/novel-generation-quality-guards 切出）

---

## PR-A：事实账本核心（本次实施）

### Task 1 — Prisma schema + migration
- 在 `server/src/prisma/schema.prisma` 末尾新增 `NovelFactEntry` 模型
- 字段：id / novelId / chapterOrder / text / category(completed|revealed|state_changed) / source(auto|manual) / createdAt
- 在 `Novel` 模型加反向关联 `factEntries`
- 运行 `pnpm --filter @ai-novel/server prisma migrate dev --name add_novel_fact_entry`

### Task 2 — NovelFactService
- 新建 `server/src/services/novel/fact/NovelFactService.ts`
- 方法：
  - `writeCompletedFacts(novelId, chapterOrder, items: string[])` — 来自 mustHitNow/payoff
  - `listForChapter(novelId, beforeOrder)` — 返回全量 completed/revealed + 近 15 章 state_changed
- 导出单例 `novelFactService`

### Task 3 — 写入路径：章节接收后自动写入
- 修改 `ChapterContentFinalizationService`
  - 注入 `novelFactService`
  - 在章节接收通过（`acceptedAt` 写入）后，从 `contextPackage.obligationContract.mustHitNow` 提取已完成条目写入
  - 同时从 `contextPackage.payoffDirectives` 中 `operation=payoff|partial_reveal` 的条目写入（category=revealed）

### Task 4 — 读取路径：填充 completedMilestones
- 修改 `GenerationContextAssembler.buildForChapter`
  - 调用 `novelFactService.listForChapter(novelId, chapterOrder)`
  - 将结果映射为 string[] 填入 `completedMilestones`（已有字段，当前为 []）

### Task 5 — typecheck + wiki + release notes + commit

---

## PR-B：移除 timeline 写章介入（后续 PR）

- `chapterWriter.prompts.ts` → `requiredGroups` 移除 `timeline_context`
- `ChapterContentFinalizationService` → 移除 `timelineFinalizer` 依赖
- `ChapterStreamGenerationOrchestrator` → 移除 `ensurePreviousChapterFinalized` 调用
- Timeline DB 表保留，前端展示不动

---

## 验收标准
1. TypeScript typecheck 无错误
2. 新章节生成时 `completedMilestones` 字段不再是空数组
3. `timeline_context` block 仍存在但 PR-B 后从 requiredGroups 移除
