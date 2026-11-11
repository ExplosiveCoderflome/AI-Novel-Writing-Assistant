# manuscript / 长篇原稿修订边界

- domain/source：严格解码、原始 hash、完整 UTF-16 分区；不生成正文。
- application/Import：新建修订副本与一次性事务物化；永不覆盖其他 Novel。
- application/Workspace：只读投影、原文切片、有效目录与乐观版本快照。
- application/Baseline + Tasks：逐章全文证据抽取、持久进度/预算/执行权、A1 exact revision 确认及独立工作纲。
- application/Revision：复用章节编辑器、diff、手动正文 CAS 与同步 outbox；候选只预览，明确采纳只改当前章。
- application/Structure + Isolation：结构影响与工作纲修订原子采纳、可恢复停用、有效读取和导演写入隔离。
- http：项目/来源/单元/提案归属与 Zod 参数校验。

原稿与冻结基线均不是 runtime 事实。后文故事意图只作为全书约束，当前上下文以有效工作稿前文为权威。测试与截图必须 mock 模型；真实模型、beta 推送、发布均独立授权。详见 docs/wiki/workflows/manuscript-revision-b1.md。

- RevisionService 复用手动正文 CAS 与 outbox，永久 before/after 回执支持受版本保护的 Undo；采纳只接受持久 candidateId。
- StructureService 持有结构变更事务、sourceRanges 与独立工作纲 exact revision；Isolation 是旧导演/CRUD 拒绝及有效章读取边界。书架进度 SQL 也必须过滤逻辑停用单位。
- 修改前文使后续 artifact checkpoint 与提取时间线失效；TimelineFinalizationStore 在模型工作前捕获 B1 snapshot，chapterVersion 在同一项目锁内拒绝迟到派生写入。原稿、计划事实及后章正文不被清除。
