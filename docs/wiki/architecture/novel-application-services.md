# Novel 应用能力层边界

## 背景

`NovelService` 曾通过多层继承同时暴露项目基础、章节、规划、审核、流水线、角色、卷规划、故事线、世界切片和章节编辑能力。调用方拿到完整 God Object 后，很难判断自己真正依赖哪些能力，也容易在路由、任务中心、导出、自动导演等入口继续扩写同一个门面。

Phase 4 后，小说业务入口改为组合式 application capability。`NovelService` 只保留为兼容 facade，不再作为新代码的默认依赖。

## 当前规则

- 生产代码应通过 `getSharedNovelServices()` 获取进程级能力集合，再用 `Pick<NovelApplicationServices, ...>` 或显式端口注入所需方法。不要在路由、任务中心、导出、Agent tools、自动导演或事件处理器中直接调用 `createNovelApplicationServices()`。
- `createNovelApplicationServices()` 只作为底层工厂保留，允许用于测试隔离、`NovelService` deprecated 兼容 facade，以及明确标记的遗留兼容层。新增业务入口必须依赖共享 application services 或显式注入 capability port。
- `routes/` 只能依赖当前 HTTP 映射需要的最小能力，不允许 import 或 new `NovelService`。
- 后台任务、导出、Agent tools、自动导演和事件处理器也应依赖能力端口，不应持有完整 `NovelService`。
- `NovelService`、`NovelPipelineService`、`NovelReviewService`、`NovelGenerationService`、`NovelArtifactService` 都是兼容层；可以为了旧测试或旧外部调用保留方法，但不能再互相继承形成能力链。
- 章节生成、章节修复、章节计划和重规划仍必须进入统一 production orchestrator / stage runner；能力层只负责组合和委托，不复制执行实现。

## 失败模式

- 路由测试需要 mock 业务能力时，应 patch `DefaultNovelApplicationServices.prototype`，不要再 patch `NovelService.prototype`。
- 如果新增路由为了方便直接注入完整能力集合，后续会再次退化为 God Object。新增路由时先列出实际调用的方法，再声明最小 `Pick<>`。
- 如果内部服务重新 `new NovelService()`，说明它没有定义自己的端口边界，应改为注入具体 capability。

## 相关模块

- `server/src/services/novel/application/`
- `server/src/services/novel/NovelService.ts`
- `server/src/routes/novel*.ts`
- `server/src/services/novel/director/`
- `server/src/services/task/`
- `server/src/modules/export/`
