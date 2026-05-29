# 章节 Runtime 边界

## 背景

章节正文生成链路同时承担流式生成、空稿重试、正文接收门禁、时间线检测、终稿定稿、资产同步和 pipeline 批量适配。`ChapterRuntimeCoordinator` 作为单文件承载这些职责时，任一入口都容易绕开统一链路，导致手动生成、自动导演和 pipeline 的行为分叉。

Phase 5 后，`ChapterRuntimeCoordinator` 只保留稳定门面和 3 个公开入口，具体执行由 runtime 内部子模块承接。外部调用方不应感知这些内部拆分。

## 当前规则

- 外部入口只能依赖 `ChapterRuntimeCoordinator` 的 `createChapterStream`、`createRepairStream`、`runPipelineChapter`。
- `ChapterStreamGenerationOrchestrator` 拥有手动生成流、空稿重试、SSE 状态和运行前事实门禁。
- `ChapterQualityGateService` 拥有 acceptance 与 timeline 双门禁、cache key 和门禁 trace。
- `ChapterContentFinalizationService` 拥有终稿定稿、runtime package 组装、章节状态推进、timeline finalization 和延迟资产同步。
- `ChapterPipelineRuntimeAdapter` 只负责把 pipeline hooks 适配到统一章节 runtime，不复制 writer、门禁或定稿逻辑。
- `chapterRuntimePackageBuilders.ts` 只放无 IO 构建函数，不允许引入 Prisma、route、director 或服务单例。
- `ChapterRepairStreamRuntime` 仍是修复流实现边界，暂不在 Phase 5 拆分；门面只继续委托它。

## 失败模式

- route、director 或旧 service 直接 import `ChapterQualityGateService` / `ChapterContentFinalizationService`，说明外部开始深链到 runtime 内部。
- runtime package builder 引入数据库或服务单例，说明纯函数构建层重新混入 IO。
- pipeline adapter 复制生成或定稿逻辑，说明批量执行路径重新分叉。
- coordinator 重新增长到 700 行以上，说明门面再次吸收了内部职责。

## 相关模块

- `server/src/services/novel/runtime/ChapterRuntimeCoordinator.ts`
- `server/src/services/novel/runtime/ChapterStreamGenerationOrchestrator.ts`
- `server/src/services/novel/runtime/ChapterQualityGateService.ts`
- `server/src/services/novel/runtime/ChapterContentFinalizationService.ts`
- `server/src/services/novel/runtime/ChapterPipelineRuntimeAdapter.ts`
- `server/src/services/novel/runtime/chapterRuntimePackageBuilders.ts`
