# 章节编辑的保存边界

## 职责

本模块拥有人工章节编辑。`index.ts` 向小说门面提供保存、更新、移除和旧式派生资料同步；正文生成、审校与定稿仍由 `runtime/lifecycle` 和 `runtime/artifactSync` 拥有，编辑入口不得推进生产终态。

- `domain/` 定义空白章节移除条件与已有摘要投影规则，不访问数据库。
- `application/ManualChapterService` 编排保存后的资料同步、卷工作区镜像和检索通知。
- `application/ChapterArtifactProjectionService` 组装旧式摘要、事实、角色经历，并安排后台 AI 同步。这里保留兼容投影，不新增正文语义判断规则。
- `persistence/ManualChapterStore` 拥有编辑版本比较、条件写入、条件删除，以及正文变化时的持久时间线同步责任。
- `persistence/ChapterArtifactProjectionStore` 在正文版本检查与同一事务内替换派生记录，过期输入不覆盖新稿资料。

## 事务约束

正文、旧时间线失效、`manual_pending` 和持久任务必须共同成功或回滚。不能把登记任务移动到事务之后，否则进程中断会遗失同步责任。

摘要、角色经历、卷镜像、RAG 和后台 AI 同步在正文提交后执行。它们不是编辑保存事务的一部分，失败不能通过重新写旧正文来补偿。卷镜像保持既有尽力同步行为；需要严格成功的资料由生产运行时闭环处理。

移除空白章节先做纯规则判断，再按已读取字段执行条件删除。规则检查与删除之间新增的正文或规划不得被删除。

## 维护

兼容文件 `novelChapterArtifacts.ts` 只转发能力；新增持久化不得回流 `NovelCoreCrudService`。回归使用隔离 SQLite 注入任务登记故障，验证正文及派生状态一起回滚。
