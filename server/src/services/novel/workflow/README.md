# Novel Workflow Service Boundary

`NovelWorkflowService` 是对外门面。内部职责按三块拆分：

- `store / projection`：任务可见性、读模型、持久化更新、通知投影所需的底层读写。
- `healing`：恢复、纠偏、历史失败态修复、自动导演状态对齐。
- `application`：bootstrap、状态迁移、checkpoint、重试和恢复命令。

外部模块只应依赖门面，不应深链到具体实现文件。
