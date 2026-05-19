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

- 默认 writer 继续整章一次性生成，不把 sceneCards、章节合同或分场景多轮写作重新接入正文热路径。
- 章节合同和 sceneCards 可作为规划、审校、诊断和局部修复辅助资产，不驱动默认正文生成。
- 正文生成前只做最低可写性检查：章节存在、人物可用、上下文包可组装、任务目标可解释。
- 生成后用一次结构化接收闸门判断是否可继续、是否需要局部修文、是否需要人工确认。
- 接收闸门里的 `acceptance` 与 `timeline` 采用并行执行，章节主链只等二者合并后的结果，不再顺序串行等待两个后置 LLM。
- 时间线检测属于接收闸门的一部分，但独立于质量审校。它检查未来事件泄漏、上一章钩子未承接、时间倒退、事件重复、状态冲突和计划事件缺失。
- 时间线检测失败时保留正文并标记 `needs_repair`，但不把失败正文抽取出的事件提交为 `occurred` 时间线。
- 时间线模块不能直接修改正文；它只输出结构化 issues，由现有局部修复或整章修复链路决定怎么修。
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
- 章节义务上下文的结构化提醒不能挤掉高风险资源和逾期伏笔。审阅与修复上下文应保留资源不可用、资源需确认、urgent/overdue payoff 等关键信号，防止 AI 修文在缺少约束的情况下继续使用失效道具或忽略必须兑现的压力。
- 接收闸门必须把未兑现义务输出为结构化 `missingObligations`，并给出 `repairability`：局部漏写用 `patchable_obligation_gap`，需要整章调整用 `rewrite_needed`，章节职责与邻章安排失配才用 `plan_misalignment`。
- 自动修文默认最多一次；失败后记录待修状态或 repair ticket，不进入无限重试。
- 局部 patch repair 是轻修优先策略，不是章节任务的唯一修复路径。补丁计划 Schema 校验失败、targetExcerpt 不唯一、targetExcerpt 太短、目标片段缺失或补丁无效时，应转为可恢复的局部修复失败，由上层质量链路升级到整章轻修或记录待修状态，不能直接让自动导演任务以原始 Zod 错误失败。
- patch repair 的 `targetExcerpt` 必须是正文中唯一可定位的原文片段；`replacement` 表示替换后的内容。删除重复片段时允许 `replacement` 为空字符串，但仍必须满足唯一定位和产生正文变化。
- 已有正文进入复审或质量修复时，不应先把同一份正文重新保存为 `drafted/generating`。正文未变化时只做审校、必要修复和最终资产同步，避免 UI 更新时间、RAG 队列和章节状态被无意义刷新。
- 自动导演的质量循环预算必须真正影响下一轮修复方式：同一失败签名已经尝试过局部修复后，下一轮章节管线要切到 `heavy_repair`，不能继续硬编码 `light_repair`。
- 章节执行失败语义必须区分：正文未生成是 `draft_generation_failed`；正文已生成但未兑现本章义务是 `draft_obligation_unmet`；自动修复后仍有阻塞问题是 `draft_repair_exhausted`；需要调整邻章计划是 `replan_required`。UI 和任务详情应展示真实根因，不再把这些情况统一压成 `chapter.draft.write 未满足其完成标准。`
- `urgentPayoffs`、`ledgerSummary.urgentCount` 和 `nextAction=advance_payoff` 是生成前的章节职责信号，只能进入写作上下文和接收闸门判断。它们不能在生成后单独触发 `replanRecommendation`，否则系统会把“本章应该推进 payoff”误判成“本章已经失败，需要重规划”。只有逾期 payoff、显式 `nextAction=replan`、高/严重审计问题或人工请求才应打断章节链路进入重规划。
- `autoReview=false` 时仍可保存正文并进入异步资产回灌。自动导演的 `chapter.quality.review` 事实检查应读取执行计划，把本轮不执行自动审校视为可解释的跳过事实；此时不能因为 `AuditReport` / `QualityReport` 数量为 0 而让已完成正文的批次失败。
- 同一章正文 content hash 未变化时，不重复跑状态快照、角色资源、伏笔账本和角色动态同步。
- 资产同步模式：
  - `adaptive`：默认模式，关键资产异步同步，高风险或周期节点触发全量伏笔校准。
  - `deferred`：快速产文，资产同步可延后批处理。
  - `strict`：等待必要资产同步后再继续下一章。

## 示例

推荐做法：

- 无 sceneCards 时，只要章节目标和上下文足够，允许生成正文。
- 接收闸门输出 repair directives 后，只做一次局部 patch repair。
- 伏笔每章默认写 delta，只有高风险、卷尾、周期节点或 strict 模式触发全量对账。

禁止做法：

- 因为有章节合同功能，就强制每章默认先重建合同再生成正文。
- 生成后默认串联 AI 味检测、轻审校、状态抽取、角色资源抽取、伏笔同步等多次 LLM 调用。
- 长度略超目标就直接失败或截断正文。

## 失败模式

- 一章生成耗时异常：检查是否又把多个 LLM 后处理塞回热路径。
- 同一章重复同步账本：检查 content hash checkpoint 是否生效。
- 修复循环：检查自动修文次数是否被限制，失败是否落到可恢复状态，并确认自动导演质量预算是否已经从局部修复升级到整章修复或重规划。
- `chapter.draft.write 未满足其完成标准` 高频出现：先查 runtime package 的 `failureClassification` 和 `obligationCoverage`。如果 root cause 是 `draft_obligation_unmet`，应优先检查接收闸门输出的缺失义务和 patch repair；如果是 `replan_required`，检查是否存在单章职责过载或邻章分工失配。
- 章节反复要求重规划：检查 `rolling_window_review` 的原因是否只来自生成前的紧急 payoff 或 `advance_payoff`。如果审计分数可通过、正文和 artifact delta 已经体现推进，但 runtime package 仍推荐重规划，说明重规划推荐读取了写前状态而不是写后失败证据。
- 页面看起来反复“更新”：先区分后端是否真的产生新正文。若章节正文未变但 `updatedAt`、RAG job 或任务 heartbeat 持续刷新，检查已有正文复审是否被重新保存为草稿。
- 正文已经可读但 UI 显示失败：检查正文状态、资产回灌状态和账本校准状态是否被混为一个状态。
- 关闭自动审校后任务停在 `chapter.quality.review facts are not complete yet`：优先检查运行态 seed payload 中的 `autoExecution.autoReview`、`autoExecutionPlan.autoReview` 和 `directorInput.autoExecutionPlan.autoReview` 是否传入事实检查。若这些字段为 `false`，质量审校步骤应输出 `reviewSkipped=true` 并继续后续状态提交。
- 章节出现未来剧情泄漏或上一章钩子未承接：优先检查 `timeline_context`、`previous_chapter_hook` 是否进入 writer prompt，以及 `TimelineCheckReport` 是否在失败时阻止了 occurred timeline 提交。
- 章节反复重复相同后置检测：检查同章同内容 hash 是否已经命中过 acceptance / timeline 门禁缓存。
- 章节出现阵营、身份、境界或当前状态错误：优先检查角色库是否已有硬事实，再检查 `GenerationContextPackage.characterHardFacts` 和 writer prompt 中的 `character_hard_facts` 是否存在。如果硬事实缺失，先修角色准备链路；如果硬事实已存在但未进入 writer，修上下文组装；如果已进入仍被违背，再查审计和修复链路。

## 相关模块

- `server/src/services/novel/runtime/ChapterRuntimeCoordinator.ts`
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
