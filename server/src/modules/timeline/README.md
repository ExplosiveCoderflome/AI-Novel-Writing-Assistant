# 时间线模块边界

- `timeline.service.ts` 拥有结构化事件、钩子和时间锚点的领域写入规则；钩子承接只接受 AI 提供且属于上下文的 ID。
- `timeline.repository.ts` 拥有持久化映射，接受事务客户端，使事件、钩子、锚点和外部 checkpoint 可以共同提交。
- `application/manualContent.ts` 在正文保存事务内登记失效和持久同步责任，不调用模型。
- `persistence/chapterVersion.ts` 拥有派生记录的版本失效及提交时的正文检查。旧自动事件保留历史状态，作者和规划事件不变。
- `persistence/TimelineFinalizationStore.ts` 拥有 checkpoint 领取、前置事实查询和最终提交事务；事件、钩子、时间锚点与成功 checkpoint 必须共同提交。它不调用 AI，也不选择质量策略。
- `domain/finalizationPolicy.ts` 提供上下文目标、降级锚点及超时政策。运行时决定何时抽取、等待、降级，再经 Store 提交，不能持有 Prisma 事务客户端。
- 小说生产运行时通过 `index.ts` 使用本模块；时间线模块不反向导入章节运行时。模型抽取与最终 checkpoint 编排由 `ChapterTimelineFinalizationService` 拥有。

领取 checkpoint 时，只有唯一键冲突表示已有执行者。数据库读取、连接或条件写入失败必须上抛，不能冒充“仍在运行”。领取后的并发成功不能被重新标记为运行中；只有未成功的记录或已过期的运行记录允许重领。`running/failed` 是事务外执行记录，不代表结果已经提交。

正文保存、后台同步和下一章准备的约束见 [人工正文保存与时间线版本边界](../../../../docs/wiki/workflows/manual-chapter-timeline.md)。
