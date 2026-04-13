# Auto Director Progress Audit

更新时间：2026-04-13

## 目标

这份文档用于沿着“自动导演创建”从用户填写表单后的链路做一次完整对账，重点回答三件事：

- 自动导演真实的生成链路现在到底走了哪些步骤。
- 这些步骤分别写到了哪些任务状态和进度字段里。
- 哪些动作现在虽然已经在后端发生了，但前端仍然只是隐性完成，容易让用户误以为卡住。

本次只覆盖“从创建页进入自动导演”的新建项目链路；现有项目接管会复用其中的大部分主链，但入口与起始阶段不同。

## 入口与任务建立

### 1. 创建页表单进入自动导演弹窗

前端入口在 [client/src/pages/novels/components/NovelAutoDirectorDialog.tsx](../../client/src/pages/novels/components/NovelAutoDirectorDialog.tsx)。

- 用户填写基础开书信息、灵感、运行方式。
- 前端先调用 `POST /novel-workflows/bootstrap` 建立或复用一条 `lane=auto_director` 的工作流任务。
- 任务初始状态来自 `NovelWorkflowService.createWorkflow()`：
  - `currentStage=AI 自动导演`
  - `currentItemKey=auto_director`
  - `currentItemLabel=等待生成候选方向`
- 弹窗打开期间会每 2 秒轮询一次任务详情。

### 2. 候选阶段接口

自动导演候选阶段有 4 类接口，全部在 [server/src/routes/novelDirector.ts](../../server/src/routes/novelDirector.ts) 暴露：

- `POST /novels/director/candidates`
- `POST /novels/director/refine`
- `POST /novels/director/patch-candidate`
- `POST /novels/director/refine-titles`

对应后端服务在 [server/src/services/novel/director/novelDirectorCandidateStage.ts](../../server/src/services/novel/director/novelDirectorCandidateStage.ts)。

## 完整生成链路

### A. 候选阶段

候选阶段当前有 4 个明确写入任务状态的子步骤：

| 顺序 | `currentItemKey` | 任务文案 | 后端动作 |
| --- | --- | --- | --- |
| 1 | `candidate_seed_alignment` | 整理项目设定/读取上一轮方案 | 整理灵感、基础表单、上一轮批次与修正意见 |
| 2 | `candidate_project_framing` | 对齐书级 framing | 对齐卖点、前 30 章承诺、气质约束等上下文 |
| 3 | `candidate_direction_batch` | 生成书级方案 | 运行结构化提示词，生成 2 套书级方向候选 |
| 4 | `candidate_title_pack` | 强化标题组 | 为每套方向补书名组，或只重做指定方案的标题组 |

完成后进入检查点：

- `checkpointType=candidate_selection_required`
- `status=waiting_approval`
- `currentItemLabel=等待确认书级方向`

也就是说，创建页里“选方向”前的完整链路不是单次生成，而是：

1. 整理输入
2. 对齐 framing
3. 生成方向候选
4. 为每套方向补标题组
5. 停在等待确认

### B. 方案确认与建书

用户确认某个候选方向后，前端调用 `POST /novels/director/confirm`，对应逻辑在 [server/src/services/novel/director/NovelDirectorService.ts](../../server/src/services/novel/director/NovelDirectorService.ts)。

这里的真实链路是：

1. `claimAutoDirectorNovelCreation()`
   - 抢占“建书”这一步，避免重复确认导致重复建项目。
2. `resolveDirectorBookFraming()`
   - 在真正创建小说前，先补齐目标读者、卖点、对标气质、前 30 章承诺等 framing。
3. `createNovel()`
   - 创建小说记录。
4. `attachNovelToTask()`
   - 把新小说挂到当前自动导演任务上。
5. `bootstrapTask()`
   - 把任务 seed payload 更新为“已进入 story macro 阶段”。
6. `scheduleBackgroundRun()`
   - 后台继续启动主链，不阻塞前端。

这一步完成后，任务会从“纯候选任务”变成“绑定具体 novelId 的自动导演主任务”。

### C. 主链阶段总览

方案确认后的后台主链由 `runDirectorPipeline()` 串起来，顺序如下：

1. `story_macro`
2. `character_setup`
3. `volume_strategy`
4. `structured_outline`
5. `chapter_execution / quality_repair`
   条件：只有 `runMode=auto_to_execution` 或用户在 `front10_ready/chapter_batch_ready` 后继续自动执行时才进入

### D. 故事宏观规划阶段

对应文件：

- [server/src/services/novel/director/novelDirectorStoryMacroPhase.ts](../../server/src/services/novel/director/novelDirectorStoryMacroPhase.ts)

真实执行顺序：

| 顺序 | `currentItemKey` | 后端动作 |
| --- | --- | --- |
| 1 | `story_macro` | 生成故事宏观规划 |
| 2 | `constraint_engine` | 构建约束引擎 |
| 3 | `book_contract` | 生成 Book Contract |
| 4 | 无单独状态 | `bookContractService.upsert()` 持久化 Book Contract |

### E. 角色准备阶段

对应文件：

- [server/src/services/novel/director/novelDirectorPipelinePhases.ts](../../server/src/services/novel/director/novelDirectorPipelinePhases.ts)

真实执行顺序：

| 顺序 | `currentItemKey` | 后端动作 |
| --- | --- | --- |
| 1 | `character_setup` | 生成自动可用的角色阵容候选 |
| 2 | 无单独状态 | 评估角色质量，判断是否允许自动应用 |
| 3 | `character_cast_apply` | 应用角色阵容到小说角色资产 |
| 4 | `character_setup_required` 检查点 | 运行方式为 `stage_review` 时停下审核；或质量不过关时强制停下 |

### F. 卷战略阶段

对应文件：

- [server/src/services/novel/director/novelDirectorPipelinePhases.ts](../../server/src/services/novel/director/novelDirectorPipelinePhases.ts)
- [server/src/services/novel/volume/volumeGenerationOrchestrator.ts](../../server/src/services/novel/volume/volumeGenerationOrchestrator.ts)

真实执行顺序：

| 顺序 | `currentItemKey` | 后端动作 |
| --- | --- | --- |
| 1 | `volume_strategy` | 生成卷战略 |
| 2 | `volume_strategy` | 卷战略的 `load_context` 子阶段 |
| 3 | `volume_skeleton` | 生成卷骨架 |
| 4 | `volume_skeleton` | 卷骨架的 `load_context` 子阶段 |
| 5 | 无单独状态 | `updateVolumes()` 持久化卷战略工作区 |
| 6 | `volume_strategy_ready` 检查点 | 运行方式为 `stage_review` 时停下审核 |

### G. 结构化拆章阶段

对应文件：

- [server/src/services/novel/director/novelDirectorPipelinePhases.ts](../../server/src/services/novel/director/novelDirectorPipelinePhases.ts)
- [server/src/services/novel/volume/volumeGenerationOrchestrator.ts](../../server/src/services/novel/volume/volumeGenerationOrchestrator.ts)

这是当前最容易“后台做了很多，前端还是像停住”的阶段。

真实执行顺序：

1. 循环需要准备的卷。
2. 对每一卷执行：
   - `beat_sheet`
   - `chapter_list`
   - `rebalance`
3. 针对章节标题做多样性检查，并把 notice 写进任务 seed payload。
4. `chapter_sync`
   - 同步卷工作区到章节执行区。
5. 选出后续自动执行范围。
6. 对选中章节逐章执行 3 种细化模式：
   - `purpose`
   - `boundary`
   - `task_sheet`
7. 再次持久化工作区并同步章节。
8. 更新小说整体状态为 `in_progress`。
9. 写入 `front10_ready` 检查点。

这里的任务状态写入点主要是：

| `currentItemKey` | 说明 |
| --- | --- |
| `beat_sheet` | 节奏板生成中 |
| `chapter_list` | 章节列表生成中 |
| `chapter_list` | 相邻卷衔接校准也复用这个 key |
| `chapter_sync` | 章节资源同步中 |
| `chapter_detail_bundle` | 章节批量细化中 |
| `front10_ready` | 已具备进入章节执行的准备 |

### H. 自动执行章节阶段

对应文件：

- [server/src/services/novel/director/novelDirectorAutoExecutionRuntime.ts](../../server/src/services/novel/director/novelDirectorAutoExecutionRuntime.ts)
- [server/src/services/novel/director/novelDirectorAutoExecution.ts](../../server/src/services/novel/director/novelDirectorAutoExecution.ts)

进入方式有两种：

- 创建时直接选择 `auto_to_execution`
- 已到 `front10_ready` 或 `chapter_batch_ready` 后，用户继续自动执行

真实执行顺序：

1. `resolveRangeAndState()`
   - 解析本次要跑的章节范围与剩余章节状态。
2. `syncAutoExecutionTaskState()`
   - 更新任务 seed payload、resume target、scope label。
3. 复用已有 pipeline job 或新建一条章节流水线任务。
4. 轮询 pipeline job：
   - 生成正文时映射为 `chapter_execution`
   - 审校时映射为 `quality_repair`
   - 修复时映射为 `quality_repair`
5. 根据结果进入三种出口之一：
   - `workflow_completed`
   - `chapter_batch_ready`
   - `failed/cancelled + chapter_batch_ready`

## 当前前端真正消费到的粒度

### 1. 自动导演弹窗进度面板

前端文件：

- [client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx](../../client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx)

当前只有两套固定步骤卡：

- 候选阶段：4 步
- 执行阶段：6 步

执行阶段的 6 步是：

1. 创建项目
2. Book Contract + 故事宏观规划
3. 角色准备
4. 卷战略 + 卷骨架
5. 第 1 卷节奏板 + 章节列表
6. 章节批量细化

这意味着：

- `rebalance`
- `chapter_sync`
- 多卷循环
- 章节执行中的生成/审校/修复

虽然在后端是独立动作，但在步骤卡上不会长出新的可见阶段。

### 2. 任务中心 / 小说列表 / 工作区任务面板

相关文件：

- [server/src/services/task/novelWorkflowExplainability.ts](../../server/src/services/task/novelWorkflowExplainability.ts)
- [server/src/services/task/novelWorkflowDetailSteps.ts](../../server/src/services/task/novelWorkflowDetailSteps.ts)
- [client/src/lib/novelWorkflowTaskUi.ts](../../client/src/lib/novelWorkflowTaskUi.ts)

这些入口会进一步把 `currentItemKey` 折叠回阶段级状态，例如：

- `candidate_seed_alignment`
- `candidate_project_framing`
- `candidate_direction_batch`
- `candidate_title_pack`

都会被理解成“自动导演阶段”。

同样地：

- `beat_sheet`
- `chapter_list`
- `chapter_sync`
- `chapter_detail_bundle`

都会被理解成“结构化拆章/章节准备阶段”。

因此，任务中心类入口比弹窗进度面板更粗。

## 当前仍然隐性完成或展示不足的动作

### A. 已有真实后端动作，但步骤卡不升维

1. 卷战略 `load_context -> prompt`
   - 后端确实会先整理上下文再发 prompt。
   - 前端只看到同一个“卷战略”步骤。

2. 卷骨架 `load_context -> prompt`
   - 与上面同理。

3. 节奏板 `load_context -> prompt`
   - 文案可能变化，但步骤卡仍停在“第 1 卷节奏板 + 章节列表”。

4. 章节列表 `load_context -> prompt`
   - 与上面同理。

5. `rebalance`
   - 后端明确存在“校准相邻卷衔接”动作，但前端没有单独步骤，只复用 `chapter_list`。

6. `chapter_sync`
   - “把拆章结果同步到章节执行区”是一个独立动作，但仍被折叠在结构化拆章的大步骤里。

7. 多卷循环
   - 如果自动执行范围跨多卷，后端会一卷一卷准备。
   - 前端步骤卡仍只有一个“节奏板 + 章节列表”和一个“章节批量细化”。

8. 章节执行中的“生成 / 审校 / 修复”
   - 后端已经能区分 `chapter_execution`、`reviewing`、`repairing`。
   - 但弹窗步骤卡不会从“章节批量细化”切成“章节生成”“自动审校”“自动修复”三段。

### B. 后端已经发生，但前端现在基本只靠文案或根本没单独暴露

1. 确认方案后先做 `resolveDirectorBookFraming()`
   - 用户看到的是“正在创建小说项目”。
   - 但创建前其实还会补一轮 framing。

2. Book Contract 持久化
   - 生成完成后还有 `bookContractService.upsert()`。
   - 当前没有单独状态。

3. 角色质量评估与“是否自动落库”的判断
   - 这是自动导演能否继续推进的关键门槛。
   - 当前不是独立进度步骤。

4. 候选阶段给每套方案逐个增强标题组
   - 后端会对每个候选做标题增强。
   - 前端只看到一个总的 `candidate_title_pack`。

5. 章节标题多样性检查
   - 后端会在章节列表生成后写入 `taskNotice`。
   - 但进度面板没有把这一步抬成独立提示。

6. 自动执行前的“复用已有 pipeline job / 恢复已有范围状态”
   - 后端在进入章节流水线前会做一轮对账与接管。
   - 这部分目前主要体现在日志里。

### C. 最容易让用户误以为“卡住”的进度冻结点

1. `book_contract` 的进度值顺序当前有问题
   - `DIRECTOR_PROGRESS.bookContract=0.14`
   - 但真实执行顺序是 `story_macro(0.22) -> constraint_engine(0.30) -> book_contract(0.14)`
   - 由于 `markTaskRunning()` 会取 `Math.max(existing.progress, input.progress)`，所以生成 Book Contract 时数值不会前进，容易看起来卡在 30%。

2. 候选阶段没有 heartbeat
   - 候选阶段直接用 `markTaskRunning()`，没有复用 `runDirectorTrackedStep()` 的等待时长刷新。
   - 一旦结构化生成或标题增强耗时较长，文案与百分比都可能长时间不动。

3. `generateVolumes()` 内部的长 prompt 只有阶段切换，没有持续 heartbeat
   - `load_context` 和 `prompt` 可以更新一次状态。
   - 但真正 prompt 跑很久时，不会持续补“已等待 xx 秒”。

4. 章节细化单步可能很长
   - `chapter_detail_bundle` 虽然会按章节和细化模式前进。
   - 但单次 `purpose/boundary/task_sheet` 生成中没有独立 heartbeat。

5. 任务摘要把运行中的章节自动执行压成统一状态
   - `buildWorkflowExplainability()` 会把 `front10_ready/chapter_batch_ready` 下的运行中任务统一显示成“前 10 章自动执行中”。
   - 这会丢掉当前到底是“生成中”“审校中”“修复中”，也会丢掉真实范围是否是“第 11-20 章”或“第 2 卷”。

6. 多个前端入口对同一任务的粒度不一致
   - 弹窗能看到 `currentItemLabel`。
   - 任务中心、列表徽标和摘要文案会进一步折叠。
   - 用户切换页面后，经常会感觉“怎么又变回一个很笼统的状态”。

## 当前结论

从代码链路看，自动导演后端的实际动作已经明显比前端主进度条展示得更细。

当前最关键的可见性缺口不是“完全没有状态”，而是：

1. 后端已经有不少真实子步骤，但前端步骤卡还停留在阶段级粗粒度。
2. 部分阶段只有文案变，没有百分比变。
3. 少数关键动作甚至只存在于日志和后端状态流转里，没有被抬成用户可感知的进度节点。
4. `book_contract` 这一步还存在明确的进度值排序问题，会直接制造“进度不动”的错觉。

## 关键代码锚点

- 创建弹窗与轮询：[client/src/pages/novels/components/NovelAutoDirectorDialog.tsx](../../client/src/pages/novels/components/NovelAutoDirectorDialog.tsx)
- 自动导演进度面板：[client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx](../../client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx)
- 候选阶段服务：[server/src/services/novel/director/novelDirectorCandidateStage.ts](../../server/src/services/novel/director/novelDirectorCandidateStage.ts)
- 确认与主链编排：[server/src/services/novel/director/NovelDirectorService.ts](../../server/src/services/novel/director/NovelDirectorService.ts)
- 故事宏观规划：[server/src/services/novel/director/novelDirectorStoryMacroPhase.ts](../../server/src/services/novel/director/novelDirectorStoryMacroPhase.ts)
- 角色/卷战略/拆章主阶段：[server/src/services/novel/director/novelDirectorPipelinePhases.ts](../../server/src/services/novel/director/novelDirectorPipelinePhases.ts)
- 章节自动执行运行时：[server/src/services/novel/director/novelDirectorAutoExecutionRuntime.ts](../../server/src/services/novel/director/novelDirectorAutoExecutionRuntime.ts)
- 卷生成编排器：[server/src/services/novel/volume/volumeGenerationOrchestrator.ts](../../server/src/services/novel/volume/volumeGenerationOrchestrator.ts)
- 任务状态与检查点写入：[server/src/services/novel/workflow/NovelWorkflowService.ts](../../server/src/services/novel/workflow/NovelWorkflowService.ts)
- 任务摘要折叠逻辑：[server/src/services/task/novelWorkflowExplainability.ts](../../server/src/services/task/novelWorkflowExplainability.ts)
- 任务详情步骤折叠逻辑：[server/src/services/task/novelWorkflowDetailSteps.ts](../../server/src/services/task/novelWorkflowDetailSteps.ts)
