# 共用约定、短篇流程与进行中开发

基线：main=7f06e54b。2026-10-22 只读盘点；第 1～4 节描述 main，第 5 节单列另一工作区的未提交开发。未修改短篇工作区。

## 1. 短篇流程

| 步骤 | 函数（路径:行号） | 使用的 Prompt | 读写的表与字段 | 失败或暂停的处理 | 对应的 V2 步骤候选名 |
| --- | --- | --- | --- | --- | --- |
| 加载已确认意图 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:93 | 无 | NovelWorkflowTask、Novel、NovelIntentVersion | 缺少意图或方向报错；不猜测恢复操作 | short_story.prepare |
| 复用或创建整篇计划 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:139 | shortStoryPlanPrompt | ShortStoryPlan.structureJson、ShortStorySegment | 已有计划复用；运行前检查取消 | short_story.plan |
| 顺序写作 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:202 | shortStorySegmentWritePrompt | ShortStorySegment.content/status/version/qualityResultJson | 已完成片段复用，过期 generating 回收，人工编辑不覆盖 | short_story.write |
| 全篇审校 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:312 | shortStoryFullAuditPrompt | ShortStoryPlan.auditResultJson | 明确 replan_required 保存确认检查点 | short_story.audit |
| 单次修整 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:387 | shortStoryPatchRepairPrompt | ShortStorySegment.content/version，ShortStoryPlan.qualityDebtJson | 跳过人工编辑片段；乐观版本条件更新；当前缺少修后复审 | short_story.repair |
| 完成交付 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:368 | 无 | ShortStoryPlan.status、NovelWorkflowTask.checkpointType | 普通质量债保留，完成检查点；连续阅读不暴露内部片段 | short_story.finalize |
| 手动修改/恢复 | server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:133 | shortStoryRevisionImpactPrompt 等 | NovelIntentVersion、ShortStorySegment、任务 | 普通恢复不能清除重规划检查点；旧实现修订恢复缺口由第 5 节开发补齐 | short_story.revision |

## 2. V1 工作流依赖

依赖范围包括 import、实例持有、任务查询和命令调用；import/实例不是新增工作流动作。

| 位置（路径:行号） | 调用 | 作用（一句话） | 挂到 V2 后由什么替代 |
| --- | --- | --- | --- |
| server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:18 | NovelWorkflowService import | 依赖旧工作流门面 | V2 命令 |
| server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:49 | new NovelWorkflowService | 持有旧命令门面 | V2 命令 |
| server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:137 | novelWorkflowTask.findFirst | 找本篇可恢复任务 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:153 | retryTask | 显式重试 | V2 命令 |
| server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:285 | markTaskRunning | 修订执行进度 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:338 | recordCheckpoint | 保存修订完成 | V2 产物台账 |
| server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:347 | novelWorkflowTask.findFirst | 读取失败状态 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:352 | markTaskFailed | 保存修订失败 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:15 | NovelWorkflowService import | 依赖旧工作流门面 | V2 命令 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:44 | new NovelWorkflowService | 持有旧命令门面 | V2 命令 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:55 | novelWorkflowTask.findMany | 启动时查排队/运行任务 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:79 | novelWorkflowTask.findUnique | 异常后核对取消及检查点 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:82 | markTaskFailed | 非取消、非重规划错误 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:94 | novelWorkflowTask.findUnique | 加载小说与任务上下文 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:156 | markTaskRunning | 计划进度 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:236 | markTaskRunning | 当前片段游标 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:323 | markTaskRunning | 全篇检查进度 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:355 | recordCheckpoint(replan_required) | 等待确认新方向 | V2 确认门 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:376 | recordCheckpoint(workflow_completed) | 完成交付 | V2 产物台账 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:394 | markTaskRunning | 单次修整进度 | V2 运行控制状态 |
| server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:444 | novelWorkflowTask.findUnique | 取消守卫 | V2 运行控制状态 |

质量债的正文事实继续由短篇计划拥有，运行记录只投影；不能把记录列表变成修复或确认操作入口。

## 3. 重复实现与 common 归属

| 能力 | 长篇实现（路径:行号） | 短篇实现（路径:行号，没有则写“无”） | 两者是否一致 | 不一致之处 | 归属 |
| --- | --- | --- | --- | --- | --- |
| 质量债结构与写入 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:117 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:365 | 否 | 长篇含根因、义务、尝试等结构；短篇以字符串数组保存；common 需无损承载，不迁移旧数据 | common |
| 问题策略与停止语义 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:50 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:354 | 部分 | 短篇有显式重规划但未完整复用长篇问题策略 | common |
| 补丁应用 | server/src/services/novel/chapterPatchRepairService.ts:61 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:427 | 否 | 长篇为片段锚定补丁，短篇为整内部片段替换；只共享安全定位/应用工具，不强行统一生产步骤 | common |
| 版本保存与保存前快照 | server/src/services/novel/chapterEditor/persistence/ManualChapterStore.ts:1 | server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:173 | 部分 | expectedContent/更新时间与片段 version 不同；保存语义共享、各自仓储保留 | common |
| 人工编辑保护 | server/src/services/novel/chapterEditor/persistence/ManualChapterStore.ts:1 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:430 | 是 | 都不能自动覆盖较新用户内容；短篇额外保留 userEditedAt 标记 | common |
| 调用计量与预算 | server/src/services/novel/production/NovelPipelineExecutor.ts:553 | server/src/modules/novel/short-story/application/ShortStoryProductionService.ts:278 | 否 | 长篇有本章预约和 Token 暂停；短篇仅请求输出上限，不能宣称已有同等预算闭环 | common |
| 片段游标与连续阅读 | 无 | server/src/modules/novel/short-story/application/ShortStoryStudioService.ts:122 | 不适用 | 片段是内部单位，不成为长篇章节 Unit | short_story |

## 4. 能力缺口与篇幅参数

- main 的修整直接返回模型自报 residualQualityDebt，没有再次调用全篇审校：ShortStoryProductionService.ts:427—440。进入计划 06 时必须补实际修后核对，不能把模型自报当作核验。
- 全篇审校把整篇正文传入 Prompt，没有针对所选模型有效上下文的输入预算校验：ShortStoryProductionService.ts:329—347。Prompt 的 maxTokens 是输出额度，不是输入保护。
- 3000—30000 字、2—8 个片段：server/src/prompting/prompts/shortStory/shortStory.prompts.ts:27—29。
- 逐段输出额度为 min(12000, max(2500, targetWordCount * 2))：ShortStoryProductionService.ts:278；全篇审校 5000：347；修整 12000：424。
- 每轮正常生产最多一次修整：ShortStoryProductionService.ts:368—370；恢复重跑审校/修整的幂等边界仍需计划 06 结合已合入的修订作业再定义。
- 当前基线已有因果合同与全篇计划校验，不能据旧短篇实测再声称该能力完全不存在：shortStory.prompts.ts:101—109。

## 5. 进行中开发的影响

实际工作区 C:/Users/Administrator/.codex/worktrees/short-story-recovery/ai，分支 codex/short-story-revision-recovery，HEAD=e636ff63。已提交差异相对 merge base 为空，状态有 30 个已跟踪修改及未跟踪文件/目录，必须分别读取。

| 来源 | 修改位置 | 对第 1～4 节的影响 |
| --- | --- | --- |
| 未提交 | application/ShortStoryProductionService.ts、ShortStoryStudioService.ts、HTTP 与两套 schema | 首次生产、修订与重规划恢复分流；新增持久操作指针与源页动作；V1 任务依赖仍存在 |
| 未跟踪文件 | application/ShortStoryRevisionService.ts:38、97、142、332 | 确认、重试、租约执行和统一发布；已完成候选可复用，提交前事务检查全部基础版本 |
| 未跟踪文件 | application/ShortStoryRevisionPreviewService.ts:12、application/ShortStoryContext.ts:8 | 重规划预览绑定原意图、计划、片段和检查点；普通继续不能清除人工确认 |
| 未跟踪文件 | domain/revisionState.ts、两套 20261021090000_short_story_revision_recovery 迁移 | 显式修订作业及候选存储，不是内核 Unit 进度表，不应重复实现 |
| 未提交及未跟踪文件 | creation-studio/reference/、shortStoryReference.prompts.ts、上下文与共享合同 | 参考来源快照贯穿方向、生产、修订与恢复；计划 06 重盘时保留该合同 |
| 未提交及未跟踪文件 | platform/llm/diagnostics/、structuredInvoke*、shared/types/structuredDiagnostics.ts | 脱敏逐次诊断和有限恢复已存在，不能在短篇迁移时丢失 |
| 未提交 | tests/shortStoryWorkflowContracts.test.js、server/scripts/run-tests.cjs | 临时库测试注册 integration；迁移不得把它们放进 fast |
| 未跟踪文件 | shortStoryRevisionRecovery.test.js、shortStoryStructuredDiagnostics.test.js、shortStoryReferenceTemplate.test.js | 计划 06 需复用恢复/参考/诊断回归；本次没有运行另一工作区的测试 |

上述进行中开发没有改变“生产独立、修后复审和全篇输入预算仍需补齐”的迁移责任。这里不是合入证据；计划 06 必须等这些实际文件先提交并经 beta/main 正常流程整合，再按新基线重盘。
