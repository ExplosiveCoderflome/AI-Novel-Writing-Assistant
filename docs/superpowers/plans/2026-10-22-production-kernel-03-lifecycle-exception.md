# 03 提交适配：G1 最小隔离方案

状态：2026-10-22 用户明确批准“该最小隔离方案，继续开发”。按本文范围实施新内核的原子正文保存；真实入口切换仍按后续计划验收。

## 已定位的限制

`server/src/services/novel/runtime/lifecycle/ChapterLifecycleService.ts:22` 的 `saveWorkingContent` 直接使用模块级 prisma，并且只以 `where: { id: chapterId }` 写入。它不接收事务客户端、expectedContent 或 expectedUpdatedAt。调用前做查询或 fence 后再调用该方法，仍可能覆盖两者之间的人工编辑，不能通过验收。

## 拟批准的最小范围

在 `modules/production/infrastructure/lifecycle/ProductionChapterLifecycleService.ts` 新增一个独立的内核正文保存入口，复制旧入口的非空校验与正文/状态更新责任，同时增加事务版本条件；预计 60～100 行。冻结目录零修改。旧入口继续服务旧链路。

核心写入必须等价于：

```ts
await prisma.$transaction(async (tx) => {
  await assertDurableOwnership(tx); // 由实际调用方的运行契约注入
  const claimed = await tx.productionUnitRun.updateMany({
    where: { id: run.id, version: run.version, activeRequestKey: requestKey },
    data: persistedProgressAndReceipt,
  });
  if (claimed.count !== 1) throw new ProductionVersionConflictError();
  const saved = await tx.chapter.updateMany({
    where: {
      id: run.progress.unit.chapterId,
      novelId: run.progress.unit.novelId,
      content: baseline.content,
      updatedAt: new Date(baseline.updatedAt),
    },
    data: { content, generationState, chapterStatus },
  });
  if (saved.count !== 1) throw new ProductionVersionConflictError();
});
```

进度回执和正文必须在一个事务里提交。模型调用在事务外；回填单独恢复。用量记录是事实，失权后仍能记账，不能被当作正文写入许可。

## 验收范围

- 只在新建临时 SQLite 测试：写入成功；正文已编辑时整体回滚；运行记录失权/版本过期时整体回滚；commit 后崩溃恢复只补回填。
- 复核冻结目录差异为空。
- 不连接已有作品库；不授权分支合入、开关启用或发布。

这属于路线图 G1 对“旧服务不满足需要时决定是否把实现复制进内核”的明确确认项。
