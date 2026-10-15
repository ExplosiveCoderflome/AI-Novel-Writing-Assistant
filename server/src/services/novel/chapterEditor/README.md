# 章节编辑的保存边界

## 职责

本模块拥有人工章节编辑。`index.ts` 向小说门面提供保存、更新、移除和旧式派生资料同步；正文生成、审校与定稿仍由 `runtime/lifecycle` 和 `runtime/artifactSync` 拥有，编辑入口不得推进生产终态。

- `domain/` 定义空白章节移除条件与已有摘要投影规则，不访问数据库。
- `application/ManualChapterService` 编排正文保存、尽力执行的卷工作区镜像和检索通知，不在成功保存后等待派生资料写入。
- `application/ChapterArtifactProjectionService` 组装旧式摘要、事实、角色经历。持久修订任务调用它时关闭额外后台调度，避免重复抽取；这里保留兼容投影，不新增正文语义判断规则。
- `persistence/ManualChapterStore` 拥有正文／编辑版本比较、条件写入、条件删除，以及正文变化时两类持久同步责任。
- `persistence/ChapterArtifactProjectionStore` 在正文版本检查与同一事务内替换派生记录，过期输入不覆盖新稿资料。
- `synchronization/` 拥有章节与人物资料修订的恢复、版本证明和运行归属；事件／伏笔时间线仍由 `modules/timeline` 拥有。

## 事务约束

正文、修订证明、旧时间线失效、`manual_pending` 及 `chapter.manualSync` / `chapter.timelineFinalization` 两类持久任务必须共同成功或回滚。不能把登记任务移动到事务之后，否则进程中断会遗失同步责任。仅正文请求使用原文条件保护，混合字段和旧调用方继续使用编辑版本保护。

摘要、角色经历和 AI 抽取在持久任务中执行，失败保留已保存正文并重试，不能使 HTTP 保存响应变成失败。卷镜像与 RAG 保持既有提交后通知行为；继续导演前由现有资料恢复和时间线准备入口分别确认就绪，两类完成证明不能互相替代。

移除空白章节先做纯规则判断，再按已读取字段执行条件删除。规则检查与删除之间新增的正文或规划不得被删除。

## 维护

兼容文件 `novelChapterArtifacts.ts` 只转发能力；新增持久化不得回流 `NovelCoreCrudService`。回归使用隔离 SQLite 注入任务登记故障，验证正文及派生状态一起回滚。
