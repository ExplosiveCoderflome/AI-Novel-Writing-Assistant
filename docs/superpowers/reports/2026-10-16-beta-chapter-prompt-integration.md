# 章节保存与提示词优化：beta 集成验证

## 范围

- 集成基线：`11b682e1`（`main`、`beta` 与 `v0.5.11` 的共同提交）。
- 功能来源：`codex/prompt-workbench-clarity` 的 `96905f9b`，包含基线共同祖先 `e4420c4b` 之后的 7 个优化提交。
- 范围覆盖提示词常用调整／完整模板编辑、章节并发保存、人物资料与历史原子提交、时间线恢复、目录与导演只读查询、流式请求生命周期，以及对应质量检查。
- 本阶段目标仅为 beta 集成；不推进 main、不修改桌面版本、不创建发行标签、不触发桌面发布。

## 冲突处理与稳定边界

保存门面采用章节编辑模块的职责划分，将修复版的正文条件保存与持久修订登记移入 `ManualChapterStore`。正文、人物资料修订证明、时间线失效和两类同步任务在同一事务提交；后置派生写入不阻塞保存响应。

人物资料与事件／伏笔时间线保持各自责任：worker 同时支持两类任务并续期租约。V1 的兼容摘要与人物经历通过版本保护的投影存储处理，关闭额外后台调度，避免同次修订重复抽取；V2 的身份确认、运行归属和人工恢复锁保持不变。

回归同时检查仅正文保存容忍后台元数据变化、真实冲突拒绝、任务登记故障整体回滚、旧任务拒绝、A → B → A 修订、前置章节同步、原进度恢复和质量优先暂停。长期规则已同步到章节编辑与时间线模块说明及相关 wiki。

## 验证

| 检查 | 结果 |
| --- | --- |
| 服务端 TypeScript 构建 | `pnpm --filter @ai-novel/server build` 通过；此后只修改测试与文档，未改变服务端实现 |
| 服务端质量检查 | `pnpm --filter @ai-novel/server test:quality` 通过：369 项通过、2 项原有跳过、0 失败；包含代码政策、模块边界、Prompt、流式调用、保存／时间线／角色资料事务、导演恢复及迁移完整性 |
| 前端类型检查 | `pnpm --filter @ai-novel/client typecheck` 通过 |
| 前端聚焦回归 | `promptTemplateDrafts`、`promptWritingLabContracts`、`directorChapterEditing` 共 34 项通过 |
| 桌面前端资源构建 | `pnpm --filter @ai-novel/client exec node scripts/build-desktop.mjs` 通过，复用前述同源类型检查；保留既有 Browserslist 与大 bundle 提示 |
| 文档注册 | `pnpm check:docs-manifest` 通过：36 篇文档、17 个导演进度键 |

首轮质量检查的 7 项失败来自旧测试数据：流水线 mock 未返回查询要求的同步记录数组，以及事务断言仍假定只有一个后台任务。修正测试数据后重新运行完整质量检查通过，没有放松生产契约或关闭失败用例。

共享代码、依赖锁文件、Prisma schema/migrations 和桌面主进程均未改变，复用本会话修复版的共享构建、SQLite client 与桌面主进程构建。数据库回归只使用内存或新建临时数据库，模型使用替身。

本机日志目录：`C:\Users\李皮\AppData\Local\Temp\beta-chapter-prompt-1792084387027`。最终结果见 `server-quality-final.log`、`client-check.log` 和 `client-build.log`。

## 验收边界

没有执行浏览器、截图、真实模型或桌面安装包验收；由用户在 beta 检查提示词编辑与章节保存／导演继续的真实交互。没有重复运行完整全仓测试或桌面打包。发布的 `v0.5.11` 标签保持原提交，本报告的组合优化属于后续 beta 候选。
