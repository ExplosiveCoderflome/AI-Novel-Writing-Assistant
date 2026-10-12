# 自动导演重构 P0：步骤依赖图与产物清单

核对基点：`b781ca68`，日期：2026-10-01。此表是旧实现的事实盘点及候选映射，不能直接当作已定稿的生产计划。来源：`server/src/services/novel/director/workflowStepRuntime/directorWorkflowPlans.ts:13`、`shared/types/directorWorkflowStepCatalogData.ts:130`。

## 1. 旧步骤总表（22 行）

`requires` 合并步骤目录的先决步骤与实现中的产物检查；`novel_seed` 归一化旧 book_seed / 已确认项目。`gateable` 仅按旧 approvalPoint / 审阅检查点记录，不能据此自动开放新确认门。`none` 表示该适配步骤不新增模型调用，不表示被调用的章节生产链没有 AI。来源：`shared/types/directorWorkflowStepCatalogData.ts:30`、`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:545`。

| 旧步骤编号 | 建议新 id | 中文名 | requires | produces | needs | gateable | overwrites | 复用的底层服务 | 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `book.candidate.generate` | `candidate_generate` | 生成书级候选 | `user_seed` | `candidate_batch` | `none` | true | 无 | 不进入新计划；开书候选能力保持现状 | `shared/types/directorWorkflowStepCatalogData.ts:131`；`server/src/services/novel/director/runtime/novelDirectorCandidateRuntime.ts:76` |
| `book.candidate.refine` | `candidate_refine` | 修订候选方向 | `candidate_batch` | `candidate_batch` | `none` | true | 无 | 不进入新计划；开书候选能力保持现状 | `shared/types/directorWorkflowStepCatalogData.ts:155`；`server/src/services/novel/director/runtime/novelDirectorCandidateRuntime.ts:83` |
| `book.candidate.patch` | `candidate_patch` | 定向修正候选 | `candidate_batch` | `candidate_batch` | `none` | true | 无 | 不进入新计划；开书候选能力保持现状 | `shared/types/directorWorkflowStepCatalogData.ts:179`；`server/src/services/novel/director/runtime/novelDirectorCandidateRuntime.ts:95` |
| `book.candidate.title_refine` | `candidate_title_refine` | 优化候选书名 | `candidate_batch` | `candidate_batch` | `none` | true | 无 | 不进入新计划；开书候选能力保持现状 | `shared/types/directorWorkflowStepCatalogData.ts:203`；`server/src/services/novel/director/runtime/novelDirectorCandidateRuntime.ts:105` |
| `book.project.create` | `novel_create` | 创建小说项目 | `candidate_batch` | `novel_seed` | `none` | false | 无 | server/src/services/novel/NovelContextService.ts:createNovel（入口转接） | `shared/types/directorWorkflowStepCatalogData.ts:227`；`server/src/services/novel/director/runtime/novelDirectorConfirmRuntime.ts:275` |
| `workflow.takeover.execute` | `asset_inference` | 执行 AI 自动导演接管 | 无 | `asset_inventory` | `none` | false | 无 | 不作为生成步骤；由 open_run 资产读取与登记承担 | `shared/types/directorWorkflowStepCatalogData.ts:251`；`server/src/services/novel/director/runtime/novelDirectorTakeover.ts:355` |
| `story.macro.plan` | `story_macro` | 生成故事宏观规划 | `novel_seed` | `story_macro` | `structured_output` | false | story_macro | server/src/services/novel/storyMacro/StoryMacroPlanService.ts:decompose、buildConstraintEngine | `shared/types/directorWorkflowStepCatalogData.ts:275`；`server/src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts:40` |
| `book.contract.create` | `book_contract` | 生成书级创作约定 | `novel_seed`、`story_macro` | `book_contract` | `structured_output` | false | book_contract | server/src/prompting/core/promptRunner.ts:runStructuredPrompt（复用 directorBookContractPrompt）；server/src/services/novel/BookContractService.ts:upsert | `shared/types/directorWorkflowStepCatalogData.ts:300`；`server/src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts:127` |
| `book.world.prepare` | `world_setup` | 准备本书世界 | `novel_seed`、`story_macro`、`book_contract` | `world_skeleton` | `structured_output` | false | world_skeleton | server/src/services/novel/worldContext/WorldContextGateway.ts:generateWorldFromNovelTheme、getWorldContextBlock | `shared/types/directorWorkflowStepCatalogData.ts:325`；`server/src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts:268` |
| `character.cast.prepare` | `character_setup` | 准备角色阵容与角色资产 | `story_macro`、`book_contract`、`world_skeleton` | `character_cast` | `structured_output` | true | character_cast | server/src/services/novel/characterPrep/characterCastGeneration.ts:generateAutoCharacterCastDraft、persistCharacterCastOptionsDraft；server/src/services/novel/characterPrep/CharacterPreparationService.ts:applyCharacterCastOption | `shared/types/directorWorkflowStepCatalogData.ts:350`；`server/src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts:415` |
| `volume.strategy.plan` | `volume_strategy` | 生成分卷策略与推进路线 | `story_macro`、`book_contract`、`character_cast` | `volume_strategy` | `structured_output` | true | volume_strategy | server/src/services/novel/volume/NovelVolumeService.ts:generateVolumes（strategy → strategy_critique → skeleton）、updateVolumes | `shared/types/directorWorkflowStepCatalogData.ts:378`；`server/src/services/novel/director/phases/novelDirectorPipelinePhases.ts:293` |
| `volume.beat_sheet.generate` | `volume_beat_sheet` | 生成目标卷节奏板 | `volume_strategy`、`character_cast` | `volume_beat_sheet` | `structured_output` | false | chapter_task_sheet | server/src/services/novel/volume/NovelVolumeService.ts:generateVolumes（beat_sheet）、updateVolumesWithOptions | `shared/types/directorWorkflowStepCatalogData.ts:403`；`server/src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts:262` |
| `volume.chapter_list.generate` | `volume_chapter_list` | 生成卷拆章列表 | `volume_strategy`、`character_cast`、`volume_beat_sheet` | `volume_chapter_list` | `structured_output` | false | chapter_task_sheet | server/src/services/novel/volume/NovelVolumeService.ts:generateVolumes（chapter_list，single_beat）、updateVolumesWithOptions | `shared/types/directorWorkflowStepCatalogData.ts:428`；`server/src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts:311` |
| `volume.chapter_detail_bundle.generate` | `chapter_detail_bundle` | 细化章节任务单与执行资源 | `volume_chapter_list` | `chapter_task_sheet` | `structured_output` | true | chapter_task_sheet | server/src/services/novel/volume/NovelVolumeService.ts:generateVolumes（chapter_detail）、updateVolumesWithOptions；全书自动走 JIT | `shared/types/directorWorkflowStepCatalogData.ts:453`；`server/src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts:398` |
| `chapter.execution_contract.sync` | `execution_contract_sync` | 同步章节执行合同 | `chapter_task_sheet` | `chapter_execution_contract` | `none` | true | 无 | server/src/services/novel/volume/NovelVolumeService.ts:syncVolumeChaptersWithOptions（保留正文，允许 JIT） | `shared/types/directorWorkflowStepCatalogData.ts:478`；`server/src/services/novel/director/workflowStepRuntime/DirectorCoreStepModuleRuntime.ts:305` |
| `chapter.draft.write` | `chapter_batch` | 执行章节生成批次 | `chapter_execution_contract` | `chapter_batch_closed` | `none` | true | chapter_draft | server/src/services/novel/application/NovelApplicationServices.ts:startPipelineJob、resumePipelineJob | `shared/types/directorWorkflowStepCatalogData.ts:503`；`server/src/services/novel/director/automation/novelDirectorAutoExecutionRuntime.ts:186` |
| `chapter.quality.review` | `chapter_quality_review` | 检查章节质量 | `chapter_draft` | `audit_report` | `none` | false | 无 | 自动模式只读事实；审校由章节生产链内部执行，不新增调用 | `shared/types/directorWorkflowStepCatalogData.ts:528`；`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:645` |
| `chapter.draft.repair` | `chapter_repair` | 修复章节问题 | `chapter_draft`、`audit_report` | `repair_ticket` | `none` | true | chapter_draft、audit_report、repair_ticket | 自动模式只读事实；人工修复经 server/src/services/novel/application/NovelApplicationServices.ts:createRepairStream | `shared/types/directorWorkflowStepCatalogData.ts:553`；`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:690` |
| `chapter.state.commit` | `chapter_state_commit` | 提交章节连续性状态 | `chapter_draft`、`audit_report` | `continuity_state` | `none` | false | 无 | 自动模式只读事实；状态提交由章节生产链内部执行，不新增调用 | `shared/types/directorWorkflowStepCatalogData.ts:579`；`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:755` |
| `payoff.ledger.sync` | `payoff_ledger_sync` | 同步读者承诺与伏笔 | `continuity_state` | `reader_promise` | `none` | false | 无 | 自动模式只读事实；伏笔同步由章节生产链内部执行，不新增调用 | `shared/types/directorWorkflowStepCatalogData.ts:604`；`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:783` |
| `character.resource.sync` | `character_resource_sync` | 同步角色资源状态 | `reader_promise` | `character_governance_state` | `none` | false | 无 | 自动模式只读事实；角色同步由章节生产链内部执行，不新增调用 | `shared/types/directorWorkflowStepCatalogData.ts:629`；`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:808` |
| `chapter.quality.repair` | `quality_repair` | 执行章节质量修复 | `chapter_draft`、`audit_report` | `repair_ticket` | `none` | true | chapter_draft、audit_report、repair_ticket | 质量修复的旧别名；不另建第二条修复链 | `shared/types/directorWorkflowStepCatalogData.ts:654`；`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:831` |

## 2. 产物类型表（23 行）

旧类型集合来源：`shared/types/directorRuntime.ts:18`。来源页沿用目录中的 tab 和现有 resumeTarget 生成函数，只记录已经存在的页签，尚不宣称该页已具备新内核确认命令。来源：`server/src/services/novel/workflow/novelWorkflow.shared.ts:84`、`shared/types/novelWorkflow.ts:40`。

| 产物类型 | 对应旧 DirectorArtifact 类型或业务表 | 是否用户可编辑 | 审阅页路由 | 来源 |
| --- | --- | --- | --- | --- |
| `novel_seed` | Novel；启动合同所需已确认书级输入 | 是 | /novels/:id/edit?stage=basic | `server/src/services/novel/director/runtime/novelDirectorConfirmRuntime.ts:275`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `user_seed` | 开书请求，不是旧 DirectorArtifact | 是 | /novels/:id/edit?stage=basic | `shared/types/directorWorkflowStepCatalogData.ts:143`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `candidate_batch` | 候选结果；不进入新内核产物计划 | 是 | /novels/create | `shared/types/directorWorkflowStepCatalogData.ts:144`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `asset_inventory` | 来源资产集合；open_run 初始化输入 | 否 | /novels/:id/edit?stage=basic | `server/src/services/novel/director/runtime/novelDirectorTakeover.ts:355`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `story_macro` | StoryMacroPlan | 是 | /novels/:id/edit?stage=story_macro | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:283`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `book_contract` | BookContract | 是 | /novels/:id/edit?stage=story_macro | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:274`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `world_skeleton` | World | 是 | /novels/:id/edit?stage=world | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:469`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `character_cast` | Character；角色阵容集合 | 是 | /novels/:id/edit?stage=character | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:292`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `volume_strategy` | VolumePlan | 是 | /novels/:id/edit?stage=outline | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:507`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `volume_beat_sheet` | 旧类型存在；计划生成结果位于卷工作区节奏板，现有 workspace inventory 没有独立索引 | 是 | /novels/:id/edit?stage=structured | `server/src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts:262`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `volume_chapter_list` | 旧类型存在；VolumeChapterPlan / 卷工作区拆章列表，现有 workspace inventory 没有独立索引 | 是 | /novels/:id/edit?stage=structured | `server/src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts:311`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `chapter_task_sheet` | Chapter / VolumeChapterPlan 任务单 | 是 | /novels/:id/edit?stage=structured | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:591`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `chapter_execution_contract` | 新类型建议：已同步正式章节合同；旧目录仍叫 chapter_task_sheet | 是 | /novels/:id/edit?stage=structured | `shared/types/directorWorkflowStepCatalogData.ts:479`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `chapter_batch_closed` | 新类型建议：授权批次所有章节的当前版本闭合事实；内容仍留在章节业务表 | 否 | /novels/:id/edit?stage=chapter | `server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:119`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `chapter_draft` | Chapter.content | 是 | /novels/:id/edit?stage=chapter | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:609`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `audit_report` | QualityReport / AuditReport | 否 | /novels/:id/edit?stage=pipeline | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:647`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `repair_ticket` | Chapter 修复历史 / 风险记录 | 否 | /novels/:id/edit?stage=pipeline | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:625`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `reader_promise` | BookContract / VolumePlan / PayoffLedgerItem | 是 | /novels/:id/edit?stage=outline | `server/src/services/novel/director/runtime/DirectorWorkspaceQualityArtifactInventory.ts:75`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `character_governance_state` | Character / CharacterResourceLedgerItem | 是 | /novels/:id/edit?stage=character | `server/src/services/novel/director/runtime/DirectorWorkspaceQualityArtifactInventory.ts:145`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `source_knowledge_pack` | KnowledgeDocument / BookAnalysis | 是 | UNKNOWN: 知识包没有在导演来源路由合同中声明专属审阅页 | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:479`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `chapter_retention_contract` | VolumeChapterPlan / Chapter 保留合同 | 是 | /novels/:id/edit?stage=structured | `server/src/services/novel/director/runtime/DirectorWorkspaceQualityArtifactInventory.ts:180`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `continuity_state` | StoryStateSnapshot | 否 | /novels/:id/edit?stage=chapter | `server/src/services/novel/director/runtime/DirectorWorkspaceQualityArtifactInventory.ts:244`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |
| `rolling_window_review` | QualityReport / AuditReport 最新窗口审核 | 否 | /novels/:id/edit?stage=pipeline | `server/src/services/novel/director/runtime/DirectorWorkspaceQualityArtifactInventory.ts:281`；`server/src/services/novel/workflow/novelWorkflow.shared.ts:84` |

## 3. 依赖关系与覆盖检查

以下逐条列出旧目录 prerequisiteStepIds 的直接上游，不能把所有 reads 机械地转为 requires（节奏板读取旧任务单是更新输入，不是初次执行先决产物）。来源：`shared/types/directorWorkflowStepCatalogData.ts:415`、`shared/types/directorWorkflowStepCatalog.ts:74`。

```text
book.candidate.generate <- 外部输入
book.candidate.refine <- book.candidate.generate
book.candidate.patch <- book.candidate.generate
book.candidate.title_refine <- book.candidate.generate
book.project.create <- book.candidate.generate
workflow.takeover.execute <- 外部输入
story.macro.plan <- 外部输入
book.contract.create <- story.macro.plan
book.world.prepare <- book.contract.create
character.cast.prepare <- book.contract.create, book.world.prepare
volume.strategy.plan <- character.cast.prepare
volume.beat_sheet.generate <- volume.strategy.plan
volume.chapter_list.generate <- volume.beat_sheet.generate
volume.chapter_detail_bundle.generate <- volume.chapter_list.generate
chapter.execution_contract.sync <- volume.chapter_detail_bundle.generate
chapter.draft.write <- chapter.execution_contract.sync
chapter.quality.review <- chapter.draft.write
chapter.draft.repair <- chapter.quality.review
chapter.state.commit <- chapter.quality.review
payoff.ledger.sync <- chapter.state.commit
character.resource.sync <- payoff.ledger.sync
chapter.quality.repair <- chapter.quality.review
```

规划主链候选：`novel_seed → story_macro → book_contract → world_skeleton → character_cast → volume_strategy → volume_beat_sheet → volume_chapter_list → chapter_task_sheet → chapter_execution_contract`。全书自动的任务单由执行前 JIT 准备，不能把全书全量细化塞到首章关键路径。来源：`server/src/services/novel/director/workflowStepRuntime/directorWorkflowPlans.ts:13`、`server/src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts:364`。

## 4. 正文生产接缝

- 新批次步骤只调用底层 `startPipelineJob`，其内部仍负责生成、审校、修复和终态闭合；旧导演调用位置：`server/src/services/novel/director/automation/novelDirectorAutoExecutionRuntime.ts:186`；底层稳定门面：`server/src/services/novel/application/NovelApplicationServices.ts:316`。
- 恢复暂停章节任务必须来自显式恢复动作；旧接缝在 `server/src/services/novel/director/automation/novelDirectorAutoExecutionRuntime.ts:76`，稳定门面在 `server/src/services/novel/application/NovelApplicationServices.ts:334`。
- 批次完成必须核对当前范围内每章的资产同步、状态提交及可审阅事实，不以有正文或历史 approved 代替：`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:119`、`docs/wiki/workflows/chapter-production-chain.md:61`。
- 章节审校/提交/伏笔/角色步骤在自动模式是事实观察器，不应由新导演重复执行：`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:545`、`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:645`、`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:755`。

## 5. 发现的问题与待决策项

1. 旧 prerequisiteStepIds 图无环；但同一产物存在多个写者：候选四步均写 candidate_batch，结构化四步均写 chapter_task_sheet，修复两种别名均改正文。不能原样交给计划 01 的唯一 produces 校验。来源：`shared/types/directorWorkflowStepCatalogData.ts:168`、`shared/types/directorWorkflowStepCatalogData.ts:416`、`shared/types/directorWorkflowStepCatalogData.ts:441`、`shared/types/directorWorkflowStepCatalogData.ts:566`。
2. 新内核必须让产物身份带作用域：书、卷、章节、批次彼此不能仅按 type 比版本；旧结构明确保留 targetType / targetId。来源：`shared/types/directorRuntime.ts:51`、`server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts:570`。
3. Book Contract 的模型调用与上下文组装仍位于旧阶段私有函数中；已有 PromptAsset 和存储服务可复用，但步骤适配需要先明确独立业务服务的归属，不能 import 旧阶段或复制拼接提示词。来源：`server/src/services/novel/director/phases/novelDirectorStoryMacroPhase.ts:47`、`server/src/services/novel/director/phases/novelDirectorStoryMacroPhase.ts:59`、`server/src/services/novel/director/phases/novelDirectorStoryMacroPhase.ts:150`。
4. 角色生成中的 generateAutoCharacterCastOption 是旧阶段依赖适配器，不是 CharacterPreparationService 的真实方法；应使用已存在的 generateAutoCharacterCastDraft / persistCharacterCastOptionsDraft。来源：`server/src/services/novel/director/novelDirectorPipelineRuntime.ts:559`、`server/src/services/novel/characterPrep/characterCastGeneration.ts:380`、`server/src/services/novel/characterPrep/characterCastGeneration.ts:433`。
5. gateable 记录旧门，正式半自动门的粒度需在计划 07 定稿；开书候选门不加入新计划。来源：`shared/types/directorWorkflowStepCatalogData.ts:137`、`docs/superpowers/specs/2026-09-30-director-rebuild-design.md:35`。

## 6. 核对口径

步骤 22 行、产物 23 行；UNKNOWN 条目：步骤 0/22，产物 1/23（4.35%）。该问题仅影响知识包审阅路由，不影响生产步骤的 requires / produces。源码依据为 `shared/types/novelWorkflow.ts:40`。不新增依赖、不改源码或数据库。
