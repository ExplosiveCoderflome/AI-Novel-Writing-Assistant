# 角色资源模块边界

角色资源账本为章节写作提供可行动资源、归属和可见性约束。HTTP 层只处理参数校验、调用与响应映射，不能持有章节查询、AI 提取与状态提交循环。

## 应用编排

- `application/CharacterResourceApplicationService.ts` 拥有人工提取、最近章节回填、提案确认和忽略的用例，以及用例完成后的账本投影。
- 回填先选择最近的非空章节，再按章节顺序逐章提取并提交；后章提取应能看到前章提交结果，不可将整个循环改成并行调用。
- 提取服务负责 AI 提案，`StateCommitService` 负责校验与提交，应用服务不得直接写账本绕过状态提交。
- 确认和忽略限定到同一本小说、角色资源类型、待审核状态；确认仍使用既有提案提交入口。
- 外部 HTTP 模块通过本目录 `index.ts` 获取应用入口和账本查询入口，不依赖应用内部文件。

## 持久化与 AI 适配

`CharacterResourceExtractionService`、`CharacterResourceLedgerService` 等现有服务继续持有各自的提取、账本查询和存储职责。应用服务复用这些服务，不引入另一套状态提交协议。

## 验证

`server/tests/aiDecisionResourceBoundaries.test.js` 使用源码加载与显式依赖替身检查章节顺序、结果统计、提取提交边界及提案范围；它不会连接真实数据库或调用模型。
