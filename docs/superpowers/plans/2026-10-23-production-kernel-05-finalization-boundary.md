# 05 最终审校与生命周期闭合：G1 最小补充方案

状态：2026-10-23 用户明确批准“该最小终态隔离方案，继续开发”；05 四项已列决策差异已获批，不重复确认。按本文范围实施，冻结目录零修改。

## 已证实的缺口

新内核使用 `persist: false` 评估原稿和候选，避免未选稿污染正式报告。但提交之后没有发布选中稿的 AuditReport/AuditIssue，也没有在资产完成后发布 approved/reviewed。旧实现位于冻结的 ChapterAcceptanceAssessmentService 和 chapterRuntimePipeline；其全局数据库、独立事务和缺少当前内核租约注入的边界不能直接复用。

## 最小隔离范围

在 `modules/production/infrastructure/lifecycle/` 增加事务绑定的选中稿报告写入，并由 ProductionChapterLifecycleService 提供终态入口。预计新增 100～180 行，按职责拆分，每文件不超过 400 行。仅移植所选审校报告及其审校来源冲突投影的持久化责任；不复制模型调用、策略决策、旧流水线或自动继续。

由 PrismaUnitProgressStore 在 reconcile 结果保存的同一事务调用：

```ts
await assertOwnership(tx, identity);
const claimed = await compareAndSwapProgress(tx, expected, next);
if (!claimed) return null;
if (next.progress.reconcileStatus === 'completed' || next.progress.reconcileStatus === 'degraded') {
  await lifecycle.finalizeSelected(tx, expected, next);
}
```

终态入口验证所选稿、commit、reconcile 与当前原文哈希；条件锁定章节，写所选 accept/verify 结果，更新对应审校报告/问题/冲突投影，最后写 approved/reviewed。不可用检查保留无评分与复查债务，不能伪造 accepted；pending/failed 不发布终态。只有该同事务 CAS 成功才产生一次副作用，崩溃后恢复读成功回执。冻结目录零修改。

## 验收

使用完整 schema 的全新临时 SQLite，覆盖原稿/候选各自正确报告、拒绝候选不覆盖原稿报告、检查不可用不发布分数、pending 不发布完成、正文编辑/租约失效/写入失败整体回滚、CAS 重放不重复报告；接入 05 三章批次测试。新完成读取认 ProductionUnitRun 的当前正文闭合合同，不伪造旧 GenerationJob。

按路线图 G1 和 03 Task 3 的明确规则，冻结旧服务不能直接复用时，扩大复制责任前确认此具体范围。批准不授权修改冻结目录、真实数据库迁移、开关启用、分支整合或发布。其他已批准的接线、兼容行为修复及测试可独立继续。
