# 旧生产代码中的 V2 分支

基线：7f06e54b；盘点日期：2026-10-22。代码证据为定位与职责依据，不表示这些规则均已通过测试；有冲突或缺口的项目另列在报告。

指定 rg 命令得到 98 行，下表逐行对应。类型与注释不等于可独立删除的行为。共享状态/人工编辑入口的版本隔离仍有调用方，计划 08 不能机械清除全部 V2 字样。

| ID | 位置（路径:行号） | 代码片段（不超过 80 字） | 作用（一句话） | 分类 | 内核接管后的处理 |
| --- | --- | --- | --- | --- | --- |
| B001 | server/src/services/novel/chapterEditor/synchronization/ManualChapterSyncService.ts:41 | include: { novel: { select: { directorVersion: true, directorEpoch: true } } } } | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B002 | server/src/services/novel/chapterEditor/synchronization/ManualChapterSyncService.ts:64 | const runs = await prisma.directorNextRun.findMany({ where: { novelId: payload.n | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B003 | server/src/services/novel/chapterEditor/synchronization/ManualChapterSyncService.ts:67 | const v2 = chapter.novel.directorVersion === "v2" &#124;&#124; (!chapter.novel.directorVer | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B004 | server/src/services/novel/chapterEditor/synchronization/ManualChapterSyncService.ts:74 | ...(v2 ? { artifactSyncPolicy: "director_v2" as const, directorRunId: run?.id }  | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B005 | server/src/services/novel/chapterEditor/synchronization/ManualChapterSyncService.ts:76 | checkpointScope: `manual:${payload.revision}`, manualRevision: payload.revision, | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B006 | server/src/services/novel/dynamics/CharacterDynamicsMutationService.ts:123 | if (candidate.status.startsWith("v2_")) throw Object.assign(new Error("请从本书导演 V2 | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B007 | server/src/services/novel/dynamics/CharacterDynamicsMutationService.ts:190 | if (candidate.status.startsWith("v2_")) throw Object.assign(new Error("请从本书导演 V2 | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B008 | server/src/services/novel/state/persistence/StateProposalStore.ts:122 | const novel = await tx.novel.findUnique({ where: { id: integrity.novelId }, sele | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B009 | server/src/services/novel/state/persistence/StateProposalStore.ts:123 | if (novel?.directorVersion !== "v2" &#124;&#124; !integrity.chapterId &#124;&#124; integrity.expecte | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B010 | server/src/services/novel/state/persistence/StateProposalStore.ts:124 | throw new Error("统一抽取资源确认必须绑定 V2 小说与已保存正文。"); | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B011 | server/src/services/novel/production/NovelPipelineExecutor.ts:32 | import { isCurrentChapterProductionCompleted, isCurrentV2ChapterProductionComple | 导入 V2 完成判定，随入口迁移清理 | 类型或参数透传 | 计划 08 删除 |
| B012 | server/src/services/novel/production/NovelPipelineExecutor.ts:246 | directorNext: persistedPayload.directorNext ?? options.directorNext, | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B013 | server/src/services/novel/production/NovelPipelineExecutor.ts:321 | runtimePayload.directorNext?.decisions.push({...decision, ...(input.chapterOrder | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B014 | server/src/services/novel/production/NovelPipelineExecutor.ts:374 | directorNextRunId: runtimePayload.directorNext?.runId ?? null, | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B015 | server/src/services/novel/production/NovelPipelineExecutor.ts:418 | if (!chapter.content?.trim() &#124;&#124; isCurrentV2ChapterProductionCompleted(chapter) &#124; | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B016 | server/src/services/novel/production/NovelPipelineExecutor.ts:425 | if (runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryE | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B017 | server/src/services/novel/production/NovelPipelineExecutor.ts:426 | runtimePayload.directorNext.pendingCharacterReviewId = error.result.characterRev | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B018 | server/src/services/novel/production/NovelPipelineExecutor.ts:441 | ? chapterCandidates.filter((chapter) => !(runtimePayload.directorNext ? isCurren | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B019 | server/src/services/novel/production/NovelPipelineExecutor.ts:454 | const isAutopilotMode = Boolean(runtimePayload.directorNext) | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B020 | server/src/services/novel/production/NovelPipelineExecutor.ts:457 | ? runtimePayload.directorNext ? options.endOrder : Math.max(options.endOrder, no | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B021 | server/src/services/novel/production/NovelPipelineExecutor.ts:459 | let totalCount = runtimePayload.directorNext | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B022 | server/src/services/novel/production/NovelPipelineExecutor.ts:464 | const storedCompleted = runtimePayload.directorNext && runtimePayload.skipComple | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B023 | server/src/services/novel/production/NovelPipelineExecutor.ts:476 | const closedOrders = new Set(chapterCandidates.filter(chapter => runtimePayload. | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B024 | server/src/services/novel/production/NovelPipelineExecutor.ts:480 | if (runtimePayload.directorNext) { | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B025 | server/src/services/novel/production/NovelPipelineExecutor.ts:515 | if (isAutopilotMode && runtimePayload.directorNext) { | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B026 | server/src/services/novel/production/NovelPipelineExecutor.ts:534 | const savedUsage = runtimePayload.directorNext?.chapterUsage?.find(row => row.ch | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B027 | server/src/services/novel/production/NovelPipelineExecutor.ts:542 | observeChapterUsage(runtimePayload.directorNext!, chapter.id, usage.totalTokens) | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B028 | server/src/services/novel/production/NovelPipelineExecutor.ts:553 | if (!runtimePayload.directorNext) return; | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B029 | server/src/services/novel/production/NovelPipelineExecutor.ts:558 | initialized = beginChapterUsage(runtimePayload.directorNext, chapter.id, chapter | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B030 | server/src/services/novel/production/NovelPipelineExecutor.ts:560 | ? finalizeChapterUsage(runtimePayload.directorNext, chapter.id, usage.job, usage | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B031 | server/src/services/novel/production/NovelPipelineExecutor.ts:561 | : observeChapterUsage(runtimePayload.directorNext, chapter.id, usage.job, usage. | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B032 | server/src/services/novel/production/NovelPipelineExecutor.ts:566 | const row = runtimePayload.directorNext.chapterUsage!.find(item => item.chapterI | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B033 | server/src/services/novel/production/NovelPipelineExecutor.ts:680 | ...(runtimePayload.directorNext ? {artifactSyncPolicy: "director_v2" as const, f | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B034 | server/src/services/novel/production/NovelPipelineExecutor.ts:723 | if (runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryE | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B035 | server/src/services/novel/production/NovelPipelineExecutor.ts:725 | runtimePayload.directorNext.pendingCharacterReviewId = error.result.characterRev | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B036 | server/src/services/novel/production/NovelPipelineExecutor.ts:730 | if (runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryE | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B037 | server/src/services/novel/production/NovelPipelineExecutor.ts:839 | onIssueDecision: decision => {runtimePayload.directorNext?.decisions.push({...de | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B038 | server/src/services/novel/production/NovelPipelineExecutor.ts:979 | const log = runtimePayload.directorNext?.pendingCharacterReviewId ? logPipelineI | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B039 | server/src/services/novel/production/NovelPipelineExecutor.ts:980 | log(runtimePayload.directorNext?.pendingCharacterReviewId ? "等待用户确认本章人物" : "任务已按 | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B040 | server/src/services/novel/production/NovelPipelineExecutor.ts:1017 | if (runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryE | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B041 | server/src/services/novel/production/NovelPipelineExecutor.ts:1018 | runtimePayload.directorNext.pendingCharacterReviewId = error.result.characterRev | V2 的范围、预算、人物等待或完成投影，迁至调用方与相应端口 | V2 专属行为 | 改为内核阶段行为 |
| B042 | server/src/services/novel/runtime/ChapterPipelineRuntimeAdapter.ts:49 | if (options.artifactSyncPolicy === "director_v2") { | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B043 | server/src/services/novel/runtime/ChapterPipelineRuntimeAdapter.ts:67 | persistFinalizedChapterResult: options.artifactSyncPolicy === "director_v2" | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B044 | server/src/services/novel/production/completion/ChapterProductionCompletionPolicy.ts:38 | export function isCurrentV2ChapterProductionCompleted(chapter: ChapterProduction | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B045 | server/src/services/novel/runtime/ChapterArtifactSyncService.ts:21 | artifactSyncPolicy?: "director_v2"; | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B046 | server/src/services/novel/runtime/ChapterArtifactSyncService.ts:113 | // V2 records structured appearances after candidate identity resolution in the  | 随对应职责迁移注释 | 注释 | 计划 08 删除 |
| B047 | server/src/services/novel/runtime/ChapterArtifactSyncService.ts:114 | if (options.artifactSyncPolicy !== "director_v2") { | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B048 | server/src/services/novel/runtime/ChapterArtifactSyncService.ts:149 | if (options.artifactSyncPolicy !== "director_v2") { | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B049 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:53 | /** Internal production policy, selected only by the V2 job owner. */ | 随对应职责迁移注释 | 注释 | 计划 08 删除 |
| B050 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:54 | artifactSyncPolicy?: "director_v2"; | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B051 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:158 | artifactSyncPolicy?: "director_v2"; | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B052 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:223 | if (artifactSyncPolicy === "director_v2") { | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B053 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:296 | if (artifactSyncPolicy === "director_v2") await deps.persistFinalizedChapterResu | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B054 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:517 | if (artifactSyncPolicy === "director_v2") { | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B055 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:608 | artifactSyncPolicy?: "director_v2", | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B056 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:625 | function assertArtifactSyncCanContinue(result: ChapterArtifactSyncResult, policy | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B057 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:627 | && (policy !== "director_v2" &#124;&#124; result.completedArtifacts.includes("artifact_del | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B058 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:88 | artifactSyncPolicy?: "director_v2"; | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B059 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:91 | revisionGuard?: {id: string; metadataJson: string &#124; null; novel?: {directorEpoch | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B060 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:126 | return input.artifactSyncPolicy === "director_v2" | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B061 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:325 | if (input.artifactSyncPolicy === "director_v2") throw error; | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B062 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:352 | if (input.artifactSyncPolicy === "director_v2") throw error; | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B063 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:359 | const locationStates = input.artifactSyncPolicy === "director_v2" | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B064 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:370 | characterCandidateResolutionEnabled: input.artifactSyncPolicy === "director_v2"  | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B065 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:405 | if (input.artifactSyncPolicy !== "director_v2") throw new Error("角色出场回填需要导演 V2 授 | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B066 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:410 | if (input.artifactSyncPolicy !== "director_v2") throw new Error("角色位置回填需要导演 V2 授 | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B067 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:464 | ...(input.artifactSyncPolicy === "director_v2" ? {artifactResourceReview: { | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B068 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:506 | skipCandidates: input.artifactSyncPolicy === "director_v2", | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B069 | server/src/services/novel/runtime/ChapterArtifactDeltaService.ts:753 | artifactSyncPolicy?: "director_v2"; | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B070 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:34 | artifactSyncPolicy?: "director_v2"; | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B071 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:37 | revisionGuard?: {id: string; metadataJson: string &#124; null; novel?: {directorEpoch | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B072 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:95 | if (options.artifactSyncPolicy === "director_v2") { | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B073 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:207 | status: options.artifactSyncPolicy === "director_v2" &#124;&#124; artifactSyncMode === "st | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B074 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:277 | status: options.artifactSyncPolicy === "director_v2" ? "failed" : "degraded", | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B075 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:346 | ...(options.artifactSyncPolicy === "director_v2" ? { | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B076 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:410 | artifactSyncPolicy?: "director_v2"; | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B077 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:423 | if (input.artifactSyncPolicy !== "director_v2" && input.chapterOrder > 0 && inpu | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B078 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:432 | artifactSyncPolicy?: "director_v2"; | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B079 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:443 | if (input.artifactSyncPolicy !== "director_v2" && input.chapterOrder > 0 && inpu | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B080 | server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:533 | revisionGuard?: {id: string; metadataJson: string &#124; null; novel?: {directorEpoch | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B081 | server/src/services/novel/runtime/artifactSync/ChapterArtifactRecoveryService.ts:65 | if (input.artifactSyncPolicy === "director_v2" && input.directorRunId) { | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B082 | server/src/services/novel/runtime/artifactSync/ChapterArtifactRecoveryService.ts:216 | revisionGuard?: {id: string; metadataJson: string &#124; null; novel?: {directorEpoch | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B083 | server/src/services/novel/runtime/artifactSync/authorization/ManualRevisionAuthorization.ts:8 | revisionGuard?: {id: string; metadataJson: string &#124; null; novel?: {directorEpoch | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B084 | server/src/services/novel/runtime/artifactSync/authorization/ManualRevisionAuthorization.ts:17 | if (!input.manualRevision &#124;&#124; !guard?.metadataJson &#124;&#124; guard.novel?.directorVersio | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B085 | server/src/services/novel/runtime/artifactSync/authorization/ManualRevisionAuthorization.ts:24 | const book = await tx.novel.updateMany({where: {id: input.novelId, directorVersi | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B086 | server/src/services/novel/runtime/GenerationContextAssembler.ts:258 | includePreviousPending: novel.directorVersion === "v2", | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B087 | server/src/services/novel/runtime/GenerationContextAssembler.ts:261 | if (novel.directorVersion === "v2") throw error; | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B088 | server/src/services/novel/runtime/GenerationContextAssembler.ts:367 | const characterLocations = novel.directorVersion === "v2" | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B089 | server/src/services/novel/runtime/artifactSync/ChapterPipelineFinalizationStore.ts:53 | status: "succeeded", sourceType: "director_v2_production", sourceStage: "chapter | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B090 | server/src/services/novel/runtime/artifactSync/ChapterPipelineFinalizationStore.ts:65 | novelId, chapterId, contentHash, artifactType: ARTIFACT_TYPE, syncMode: `directo | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B091 | server/src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactWriter.ts:20 | output: ChapterArtifactDeltaOutput; expectedContentHash: string; artifactSyncPol | 供阶段适配器或来源授权透传执行归属 | 类型或参数透传 | 改为内核阶段行为 |
| B092 | server/src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactWriter.ts:22 | const legacy = input.artifactSyncPolicy === "director_v2" ? [] : extractFacts(in | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B093 | server/src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactWriter.ts:23 | const keyEvents = shortLines(input.artifactSyncPolicy === "director_v2" | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B094 | server/src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactWriter.ts:26 | const characterStates = shortLines(input.artifactSyncPolicy === "director_v2" | V2 的最终稿、必要资产或事实来源语义，迁入阶段适配器 | V2 专属行为 | 改为内核阶段行为 |
| B095 | server/src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactWriter.ts:46 | // Only the final-version writer owns these V2 jobs, not draft saves or | 随对应职责迁移注释 | 注释 | 计划 08 删除 |
| B096 | server/src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactProjection.ts:6 | /** null means legacy ownership; a V2 result without an output is an invalidated | 随对应职责迁移注释 | 注释 | 计划 08 删除 |
| B097 | server/src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactProjection.ts:11 | novel: { select: { directorVersion: true } } }, | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
| B098 | server/src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactProjection.ts:14 | if (chapter.novel.directorVersion !== "v2") return null; | 共享入口的归属、人工编辑授权或资料读取隔离；不能因自动生产迁移删除安全边界 | V1/V2 版本判断 | 保留（V1 也需要） |
