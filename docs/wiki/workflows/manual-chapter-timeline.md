# 人工正文保存与时间线版本边界

## 背景与决定

章节编辑和模型生成都可能写同一章。仅在保存前比较版本，无法保护“检查之后、写入之前”的并发窗口；仅刷新摘要，也不能让下一章获得修订后的事件和伏笔。保存不能等待一次模型抽取，因此必须把正文版本保护、同步登记和实际抽取分开。

## 当前规则

1. `NovelCoreCrudService.updateChapter` 委托章节编辑模块保存。仅正文请求按 `expectedContent` 比较原文并原子写入，避免摘要更新误报冲突；混合字段与旧请求仍按 `updatedAt` 条件写入，时间戳至少前进一毫秒。真实冲突返回 409，由编辑页保留人工输入。
2. 删除空白手动章节时，写入条件必须包含判定可删除时看到的正文、状态和规划字段。只有条件删除成功，才能登记 RAG 删除。
3. 人工正文发生变化时，在保存事务内调用 `queueManualChapterTimeline`：旧抽取事件标为 `superseded`，本章产生的钩子标为 `dropped`，本章承接的前文钩子重新开放，并使本章时间锚点失效。作者或规划创建的事件保留。
4. 同一事务写入当前正文 hash 的 `manual_pending` checkpoint 和 `chapter.timelineFinalization` 持久作业，并登记人物资料的独立修订证明与 `chapter.manualSync` 作业。任一登记失败，正文与两类责任整体回滚。进程退出不应丢失同步责任；保存路径不调用模型或等待派生资料写入。
5. Worker 读取当前正文，仅处理任务 hash 仍匹配的版本。正文被新编辑替代时跳过旧任务；另一执行者正在同步时延后该作业。耗时抽取期间续期任务租约。
6. 实际抽取沿用 `ChapterTimelineFinalizationService` 与注册的时间线 Prompt。事件、钩子、锚点、完成 checkpoint 在同一事务提交，并对章节行做条件写入以锁住当前正文。同步不得推进编辑器的保存版本。
7. `ChapterExecutionPreparationService` 在规划和上下文组装之前检查前文待同步标记，并补齐上一章缺失的时间线。遇到已有同步者时等待其完成，读取到新正文则重新检查，不能把正常并发直接当成章节失败。等待上限与运行中 checkpoint 的 15 分钟失效窗口一致，异常占用不能无限等待。
8. 抽取或局部时间线检查失败沿用明确的 `degraded` 收尾。降级结果可用于继续写作，保留检查记录；它不是全书重规划或质量优先人工暂停的替代决定。

## 历史与恢复

- 自动事件和钩子保留历史行，通过状态排除过期结果，不删除用户正文或作者事件。
- 内容改回历史版本也必须重新登记同步：相同 hash 的旧成功记录不能证明当前有效事件仍然存在。
- 手动正文的旧摘要、事实及角色时间线写入也要在事务中检查正文版本，避免旧保存请求晚到时覆盖新派生资料。
- 该流程只刷新修订章节的派生时间线，不重新生成已经写好的后续章节，也不改写自动导演的人工恢复锁。

## 排查路径

先核对章节当前正文，再查看相同 hash 的 `manual_pending` 与 `stable/degraded` checkpoint，随后检查持久作业状态。不要删除 checkpoint 或重置数据库来绕过版本不一致。复现并发时使用隔离数据库，在两个保存请求之间设置读取屏障。

## 相关模块

- `server/src/modules/timeline/application/manualContent.ts`：保存事务内的同步登记。
- `server/src/modules/timeline/persistence/chapterVersion.ts`：派生数据失效与提交版本保护。
- `server/src/services/novel/runtime/ChapterTimelineFinalizationService.ts`：统一抽取、降级和写作前等待。
- `server/tests/novelProduction/manualChapterSaveSqlite.test.js`：真实 SQLite 的竞态、恢复、幂等及过期写入回归。
