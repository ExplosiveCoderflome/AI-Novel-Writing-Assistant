# 读路径性能边界

## Background

首页、侧边栏、模型选择初始化、任务恢复提示和小说列表会在用户打开应用时同时加载。如果这些接口在读取时顺手执行远程探测、状态修复、全量详情组装或大列表投影，首屏会被最慢的后台能力拖住。SQLite 本地库变大后，这类问题会被放大为明显的接口排队和页面空白等待。

## Decision

首屏和导航徽章使用的读路径必须保持轻量、可缓存、低副作用。需要远程 I/O、状态修复、模型目录刷新、任务恢复初始化、全量详情解释或大对象组装的能力，必须放到显式用户动作、详情页、后台任务或延迟加载中。

## Current Rule

- `GET /api/settings/api-keys` 只返回本地可用的厂商配置状态、当前模型、启用状态、基础模型候选和图像模型配置，不在首屏读取时远程请求各厂商 `/models`。模型目录刷新走单厂商的 `refresh-models` 动作。
- 自动导演跟进 overview 只做轻量投影和计数，不在 overview 请求中批量执行 `healAutoDirectorTaskState`。状态修复属于详情页、后台恢复或显式继续动作。
- 恢复候选列表直接从任务表投影 summary 字段，不再对每个候选调用任务详情聚合。恢复初始化在启动后台执行，不应阻塞 HTTP 列表读取。
- 小说列表默认按分页读取列表 DTO。列表读取不负责自动修复任务状态；任务状态修复应由详情页、后台协调器或明确操作触发。
- 前端全局布局中的徽章、恢复提示和模型配置 bootstrap 应分级加载，避免与当前页面主数据争抢首屏网络和数据库资源。

## Examples

- 设置页打开时可以先看到厂商是否已配置、当前模型和 API 地址；用户点击“刷新模型”时再访问远程模型目录。
- 侧边栏只需要任务数量和跟进数量时，不应触发自动导演任务修复、章节扫描或模型连通性探测。
- 恢复入口只展示可恢复任务摘要；用户点击恢复后再进入对应恢复命令链路。待恢复任务不应在任意页面自动弹出模态框阻断当前流程，应通过小说列表、任务中心或对应工作台的显式入口打开详情。

## Failure Modes

- 如果 `api-keys` 读取又变慢到秒级，优先检查是否重新引入了远程模型目录请求。
- 如果跟进 overview 稳定超过数百毫秒，优先检查是否在读路径批量 heal、逐书查询自动通过记录，或取了任务大字段。
- 如果打开任意页面都会打大量任务和模型接口，优先检查 `AppLayout`、`Sidebar`、`TaskRecoveryProvider` 和 `LLMSelectionBootstrap` 是否绕过了分级加载。

## Related Modules

- `server/src/routes/settings.ts`
- `server/src/services/task/autoDirectorFollowUps/AutoDirectorFollowUpService.ts`
- `server/src/services/task/RecoveryTaskService.ts`
- `server/src/services/novel/novelCoreCrudService.ts`
- `client/src/components/layout/`
- `client/src/pages/novels/NovelList.tsx`
