# Task Queue 展示边界

本目录提供任务队列的摘要、列表项、状态标签、内容分区和动作后果行。

- 组件只消费页面已经决定好的 `WorkspaceTone`，不通过关键词或错误文案猜测业务状态。
- `danger` 用于结构化阻塞/失败，`warning` 用于质量提醒，`info` 用于待操作或进行中，`success` 用于完成。
- `TaskQueueSeverityBadge`、`TaskQueueImpactNotice` 和 `TaskQueueEmptyState` 统一使用 `blocking | quality | normal` 展示合同；运行中、待操作等运行状态另用状态标签表达。
- 身份解析仍由页面和 API 合同负责；本目录不得把 `workspaceTaskId` 当作 `directorTaskId`。
