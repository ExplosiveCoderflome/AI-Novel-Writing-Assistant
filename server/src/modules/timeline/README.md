# 时间线模块边界

- `timeline.service.ts` 拥有结构化事件、钩子和时间锚点的领域写入规则；钩子承接只接受 AI 提供且属于上下文的 ID。
- `timeline.repository.ts` 拥有持久化映射，接受事务客户端，使事件、钩子、锚点和外部 checkpoint 可以共同提交。
- `application/manualContent.ts` 在正文保存事务内登记失效和持久同步责任，不调用模型。
- `persistence/chapterVersion.ts` 拥有派生记录的版本失效及提交时的正文检查。旧自动事件保留历史状态，作者和规划事件不变。
- 小说生产运行时通过 `index.ts` 使用本模块；时间线模块不反向导入章节运行时。模型抽取与最终 checkpoint 编排由 `ChapterTimelineFinalizationService` 拥有。

正文保存、后台同步和下一章准备的约束见 [人工正文保存与时间线版本边界](../../../../docs/wiki/workflows/manual-chapter-timeline.md)。
