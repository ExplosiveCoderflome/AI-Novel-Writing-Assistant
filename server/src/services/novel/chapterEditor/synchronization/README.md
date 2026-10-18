# 正文修订同步

本模块承接作者正文保存到后续创作的衔接，不拥有正文生成、自动修文、导演状态迁移或新 Prompt。

- `ManualChapterSyncStore`：正文事务内登记修订和持久 outbox，保留历史完成记录但取消同正文旧修订的有效性。
- `ManualChapterSyncLease`：按章节串行处理跨进程修订，心跳与超时回收保护后续修订的应用顺序。
- `ManualChapterSyncService`：读取当前正文和导演归属，调用既有 AI 资料同步链；显式继续时等待当前修订完成，重试未完成消费者，兼容旧客户端保存记录。

外部调用通过 `index.ts`。CRUD 只登记责任；side-effect worker 执行有限重试；生产执行器和门控预处理可以等待同步。查询接口不得调用 `ensureCurrent`，同步模块不得清除人工暂停或写入生成正文。

## 手动修订的执行权限

最近运行提供模型及创作方式快照，不提供生产执行许可。即使批次完成、取消、失败、暂停或等待确认，当前作者修订仍可同步资料。`revisionGuard` 贯穿候选身份、出场与位置消费者；最终写入事务通过 `runtime/artifactSync/contracts` 校验完整 metadata 中的 revision/attempt、当前正文、检查点及本书 epoch，旧执行不能写入新修订。只传 revision 字符串不能授权写入。

消费者不能因此放开普通生产的停止检查，也不能改写运行状态。人物候选继续归属当前运行及其确认方式；AI 认为需要作者确认时保留原有确认流程。

重试复用成功抽取和消费者，不复用其他修订的完成边界。`revisionGuard` 是内部持久记录的执行证明，不接受 HTTP 客户端直接传入。V1 的摘要和人物经历通过本模块的 `ChapterArtifactProjectionService` 及其版本保护存储处理，关闭额外后台调度；V2 走结构化资产消费者及人物确认流程。

`ManualChapterStore` 在同一正文事务内登记本模块任务和事件／伏笔时间线任务。后者由 `modules/timeline` 与 `ChapterTimelineFinalizationService` 拥有；人物资料完成证明不能替代事件时间线完成证明。两类任务分别保留租约、版本检查和重试入口，查询投影不能代替显式继续执行同步。

完整契约和排查顺序见 [正文章节编辑闭环](../../../../../../docs/wiki/workflows/chapter-editor.md)。
