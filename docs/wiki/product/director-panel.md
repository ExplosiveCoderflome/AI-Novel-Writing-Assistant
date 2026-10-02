# 自动导演台与运行记录的展示边界

## Background

自动导演会跨越规划、资产准备和正文批次。新手需要在小说上下文中知道 AI 正在做什么，以及自己是否需要操作；历史运行记录则只负责追溯事实。把两者放在同一张任务操作页，会让用户离开创作现场，也会把暂停、质量提醒和失败混成一个问题。

## Decision

- 小说导演台采用“小说上下文优先”的侧边布局，入口为 `/lab/director/:novelId`；桌面端显示右侧窄面板，移动端改为全屏段落。
- `/lab/director` 是跨书运行记录，只读展示状态、进度、错误、来源路由和需要处理筛选，不承载继续、恢复、取消、重试或重规划。
- 导演台的展示模型只消费后端 `DashboardView`，固定分为“正在做什么 / 需要你做什么 / 质量债 / 时间线”，诊断信息折叠展示。
- 主按钮只能来自 `availableActions` 中标记为主动作的结构化动作；`navigate` 只跳转到来源页，`command` 只在小说导演台提交。

## Current Rule

运行记录页面不得根据原始运行字段推断主状态，也不得放置改变任务状态的按钮。来源页负责展示动作的影响范围，并在命令提交后刷新导演台摘要和详情。

## Failure Modes

- 把运行记录做成恢复工作台：检查页面是否出现继续、恢复、重试、取消或重规划按钮。
- 前端根据 `status`、`pause` 或 `cursorStepId` 猜测主按钮：应改为读取 `DashboardView` 的 `headline`、`mode`、`progress` 和 `availableActions`。
- 移动端仍保持桌面侧栏：导演台应在窄屏变为完整宽度的连续信息段，保证新手能读懂当前动作和下一步。

## Related Modules

- `client/src/components/directorNext/DirectorBadge.tsx`
- `client/src/components/directorNext/DirectorPanel.tsx`
- `client/src/pages/directorNext/DirectorRunHistoryPage.tsx`
- `client/src/pages/directorNext/DirectorNovelPage.tsx`
- `server/src/modules/director/domain/projection.ts`
