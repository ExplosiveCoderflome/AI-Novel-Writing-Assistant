# Novel Workflow Service Boundary

`NovelWorkflowService` 是对外门面。内部职责按三块拆分：

- `store / projection`：任务可见性、读模型、持久化更新、通知投影所需的底层读写。
- `healing`：恢复、纠偏、历史失败态修复、自动导演状态对齐。
- `application`：bootstrap、状态迁移、checkpoint、重试和恢复命令。
- `taskCreation`：组装不同创建入口共用的任务初始字段；调用方仍负责各自的事务和恢复路由。

外部模块只应依赖门面，不应深链到具体实现文件。

自动导演状态写入由 `director/state/DirectorTaskStateWriter` 统一入口管理，再委托给本模块的应用服务或存储服务。通用工作流方法不得隐式解除自动导演的 `pendingManualRecovery`；只有带持久化用户命令编号的显式恢复写入可以解除。
