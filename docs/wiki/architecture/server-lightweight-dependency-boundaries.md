# 服务端轻量契约与执行装配边界

## 背景

模板运行、生产状态投影、事件发布和正文版本校验都位于高复用路径。如果这些读取或发布能力导入执行装配入口，模块求值就会反向加载业务 prompt、导演执行器和资产恢复服务，导致循环依赖与意外构造开销。

## 当前规则

- Prompt 的上下文需求推导属于声明处理，使用 `prompting/context/promptContextRequirements.ts`。这个入口只能依赖类型。实际解析才使用 `promptContextResolution.ts`；兼容重导出不能成为新模板调用方的入口。
- 导演事实投影消费 `DirectorFactReadPort`。默认读取器只组织已存在的规划读取与进度检查能力，不能构造完整导演执行 runtime，也不能通过完整小说核心服务取得两个列表。执行器可凭结构兼容向投影提供读取端口，投影不反向依赖执行器实现。
- 小说业务发布事件使用 `events/publisher`，持久副作用入队使用 `events/sideEffects/queue`。handlers 注册与 worker 启动由应用装配负责。旧宽门面仅供兼容，不能作为新发布方的依赖。
- 正文 hash、版本错误和资产边界解释使用 `runtime/artifactSync/contracts`；契约入口不能导出恢复、抽取或 checkpoint 持久化编排。
- 人工章节写入通过 `chapterEditor` 门面，复杂目录查询通过 `catalog` 门面。应用服务编排业务动作，明确归属的持久化模块拥有条件写入及事务；不要求简单单表 CRUD 套用通用仓库。
- 时间线最终提交由 `modules/timeline` 门面提供存储能力；运行时不能跨层取得事务客户端。状态提案领域校验、应用分派、JSON 映射及条件写入分属 `state/domain`、`state/application`、`state/persistence`。

## 失败模式与验证

不要用延迟 `require` 隐藏循环：它改变触发时间，未改变责任归属。先检查是否把纯声明处理放进了装配模块，或为了两个读取方法构造整个执行服务。

`server/tests/serverDependencyBoundaries.test.js` 使用 TypeScript 实际发射后的依赖验证轻门面传递依赖，并独立执行需求推导，避免将 type-only import 误当成运行时边。范围覆盖 Prompt 模板、小说事件、角色资源与状态提交的版本校验，以及导演事实投影；不改变任务恢复和章节质量策略。
