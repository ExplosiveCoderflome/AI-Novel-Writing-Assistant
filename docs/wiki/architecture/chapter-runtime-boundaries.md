# 章节 Runtime 边界

## 背景

章节正文生成链路同时承担流式生成、空稿重试、正文接收门禁、时间线检测、终稿定稿、资产同步和 pipeline 批量适配。`ChapterRuntimeCoordinator` 作为单文件承载这些职责时，任一入口都容易绕开统一链路，导致手动生成、自动导演和 pipeline 的行为分叉。

Phase 5 后，`ChapterRuntimeCoordinator` 只保留稳定门面和 3 个公开入口，具体执行由 runtime 内部子模块承接。外部调用方不应感知这些内部拆分。

## 当前规则

- 外部入口只能依赖 `ChapterRuntimeCoordinator` 的 `createChapterStream`、`createRepairStream`、`runPipelineChapter`。
- `ChapterStreamGenerationOrchestrator` 拥有手动生成流、空稿重试、SSE 状态和运行前事实门禁。
- `ChapterQualityGateService` 拥有 acceptance 与 timeline 双门禁、cache key 和门禁 trace。
- `ChapterContentFinalizationService` 拥有终稿定稿、runtime package 组装、章节状态推进、timeline finalization 和延迟资产同步。
- `ChapterContentFinalizationService` 必须先完成当前正文版本的 timeline finalization，再推进章节状态或发出 `chapter:finalized`。正文通过接收闸门时提交 `stable`；正文可用但仍有局部质量债时提交 `degraded`，后续修复稿以新的 content hash 再升级为 `stable`。
- Timeline 抽取不参与正文接收裁决。`acceptance` 先给出正文质量结论，timeline finalization 再对最终正文做幂等提交；抽取或稳定提交失败时由 Timeline 服务内部降级，只有检查点本身无法落盘这类数据完整性问题才阻止章节状态继续推进。
- `runtime/lifecycle/ChapterLifecycleService` 是章节生产链中 `content`、`generationState` 和 `chapterStatus` 的唯一持久化写入口。生成、审校、修复和资产服务只决定业务状态并委托它落库，不得各自直接更新 Chapter 生命周期字段。
- `ChapterPipelineRuntimeAdapter` 只负责把 pipeline hooks 适配到统一章节 runtime，不复制 writer、门禁或定稿逻辑。
- `chapterRuntimePackageBuilders.ts` 只放无 IO 构建函数，不允许引入 Prisma、route、director 或服务单例。
- `runtime/repair/ChapterRepairEligibility` 只后处理已有 AI 结构化判断，决定自动补丁是否适用；pipeline 在领取次数前调用它。它不得调用模型、猜测问题文本、改变用户策略或决定全局停机。账本提醒与正文审计的证据边界见 [章节生产主链](../workflows/chapter-production-chain.md)。
- `shared/types/chapterRuntime.ts` 是共享运行时合同的稳定门面；样式、动态角色、Payoff 和质量结果 Schema 分别归属 `shared/types/chapterRuntime/` 下的领域文件，外部仍从原门面路径导入。
- 共享 Schema 子模块只允许包含 Zod 合同和推导类型。跨域 `chapterRuntimePackageSchema` 继续留在门面中负责装配，避免子模块反向依赖门面形成初始化循环。
- `ChapterRepairStreamRuntime` 仍是修复流实现边界，暂不在 Phase 5 拆分；门面只继续委托它。

## 长篇生产内核的迁移边界

`server/src/modules/production/` 先提供独立的长篇领域决策，不接管当前入口。外部只能通过模块门面消费；导演归属、预算、模型调用和数据库均由后续应用层端口注入。V1 继续使用原章节运行时，短篇保留自己的生产逻辑；共用质量和编辑保护约定通过独立 common 门面逐步收敛。

纯决策必须与进度持久化分开：原稿直提先生成显式选稿动作，修复候选先复验和选择；两条路径都保存选稿哈希与原因，之后才能提交。修复额度不能跳过已有候选稿的安全核对。重复阶段结果和选稿动作保持幂等，冲突结果拒绝，人工编辑后不允许旧结果覆盖。

领域回放只消费已给定的结构化结果，不调用模型、不读数据库。它证明规则可重复执行，不能证明跨进程互斥、真实调用不重复或数据库提交成功；这些需要应用层以持久预约、输入指纹和真实版本围栏验证。新旧流水线同样本的决策差异仍须在入口切换前单独确认。

## 失败模式

- route、director 或旧 service 直接 import `ChapterQualityGateService` / `ChapterContentFinalizationService`，说明外部开始深链到 runtime 内部。
- runtime package builder 引入数据库或服务单例，说明纯函数构建层重新混入 IO。
- pipeline adapter 复制生成或定稿逻辑，说明批量执行路径重新分叉。
- 章节状态已进入 `pending_review`、`needs_repair` 或完成事件已发出，但当前 content hash 没有 `timeline_finalization/stable|degraded` 成功检查点，说明终态边界被绕过。
- Runtime 内除 `ChapterLifecycleService` 外再次出现 `prisma.chapter.update` 生命周期写入，说明状态所有权重新分叉。
- coordinator 重新增长到 700 行以上，说明门面再次吸收了内部职责。
- 服务端或客户端开始深层导入 `shared/types/chapterRuntime/*`，说明兼容门面被绕开，未来 Schema 重组会扩散到业务模块。

## 相关模块

- `server/src/services/novel/runtime/ChapterRuntimeCoordinator.ts`
- `server/src/services/novel/runtime/ChapterStreamGenerationOrchestrator.ts`
- `server/src/services/novel/runtime/ChapterQualityGateService.ts`
- `server/src/services/novel/runtime/ChapterContentFinalizationService.ts`
- `server/src/services/novel/runtime/ChapterPipelineRuntimeAdapter.ts`
- `server/src/services/novel/runtime/lifecycle/ChapterLifecycleService.ts`
- `server/src/services/novel/runtime/lifecycle/README.md`
- `server/src/services/novel/runtime/chapterRuntimePackageBuilders.ts`
- `shared/types/chapterRuntime.ts`
- `shared/types/chapterRuntime/README.md`
