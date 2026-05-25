# 章节生产链路

## 背景

章节生产曾经把章节合同、正文生成、AI 检测、修文、轻校验、角色动态、状态快照、角色资源、伏笔账本等能力串进同一条热路径。能力本身有价值，但全部同步执行会导致用户等待变长、LLM 调用重复、修复循环和账本重复同步。

长篇小说主链路的目标是持续写完整本书。默认路径必须先产出可读正文，再把需要回灌的状态和账本异步处理。

## 决策

章节生产采用双通道：

```text
轻量预检 -> 整章正文生成 -> 接收闸门 -> 时间线检测 -> 可选局部修文
                                      |
                                      v
                              异步资产回灌通道
```

正文热路径只负责尽快生成、判断、保存和局部修复章节。状态快照、角色资源、关系动态和伏笔账本通过异步、幂等、可批处理的资产回灌通道写入。

## 当前规则

- 高优先级硬约束：控制入口可以不同，但正文生成与正文修复的业务执行链必须唯一；批量执行、自动导演、手动单章生成、手动单章修复不得各自维护独立实现。
- 章节唯一执行链定义如下：
  - 控制入口统一经 `novelProductionOrchestrator`。
  - 手动单章生成、批量执行与自动导演的章节生产统一落到 `ChapterExecutionStageRunner`。
  - 手动单章修复与书级重规划统一落到 `quality_repair` stage；其中会改正文的修复入口必须委托给 `ChapterRuntimeCoordinator`。
  - 正文 writer、接收闸门、patch repair、heavy repair、保存正文、资产同步、复审和状态推进必须复用同一套 runtime 规则，不允许 route、旧 service 或导演分支各自再维护第二套正文执行实现。
- `NovelGenerationService.createChapterStream`、`NovelService.createRepairStream`、`startPipelineJob / resumePipelineJob` 只是不同控制入口；它们的业务执行面必须继续汇入同一 coordinator，而不是按入口复制 writer 或修文逻辑。
- 默认 writer 继续整章一次性生成，不把 sceneCards、章节合同或分场景多轮写作重新接入正文热路径。
- 章节合同和 sceneCards 可作为规划、审校、诊断和局部修复辅助资产，不驱动默认正文生成。
- 正文生成前只做最低可写性检查：章节存在、人物可用、上下文包可组装、任务目标可解释。
- 生成后用一次结构化接收闸门判断是否可继续、是否需要局部修文、是否需要人工确认。
- 接收闸门里的 `acceptance` 与 `timeline` 采用并行执行，章节主链只等二者合并后的结果，不再顺序串行等待两个后置 LLM。
- 时间线检测属于接收闸门的一部分，但独立于质量审校。它检查未来事件泄漏、上一章钩子未承接、时间倒退、事件重复、状态冲突和计划事件缺失。
- 时间线检测失败时保留正文并标记 `needs_repair`，但不把失败正文抽取出的事件提交为 `occurred` 时间线。
- 时间线模块不能直接修改正文；它只输出结构化 issues，由现有局部修复或整章修复链路决定怎么修。
- 高优先级硬约束：章节进入下一章前必须满足 `final_content -> timeline_finalization -> next_chapter`。`final_content` 指初稿通过后的正文、修复通过后的正文，或达到最大修复次数后允许跳过时保留的当前最佳正文。
- 初稿需要修复时不得提交修复前 timeline。timeline finalization 必须等待最终正文确定；如果修复成功，使用修复后正文提交；如果最大修复次数耗尽但允许 `defer_and_continue`，必须先提交 degraded timeline，再登记质量债务并继续。
- timeline finalization 只有一个入口：`ChapterTimelineFinalizationService`。它负责保存 `ChapterTimeAnchor`、提交 occurred events、新 hook、hook 承接状态，并写入 `ChapterArtifactSyncCheckpoint`，其中 `artifactType=timeline_finalization`，`syncMode=stable | degraded`。
- `stable` 表示 timeline extractor 成功并基于最终正文完成事件、钩子和时间锚点提交；`degraded` 表示抽取失败、缺少上下文或跳过章节时写入最小时间锚点和 checkpoint。degraded 是“可继续承接的最小状态”，不是质量通过。
- timeline extractor 失败不能伪装成空事件的 stable commit。抽取失败必须写 degraded checkpoint，并在 metadata 中记录 `extractorSucceeded=false`、失败原因、事件数、hook 数和是否使用 fallback anchor。
- 下一章生成前必须检查上一章当前正文 content hash 是否已有 `timeline_finalization` checkpoint。没有 checkpoint 时应先补跑 finalization；补跑无法 stable 时提交 degraded checkpoint，不能在没有任何 finalization 记录的情况下继续组装下一章上下文。
- hook 关闭以 extractor 输出的 `addressedHookIds / resolvedHookIds` 为主。字符串包含匹配只能作为兼容旧数据的安全辅助，不得作为新的主判断方式；Prompt 必须把 open hook id 提供给 extractor。
- writer prompt 必须包含原始 `chapter.taskSheet` 和上一章实际正文尾段。任务单负责保留导演拆章的精细执行约束，上一章尾段负责约束本章开头的时间、地点、人物状态和未兑现动作，二者不能被 timeline_context 或旧摘要挤掉。
- heavy repair 不能传空 RAG/连续性上下文。修复上下文至少要压缩注入最近章节摘要、上一章尾段、关键 open conflicts、角色硬事实和资源事实，避免修复后引入新的连续性矛盾。
- 角色硬事实属于生成前必需约束。writer 必须收到 `character_hard_facts` required context，用于约束角色身份、阵营、立场、境界/战力、当前位置、可出场状态和禁止误写项。
- `participant_subset` 只提供参与角色的软性简介和当前行为提示，不能替代 `character_hard_facts`。在 token 压力下可以压缩软信息，但不能裁掉角色硬事实。
- `character_hard_facts` 进入 writer 前会按章节参与者、当前高风险角色和动态导向做子集筛选，避免把整本角色硬事实全量塞进正文上下文。
- 角色阵营、身份、境界错误应优先排查角色库和 `character_hard_facts` 上下文，而不是只归因于时间线或质量审计。
- 审计和修复仍然负责生成后检测角色冲突，但它们是后置保险，不应作为正文生成时的主要角色事实来源。
- 章节正文写完后，后置门禁会记录统一 trace：章节、阶段、阻断性、内容 hash、时长和 prompt asset key，用于区分 writer 本身耗时与审校耗时。
- 章节执行页的前端投影采用三栏职责：左侧只负责切章和查看队列状态，中间只承接正文阅读和必要正文操作，右侧承接章节侧栏和 AI 执行台。
- 右侧章节侧栏再细分为 `本章概览 / 时间线 / 角色动态 / 资源风险`。`本章概览` 只放当前章节状态、字数、目标、待处理问题和更新时间，不混入时间线约束；时间线只展示时间锚点、上一章钩子、计划推进、禁止提前发生事项和检测结果。
- 右侧侧栏不得新增写入流程。时间线来自章节时间线接口，检测摘要优先使用 runtime package 或最新 `TimelineCheckReport`，角色动态来自状态快照，资源与风险来自现有资源上下文和运行时风险摘要。
- 桌面端左中右三栏应保持同高工作区，并在各自栏内独立滚动；移动端应折叠成分组区域，优先保留正文阅读和章节操作空间。
- 右侧栏只展示会影响后续写作的约束、状态、诊断和执行操作，不应重复中间正文区的完整正文。
- 任务单、场景拆解、质量报告、修复记录、上下文与问题诊断属于右侧资料诊断；中间区只保留正文卡和必要正文操作，避免摘要层和诊断层反复占据正文阅读空间。
- 章节热路径必须维护统一的章节义务合同：`mustHitNow`、`mustPreserve`、`requiredPayoffTouches`、`requiredCharacterAppearances`、`requiredGoalChanges`、`canDefer`、`forbiddenCrossings`。writer、接收闸门、局部修复和重规划判断都应消费同一份合同，避免规划、写作和审核各自解释章节职责。
- 章节修复、审阅和上下文组装必须兼容旧运行记录中的章节写作上下文。旧 `chapterWriteContext` 如果缺少新增的 `obligationContract`，运行时应补齐空合同，而不是让修复流崩溃；补齐后仍由当前章节任务、角色职责、伏笔账本和资源状态重新组织审阅与修复上下文。
- 任务详情、章节事实检查和运行态投影必须只读；`recover` 只负责返回可恢复位置和理由，不得在轮询或快照读取时写入恢复事件。否则页面刷新会把“可恢复状态”误记成“正在再次执行”，并制造重复的伏笔同步假象。
- 章节执行步骤的就绪性、完成度和断点续跑位置必须优先读取真实产物事实：`Chapter.content`、`AuditReport / QualityReport`、阻塞 issue、`StoryStateSnapshot / CanonicalStateVersion` 和权威审批状态。`task.status`、`chapterStatus`、`state.chapterProgress` 只能作为投影或诊断提示，不能决定章节是否已生成、是否需要修复、是否可以进入下一章。
- 如果任务状态和章节事实冲突，以章节事实为准：有正文但旧任务失败时允许从真实进度继续；旧 `chapterStatus=needs_repair` 但阻塞 issue 已关闭时不能反复进入修复；旧 `chapterStatus=completed` 但正文缺失时不能视为完成。
- 章节义务上下文的结构化提醒不能挤掉高风险资源和逾期伏笔。审阅与修复上下文应保留资源不可用、资源需确认、urgent/overdue payoff 等关键信号，防止 AI 修文在缺少约束的情况下继续使用失效道具或忽略必须兑现的压力。
- 接收闸门必须把未兑现义务输出为结构化 `missingObligations`，并给出 `repairability`：局部漏写用 `patchable_obligation_gap`，需要整章调整用 `rewrite_needed`，章节职责与邻章安排失配才用 `plan_misalignment`。
- 自动修文默认最多一次；失败后记录待修状态或 repair ticket，不进入无限重试。
- 局部 patch repair 是轻修优先策略，不是章节任务的唯一修复路径。补丁计划 Schema 校验失败、targetExcerpt 不唯一、targetExcerpt 太短、目标片段缺失或补丁无效时，应转为可恢复的局部修复失败，由上层质量链路升级到整章轻修或记录待修状态，不能直接让自动导演任务以原始 Zod 错误失败。
- 所有会改正文的修复入口统一遵循同一条修复规则：先尝试 patch repair；patch repair 因 Schema、定位、命中歧义或补丁无效失败时，只允许自动升级一次 `heavy_repair`；成功后统一走保存正文、资产同步、复审与状态更新；失败后手动修复返回真实失败，批量执行与自动导演记录质量债务或 recoverable failure 后继续后续章节。
- patch repair 的 `targetExcerpt` 必须是正文中唯一可定位的原文片段；`replacement` 表示替换后的内容。删除重复片段时允许 `replacement` 为空字符串，但仍必须满足唯一定位和产生正文变化。
- 已有正文进入复审或质量修复时，不应先把同一份正文重新保存为 `drafted/generating`。正文未变化时只做审校、必要修复和最终资产同步，避免 UI 更新时间、RAG 队列和章节状态被无意义刷新。
- 自动导演的质量循环预算必须真正影响下一轮修复方式：同一失败签名已经尝试过局部修复后，下一轮章节管线要切到 `heavy_repair`，不能继续硬编码 `light_repair`。
- 章节执行失败语义必须区分：正文未生成是 `draft_generation_failed`；正文已生成但未兑现本章义务是 `draft_obligation_unmet`；自动修复后仍有阻塞问题是 `draft_repair_exhausted`；需要调整邻章计划是 `replan_required`。UI 和任务详情应展示真实根因，不再把这些情况统一压成 `chapter.draft.write 未满足其完成标准。`
- 质量闭环投影必须区分阻塞错误和非阻塞质量债务。`terminalAction=defer_and_continue` 且不是 `replan_required` / `recommendedAction=replan` / `blockingObligations` 的章节，只能作为“已记录质量债务”弱提示，不得驱动主状态进入“出错需处理”或生成 repair ticket；`replan_required` 即使同时带有 `defer_and_continue`，也仍是阻塞重规划。
- `urgentPayoffs`、`ledgerSummary.urgentCount` 和 `nextAction=advance_payoff` 是生成前的章节职责信号，只能进入写作上下文和接收闸门判断。它们不能在生成后单独触发 `replanRecommendation`，否则系统会把“本章应该推进 payoff”误判成“本章已经失败，需要重规划”。只有逾期 payoff、显式 `nextAction=replan`、高/严重审计问题或人工请求才应打断章节链路进入重规划。
- `autoReview=false` 时仍可保存正文并进入异步资产回灌。自动导演的 `chapter.quality.review` 事实检查应读取执行计划，把本轮不执行自动审校视为可解释的跳过事实；此时不能因为 `AuditReport` / `QualityReport` 数量为 0 而让已完成正文的批次失败。
- 同一章正文 content hash 未变化时，不重复跑状态快照、角色资源、伏笔账本和角色动态同步。
- 任何数据回填、同步、抽取或索引刷新，都必须等章节进入稳定终态后再执行；章节仍处于修复、重写或回退过程中时，只允许保留正文与必要审校结果，不能提前把这类动作挂回热路径。timeline finalization 是进入下一章前的状态闭合步骤，不属于可随意延后的后台资产回灌。
- 资产同步模式：
  - `adaptive`：默认模式，关键资产异步同步，高风险或周期节点触发全量伏笔校准。
  - `deferred`：快速产文，资产同步可延后批处理。
  - `strict`：等待必要资产同步后再继续下一章。

## 示例

推荐做法：

- 无 sceneCards 时，只要章节目标和上下文足够，允许生成正文。
- 接收闸门输出 repair directives 后，只做一次局部 patch repair。
- 接收闸门的自动修复只允许一次自动重试；仍未通过时，章节进入“未通过但继续生产”的终态，不再同时保留互相冲突的通过态与待修态。
- 伏笔每章默认写 delta，只有高风险、卷尾、周期节点或 strict 模式触发全量对账。
- 背景资产回灌只消费已完成的稳定快照，不回拉主链，不因为同章的终态质量告警反复重跑正文链路。
- 跳过章节时，先提交 degraded timeline，再进入下一章；不能把跳过当成绕过 timeline 的捷径。

禁止做法：

- 因为有章节合同功能，就强制每章默认先重建合同再生成正文。
- 生成后默认串联 AI 味检测、轻审校、状态抽取、角色资源抽取、伏笔同步等多次 LLM 调用。
- 长度略超目标就直接失败或截断正文。
- 给手动单章修复、批量执行、自动导演或 Creative Hub 分别新增独立的 writer、patch repair 或 full rewrite 实现。
- 把 patch repair 的原始技术错误直接暴露成新的流程分支，例如 `targetExcerpt too_small` 直接终止手动修复，而不是交给统一质量链升级一次全文修复。

## 失败模式

- 一章生成耗时异常：检查是否又把多个 LLM 后处理塞回热路径。
- 同一章重复同步账本：检查 content hash checkpoint 是否生效。
- 修复循环：检查自动修文次数是否被限制，失败是否落到可继续生产的终态，并确认自动导演质量预算是否已经从局部修复升级到整章修复或重规划。
- `chapter.draft.write 未满足其完成标准` 高频出现：先查 runtime package 的 `failureClassification` 和 `obligationCoverage`。如果 root cause 是 `draft_obligation_unmet`，应优先检查接收闸门输出的缺失义务和 patch repair；如果是 `replan_required`，检查是否存在单章职责过载或邻章分工失配。
- 章节反复要求重规划：检查 `rolling_window_review` 的原因是否只来自生成前的紧急 payoff 或 `advance_payoff`。如果审计分数可通过、正文和 artifact delta 已经体现推进，但 runtime package 仍推荐重规划，说明重规划推荐读取了写前状态而不是写后失败证据。
- 页面看起来反复“更新”：先区分后端是否真的产生新正文。若章节正文未变但 `updatedAt`、RAG job 或任务 heartbeat 持续刷新，检查已有正文复审是否被重新保存为草稿。
- 正文已经可读但 UI 显示失败：检查正文状态、资产回灌状态和账本校准状态是否被混为一个状态。
- 第 3-8 章这类章节都显示“建议补写修复 / 质量需修复”：先检查 `riskFlags.qualityLoop` 是否是 `defer_and_continue` 质量债务。若没有 `replan_required`、`recommendedAction=replan` 或 `blockingObligations`，主界面和 AI 驾驶舱不得把它显示为阻塞错误。
- 关闭自动审校后任务停在 `chapter.quality.review facts are not complete yet`：优先检查运行态 seed payload 中的 `autoExecution.autoReview`、`autoExecutionPlan.autoReview` 和 `directorInput.autoExecutionPlan.autoReview` 是否传入事实检查。若这些字段为 `false`，质量审校步骤应输出 `reviewSkipped=true` 并继续后续状态提交。
- 章节出现未来剧情泄漏或上一章钩子未承接：优先检查 `timeline_context`、`previous_chapter_hook` 是否进入 writer prompt，以及 `TimelineCheckReport` 是否在失败时阻止了 occurred timeline 提交。
- 下一章开头出现时间回退或重复承接旧钩子：优先检查上一章当前 content hash 是否有 `timeline_finalization` checkpoint、`ChapterTimeAnchor` 是否已落库、hook 是否通过 `addressedHookIds / resolvedHookIds` 关闭，以及上一章尾段是否进入 writer prompt。
- 修复后仍从旧时间线继续：检查修复成功路径是否基于修复后正文调用 timeline finalization。若只在初稿路径提交 timeline，说明修复路径仍存在状态断层。
- 跳过后后续章节脱节：检查跳过动作是否先提交 degraded timeline。若没有 degraded checkpoint，后续章节会只能读取旧 hook 或空时间锚点。
- 章节反复重复相同后置检测：检查同章同内容 hash 是否已经命中过 acceptance / timeline 门禁缓存。
- 章节出现阵营、身份、境界或当前状态错误：优先检查角色库是否已有硬事实，再检查 `GenerationContextPackage.characterHardFacts` 和 writer prompt 中的 `character_hard_facts` 是否存在。如果硬事实缺失，先修角色准备链路；如果硬事实已存在但未进入 writer，修上下文组装；如果已进入仍被违背，再查审计和修复链路。

## 相关模块

- `server/src/services/novel/runtime/ChapterRuntimeCoordinator.ts`
- `server/src/services/novel/runtime/repair/`
- `server/src/services/novel/runtime/ChapterArtifactDeltaService.ts`
- `server/src/modules/timeline/`
- `server/src/services/novel/characters/characterHardFacts.ts`
- `server/src/services/novel/production/`
- `server/src/prompting/prompts/novel/`
- `client/src/pages/novels/components/chapterExecution.shared.tsx`
- `client/src/pages/novels/components/ChapterExecutionResultPanel.tsx`
- `client/src/pages/novels/components/chapterInsights/`

## 来源文档

- [正文产出链路瘦身与资产回灌优化计划](../../plans/chapter-output-pipeline-optimization-plan.md)
- [README 最新更新](../../../README.md)
- [版本更新说明](../../releases/release-notes.md)
