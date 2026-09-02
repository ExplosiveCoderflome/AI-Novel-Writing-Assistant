# 自动导演 Runtime 与恢复边界

## 背景

自动导演承担从灵感、开书、规划、角色准备、卷章规划到章节执行的主链路。历史问题集中在三个方向：Web API 被长任务拖死、继续/恢复/接管入口语义不统一、任务状态和运行时状态多源推断。

这些问题不能靠减少前端轮询、延迟 toast 或禁用按钮解决。根因是自动导演执行面和 Web API 控制面必须隔离，运行状态必须能从事实源投影出来。

## 决策

自动导演采用控制面和执行面分离：

```text
用户动作
  -> Web API command route
  -> DirectorRunCommand / WorkflowTask queued
  -> Director Worker lease
  -> DirectorPipelineEngine / Step Module
  -> PolicyEngine
  -> Artifact Ledger / DirectorEvent
  -> Runtime Projection
  -> 前端轻量查询
```

Web API 只接收命令和返回轻量投影；Worker 负责执行重型生产链路；运行状态从 `DirectorRun / DirectorStepRun / DirectorArtifact / DirectorEvent` 等事实源生成。

## 当前规则

### 统一问题治理与停止边界

自动导演的新任务使用一条统一问题链路：生产阶段报告稳定问题码，治理服务结合任务启动时冻结的全局/本书问题动作，写入 `issue_detected`、执行既有处理入口，再写入 `issue_action_applied`。已带稳定问题码的事件直接使用调用方提供的结构化事实，不再重复调用 AI；只有 `runtime.unclassified` 才调用结构化 AI 补全问题分类。AI 评估不得改变控制流。完整问题记录保存在 `DirectorEvent.metadata`，不另建问题表；相同 fingerprint 必须幂等。旧任务没有 `issueGovernanceVersion: 1` 时继续使用原运行逻辑。

策略优先级固定为：不可突破的安全规则 > 本书覆盖 > 全局设置 > 内置默认。运行中的任务只读取 seed 中的有效策略快照，避免规则修改后改变已经开始的生产链。全局规则保存完整策略；本书逐项调整时可以只保存与全局不同的覆盖项，但选择命名预设时必须把全部问题动作写成完整快照。预设生效后不再逐项提供“继承全局”，只有整本恢复继承才能解除该快照，避免后续全局设置静默改变用户选定的生产路线。

问题管理提供“优先完成整本书”和“质量优先”两份预设，但它们只是同一份问题策略的数据起点，不得派生两条正文生产链。两份预设都把自动重试上限限制为 0 或 1；章节运行、审核、修复和规划模块只报告问题事实，由统一决策函数根据任务快照返回动作。“优先完成整本书”会在已有可用正文时登记局部质量债并继续；“质量优先”无论处于人工分阶段还是整本自动创作，只要统一决策为 `pause_for_manual`，都必须停在已保存的章节边界等待显式恢复。用户逐项调整后仍只是本书策略覆盖，不引入新的运行模式。

问题动作只有 `auto_retry`、`continue_with_warning`、`pause_for_manual`、`fail_task`。局部质量债、接收检查不可用、局部修复失败与后台预取失败是否继续，由任务冻结的问题策略统一决定；执行器不得因运行模式再次改写该动作。明确重规划、异常用量、受保护内容与数据完整性风险必须暂停；没有可用正文或无法确认关键结果已保存时不能仅提醒后继续。模型、服务、路线窗口、执行合同、工作线程失联和一般运行失败优先使用任务快照中的唯一重试预算，耗尽后再执行对应策略动作。

问题落账必须遵守固定顺序：识别问题并写入 `issue_detected`，执行治理动作，动作成功后再写入 `issue_action_applied`。动作执行失败必须向运行边界抛出，不能吞掉异常，也不能留下“问题已处理但任务状态没有变化”的假记录。同一异常只能在最接近安全恢复点的边界治理一次；章节内部可安全重试时由章节边界处理，已经越过章节边界的路线规划、保存或未知运行异常统一交给流水线终结边界处理，调用点不得先记一次问题、外层再改成通用失败。

每章的唯一自动重试预算同时覆盖运行异常后的整章重试和验收失败后的正文修复。运行重试消耗预算后，重新进入章节流水线时必须把剩余预算传给内部修复；只有真正执行正文修复后才登记消耗，接收判断暂时不可用等仅保留正文并登记复查的问题不得占用修复机会。两层不得各自持有一次机会，也不得因为异常发生在修复途中而重新获得预算。

`pause_for_manual` 必须在当前章节保存完成后把章节流水线标记为 `pendingManualRecovery`，不能把部分完成任务写成成功。自动导演和后台恢复只投影该暂停，不得自行清除；恢复中心或用户明确发出的继续命令才可解锁流水线，并从下一未完成章节续跑。

工作流进入失败、取消、成功或人工恢复状态时，仍处于 `running` 的步骤记录必须在同一任务状态提交边界收束为对应终态。人工恢复使用 `waiting_approval`，不能遗留一批永久运行中的步骤。后续 seed payload 同步只补充恢复上下文，不得覆盖任务的 `pendingManualRecovery`。

滚动章节路线和章节执行合同属于两个阶段。路线窗口只负责生成并同步章节级大纲，允许新章节暂时缺少 task sheet、scene cards 等执行合同；真正执行该章前，再由 JIT 边界补齐并校验完整合同。禁止在路线同步阶段用执行期完整性校验阻断下一章，否则会出现“第 N 章已保存，第 N+1 章大纲已生成，却因合同尚未生成而整批失败”的假故障。后台 JIT 预取只是性能优化，失败只记日志；正式执行时仍会同步重试，因此不得把后台预取失败登记为已治理的生产问题。

服务重启或租约过期后的自动恢复如果再次失败，也必须写回 `pendingManualRecovery`，保留原任务与检查点供用户恢复，不能直接把可恢复任务终结为失败。恢复查询必须排除已经处于人工恢复状态的任务；重新执行时继续使用 `skipCompleted` 和持久化章节事实，从最早未完成章节开始，不能重写已经完成或已按质量债降级收束的章节。

启动顺序必须先完成 `initializePendingRecoveries`，再启动 Director Worker。命令候选查询和条件占用都必须排除 `pendingManualRecovery=true` 的任务；队列不得自己维护第二套租约 SQL，而应统一委托 `DirectorCommandLeaseService`。这样即使恢复状态在查询与占用之间变化，后台也不能绕过人工恢复入口重新执行旧命令。

前端从同一事件账本投影问题码、阶段、章节、风险分、实际动作与策略来源。章节问题跳转到章节编辑器，书级问题回到小说工作区或恢复入口。问题记录是质量债和恢复定位依据，不应把可继续的局部问题伪装成全书失败。

### 逐步协作与自动模式兼容

### 书级候选确认的数据所有权与编码完整性

#### 背景

书级候选由服务端生成并保存在导演任务的 `batches` 快照中。确认动作表达的是“用户选择了哪一批、哪一个候选以及哪个书名”，不是让浏览器重新成为候选正文的事实源。若确认接口无条件使用前端回传的整份候选对象，浏览器、代理或外部恢复工具发生字符集错误时，会把服务端原本完整的中文候选覆盖成包含 Unicode 替换字符的不可逆文本，并继续污染小说、任务 Seed 和后续规划输入。

#### 决策

候选确认以任务快照为事实源。服务端必须先用 `batchId + candidateId` 找到已保存候选，再执行确认；前端回传的候选正文不能覆盖服务端候选。用户明确选过的有效书名优先于候选批次中的默认书名，避免重试时把用户决定退回 AI 默认值。

#### 当前规则

- 有候选批次的任务必须同时匹配 `batchId` 和 `candidateId`；不匹配时要求刷新候选，不得猜测或改选其他方向。
- 候选的定位、卖点、冲突、主角路径、钩子、推进循环和结局方向从服务端任务快照恢复。已保存且不含编码损坏的上一次确认候选可作为更高优先级来源，用于保留用户选择的备选书名。
- `idea`、读者承诺、商业标签等书级输入若出现 Unicode 替换字符 `U+FFFD`，只能从同一任务的干净 Seed 快照恢复；恢复后仍存在替换字符时，必须在 `bootstrapTask`、命令入队和小说创建之前拒绝请求。
- `U+FFFD` 检查属于输入完整性保护，不承担创作语义判断，也不改变用户选择。题材、方向和书名仍由用户已确认的结构化 ID 与快照决定。
- `DirectorRunCommand` 的历史 payload 只用于诊断和审计，不能在重试时覆盖当前任务的候选事实。

#### 既有数据修复

修复已写入的乱码前必须先做可验证数据库备份。恢复来源按“最早的干净确认命令 → 服务端候选批次 → 其他持久化事实”排序；含 `U+FFFD` 的文本不能靠字符集逆转换猜测原文。修复应同步小说基本字段、任务 Seed、规划源输入和世界生成来源等仍会被后续生产读取的事实；历史损坏命令可保留为审计证据。

自动导演的新书起始页允许用户可选指定“题材基底”和一个“主要推进模式”。两项都不是开书门槛：未指定的部分由结构化 AI 资源推荐补齐，辅助推进模式默认由 AI 选择。用户明确选择的资源具有最高优先级，推荐服务只能校验资源仍然有效并补齐空项，不能静默替换。最终解析出的题材、主推进模式、辅助推进模式及其来源必须写入任务快照，并随候选确认保存到小说，供世界设定、人物、大纲、章节规划、正文、审校和修复读取同一份创作基础。

起始页的“没有想法”灵感也必须遵守同一优先级。请求应向 Prompt 提供资源的可读路径和简短说明，不能只提供数据库 ID；五条灵感可以改变主角、第一章事件、冲突、关系或悬念切口，但不能通过更换用户确认的题材或主要推进模式制造差异。未选择的创作基础仍允许 AI 自行补足。

候选方向与创作基础属于同一份生成合同。候选生成后若用户修改题材或主要推进模式，界面必须先说明旧方向需要重新适配；确认后同时清除前端候选和任务快照中的旧候选，再重新调用候选生成，禁止让旧候选继续携带上一套资源上下文。资源已删除、失效或无法读取时应提示重新选择；不能通过名称匹配、关键词或硬编码路由猜测替代资源。资源树加载失败不应阻止用户输入想法，未选择状态仍可交给 AI 自动搭配。

同一批书级候选的主书名必须保持可辨识。模型应先产出不同的 `workingTitle`，每套候选的标题补强仍可并行执行；整批完成后，运行时必须使用统一的近似标题比较规则检查跨候选重复。发生冲突时优先采用该候选已有的非重复备选标题，只有没有可用备选时才针对冲突候选重生标题，并把已占用书名作为禁止上下文。若重生后仍无可区分标题，应明确失败并允许重试，不能把重复主书名交给用户选择。

自动导演的书名补强是“主书名决策”，不是标题工坊的“候选池探索”。同一次生成必须读取候选方向的具体卖点、冲突、主角路径、推荐平台、平台判断理由、读者频道和目标读者，并把 `titles[0]` 作为模型已经完成取舍的唯一主书名；后续条目只提供不同具体卖点角度的备选。主书名至少应承载主角身份或处境、题材场景或具体事件、独有机制或优势、具体代价中的两类，不能把故事资产压缩成可套用于多数作品的抽象情绪句。自动导演不得强制平均覆盖文艺、冲突、悬疑和高概念风格，也不得按模型自报的点击分重新排列主书名；标题工坊仍可保留多风格、多句式的候选池规则。确定性后处理只负责结构、数量、去重和跨方案名称冲突，不能用关键词评分替代 AI 的主书名语义决策，也不应把常态质量责任转交给额外复审调用。

`stage_review` 是现有自动导演链上的显式逐步协作策略，不是另一套生成管线。它复用相同的 StepModule、PolicyEngine、Artifact Ledger 和 asset-first recovery，但每次只执行一个可恢复步骤，随后写入 `step_review_required` 检查点。检查点 seed 必须保留当前 `stepId`、`nodeKey`、目标范围和完成时间，继续操作才允许进入下一个未完成步骤。

逐步协作的三个动作边界如下：

- `validate` 只读取当前步骤的 readiness、completion、progress 和 recovery facts，不写规划资产。
- `improve` 复用当前步骤模块重新执行，并把用户校准要求加入本次步骤输入；`regenerate` 在此基础上先创建快照。
- `accept_manual_changes_and_continue` 复用原导演任务，不新建 takeover，不重新生成候选，也不把一次校准要求带入后续步骤。继续时由资产事实重新找到第一个未完成步骤。

人工保存的规划资产必须登记为 `user_edited`、`protectedUserContent=true`，更新内容 hash 和版本。上游规划变化只让依赖它的下游规划 artifact 变为 `stale`；`chapter_draft` 不因规划重算被清空或标记为可覆盖。`volume_beat_sheet` 和 `volume_chapter_list` 是独立 artifact 类型，用于区分节奏板、拆章列表和章节正文。

新书确认方向后采用 `auto_to_ready + fast_start` 进入开篇准备。小说项目一旦建立，用户即可提前选择简易创作并进入只读书架；该选择写入任务 `productionExperience` 和小说 `creationExperience`，但不得跳过角色、卷章和执行合同准备。开篇路线可用后，已选择简易创作的任务自动转为 `full_book_autopilot` 并开始正文；尚未选择的任务停在 `production_experience_required`。任务 Seed 必须持久化 `startupPreparation`，使服务重启后仍能恢复路线窗口、下一章细化游标与延迟增强策略。后续因重规划再次进入结构化大纲时，应沿用已确认的简易生产方式，不重复要求选择。

快速启动的目标是连续抵达首章正文。关键路径只允许等待精简故事基础、开篇世界切片、核心角色、3～5 章路线和下一章执行合同；普通系统规划重算应以安全范围策略自动通过。完整世界手册、非开篇角色增强、远期卷骨架和后续完整章节合同不得占用正文关键路径。若步骤会覆盖 `protectedUserContent`，或命中数据完整性、正文保护、模型服务和运行时安全风险，仍必须暂停。

- API route 不直接 `await` 自动导演长任务、章节生成、卷拆章、质量修复或 LLM 生产链路。
- 高优先级硬约束：自动导演不是第二套章节生成系统。控制面可以有导演专属 command、projection 和审批策略，但正文生成与正文修复的业务执行链必须与手动单章和批量执行共用同一套 runtime。
- 继续、恢复、重试、接管、审批、取消等用户动作先转为 command，不各自维护独立业务流程。
- `DirectorRunCommand` 表达控制面命令、租约和幂等，不表达业务完成事实。
- `DirectorRun` 是书级导演运行的根状态，`DirectorStepRun` 是步骤执行记录，`DirectorEvent` 和 `DirectorArtifact` 用于投影和恢复。
- StepModule 应声明输入、输出、产物、进度检查和恢复策略；Pipeline 只编排，不直接知道具体业务表和 Prompt 细节。
- StepModule 的只读事实检查必须能用 `novelId` 独立运行。`taskId`、run、command、artifacts 和 projection hints 属于自动导演扩展上下文，不能成为 `inspectReadiness`、`inspectCompletion`、`inspectProgress` 的必需条件；没有导演任务时应返回基于小说事实的最小状态。
- 手动章节生成和手动章节修复也应先进入 StepModule，再由步骤内部委托统一章节 runtime。路由可以保留 SSE 协议和用户入口差异，但不能再直接绕过 `chapter.draft.write` 或 `chapter.draft.repair` 形成第二套执行路径。
- 手动修复和自动修复必须共用 `ChapterContentFinalizationService` 完成最终接收判断、章节生命周期更新、可信事实写入和 `chapter:finalized` 事件。修复通过后正文以 `confirmed` 进入同步并把章节置为 `completed`；仍需处理时保留可用正文，以 `debt` 同步并维持 `needs_repair`。修复请求没有携带明确问题时，只能用同一上下文执行只读章节审核来发现问题；不得调用会修改生命周期、写质量记录或触发重规划的手动审校命令。旧审校也不能作为修复后的最终裁决出口。
- StepModule 核心运行时的依赖必须通过显式依赖包或默认装配函数进入，不允许在构造函数中用动态 `require()` 临时拉取服务。默认装配可以继续使用现有服务实例，但依赖关系必须在模块边界可读、可替换、可测试。
- 自动导演顺序调度应发生在编排器 / StepModule 层；章节批量执行器 `NovelDirectorAutoExecutionRuntime.runFromReady()` 当前仍是 `chapter.draft.write` 的执行实现之一，不能直接反调同一个步骤，否则会形成递归执行。后续若要把章节批量执行也拆成纯步骤调度，必须先把“启动/恢复 pipeline job”抽成低层端口，再让调度器只遍历步骤计划。
- Projection 面向 UI，只返回阶段、阻塞原因、下一步、可恢复范围等轻量状态，不返回完整大对象。
- 前端必须区分完整驾驶舱快照和轻量运行投影。完整快照包含 `displayState.steps`、近期事件、事实体检和里程碑，适合进度弹窗；轻量投影只表达当前运行摘要，适合导航栏和任务中心高频轮询。两者不能共用 React Query key，否则轮询会用轻量响应覆盖完整快照，导致弹窗步骤视图退化。
- 自动导演 UI 主状态必须由 `DirectorDashboardView` 统一裁决。`DirectorRuntimeProjection`、事实体检、章节进度和工作区摘要都是材料层；它们可以提供诊断、风险和最近事件，但不能在前端各自决定主 badge、主进度、主按钮或是否等待确认。
- `DirectorDashboardView` 必须携带 `sourceTrace` 和 `progressSource`，让调试者能看到主状态和主进度来自 task、worker、checkpoint、chapter facts 还是 runtime projection。当前端需要显示驾驶舱、进度弹窗、任务中心、任务抽屉或小说页接管提示时，应优先读取这个最终展示模型。书级自动化投影可以继续暴露旧字段做兼容，但这些字段应由 `DirectorDashboardView` 派生，而不是重新裁决主状态。
- 当任务事实已经是 `failed` 或 `cancelled`，前端必须优先展示终态和失败摘要；任何遗留的运行中 Dashboard 快照只能作为历史诊断，不能继续显示“实时推进”或覆盖恢复入口。失败摘要优先使用任务错误，其次使用检查点摘要，确保用户看到实际卡住的章节或合同问题。
- 工作流提醒、章节标题提醒、缺资源风险和 stale artifact 只能作为诊断或辅助操作展示；当 `DirectorDashboardView.mode` 是 `running` 或 `queued` 时，这些提醒不得把主容器、主 badge 或主按钮改成等待确认。
- 浏览器桌面提醒只消费“导演跟进”投影中的可处理分组：`needs_validation`、`exception`、`pending`。`auto_progress` 和 `replaced` 仍可显示在跟进中心，但不触发系统级通知。提醒开关属于当前浏览器本地偏好，并且必须受浏览器通知权限约束；前端不得为了弹窗重新推断 task status 或绕过跟进投影。
- 服务重启后不静默续跑长任务，应从真实产物断点判断可恢复范围，再由用户或策略确认继续。
- 自动导演驱动章节生产时，只能通过 `novelService.startPipelineJob(...)` 或 `resumePipelineJob(...)` 进入统一章节执行主链；导演侧不得直接调用 writer、patch repair、heavy repair 或旧手动修文 service。
- 自动导演遇到章节质量失败时，只能复用统一质量修复规则：patch first，失败后最多一次 `heavy_repair`，再失败则登记质量债务或 recoverable failure 并继续后续章节。导演 runtime 不得再发明独立的“导演专用修文分支”。
- 自动导演进入下一章前必须服从章节生产链的 `final_content -> timeline_finalization -> next_chapter` 规则。导演可以决定继续、跳过或重规划，但不能绕过 `ChapterTimelineFinalizationService`。
- 自动导演的“跳过质量修复并继续”不是绕过时间线。达到修复预算上限或用户选择 `skip_quality_repair` 时，执行面必须先基于当前最佳正文提交 degraded timeline checkpoint，再登记质量债务并推进剩余章节。
- 自动导演不得在 director 内部补写时间线提交逻辑。stable/degraded timeline、`ChapterTimeAnchor`、hook 承接、checkpoint metadata 都属于统一章节 runtime，不属于导演专属恢复逻辑。
- 自动导演驱动章节生产时，章节 pipeline 的 LLM 用量必须写入导演用量遥测，并带上 `chapterId`。每章累计 token 超过硬预算时，运行时应打开 `usage_anomaly` 熔断并暂停后续自动执行，防止任务重启、质量循环或上下文膨胀继续放大消耗。
- 用量熔断只保护尚未执行的工作。若章节批次已经成功且用户选定范围没有剩余章节，任务必须收束为 `workflow_completed`；超额用量保留在诊断记录中，但不得把已完成范围改写为 `pendingManualRecovery`。
- 自动导演投影必须把 `terminalAction=defer_and_continue` 且非重规划的质量结果视为“已记录质量债务”，不能升级成 `action_required`、`error` 或“出错需处理”。这类质量债务只影响后续优化提示，不阻塞继续执行。
- 重规划决策必须携带作用域。`local_window` 是默认作用域：自动导演生成并保存 `ReplanRun`，只刷新当前章之后没有正文的章节计划和执行合同，然后从第一个未完成章节继续；已有正文、人工保护内容和已确认章节只能作为上下文，绝不能被局部重规划覆盖。`global_book` 才是整书结构不可恢复的显式判断，可进入 `replan_required` 检查点等待处理。
- 章节质量闭环是生产链中唯一的重规划升级入口。章节审核返回 `local_patch_plan`、`continue_with_warning`、`patchable_obligation_gap` 或修复后仍有可记录义务缺口时，应登记为质量债务或局部修复建议并继续剩余章节，不能因为 `recommended=true` 就写入 `replanAlertDetails`。局部重规划调用失败而当前章已有可用正文时，也只记录失败原因和质量债务；无可用正文、运行时安全风险或数据完整性风险才允许停止。
- `replan_required` 即使出现在全书自动成书或 AI 主驾自动执行中，也仍是阻塞检查点。运行时应停止在实际触发章节，并把摘要写成“已执行至第 N 章，后续需重规划”，不能把目标范围直接显示为已完成。
- `replan_required` 的默认恢复动作是“重规划后继续”，不是跳过当前质量修复。恢复链必须先检查检查点锚点是否已有成功的 `ReplanRun`；没有时调用统一 `replanNovel`，成功后才允许消费旧质量提示并从第一个没有正文的章节继续。只有用户或结构化策略明确选择 `skip_quality_repair` 时，运行时才能跳过重规划。
- 简易书架、专业工作台、任务抽屉、AI 驾驶舱和小说列表必须消费同一个结构化恢复动作。任何界面看到 `replan_required` 时，默认主操作都应发送 `auto_execute_range` 并显示“重规划后继续”；“打开质量修复”可以作为查看入口，但不能在某种创作模式下把默认动作改回 `skip_quality_repair`。
- 重规划调用失败时不得静默降级为跳过修复，也不得提前清除 `replan_required`。任务应保留原检查点并展示真实错误，已有正文、章节事实和人工内容均保持不变，供用户再次重规划或转入专业模式处理。
- `auto_execute_range` 是用户对当前章节执行范围的显式继续授权。恢复链路即使先回到结构化大纲或执行合同同步，也必须把该授权传入后续 Pipeline 的 `approveAutoExecutionScope`，并在结构化同步后主动进入章节执行节点；不能只依赖自动审批偏好，否则命令会成功结束但章节执行节点仍停在审批门。
- 用户确认新书方向后，自动导演先投影为“准备开篇”。项目建立后可提前选择简易创作进入书架，但正文必须等待开篇路线和执行合同可用；未提前选择时，准备完成后投影为“等待选择生产方式”。选择专业创作则进入完整工作台且不自动生成正文。用户从简易自动创作切换到专业工作台时必须在章节边界生效：当前章允许安全落库，后续自动章节停止，已有正文和人工内容保持不变。
- 新书自动导演创建的恢复入口是独立页面 `/novels/auto-director?taskId=<workflowTaskId>`。`taskId` 是前端 URL 的主参数；旧的 `/novels/create?mode=director&workflowTaskId=<id>` 只作为兼容输入，进入后应规范化到新页面。运行记录的来源链接、恢复提示、候选确认链接和服务端 `sourceRoute` 都应指向新页面，保证刷新、桌面重启或崩溃恢复后回到同一个候选/进度现场；恢复动作只在该来源页面执行。
- `/novels/create` 只承担手动创建表单和旧链接跳转，不再挂载自动导演弹窗。自动导演候选批次、定向修订、标题重做、候选确认和执行进度都属于独立创建页主区，不能再通过候选弹窗套在创建弹窗里展示。
- 现有项目接管的默认范围是“全书前置规划接管”，不是章节范围。接管可以选择资产起点，但导演必须先补齐 Story Macro / Book Contract / 角色 / 卷战略 / 拆章，随后停在 `production_experience_required`；接管入口携带的旧章节范围或全书自动参数不得提前启动正文。
- 现有项目接管的用户入口应优先呈现“系统推荐接续位置 + 资产保护说明 + 一键继续”。阶段选择、重跑当前步、范围执行、自动审批等属于高级控制，默认折叠。只有会覆盖或重建已有资产的动作才需要显式确认；普通 `continue_existing` 不应让用户先理解内部阶段卡片才能启动。
- 接管入口的进度体检应把“系统看到的资产”直接展示给用户，至少包含卷规划、拆章同步、章节细化、正文书写和质量进度。若 URL 或上下文携带 `workspaceTaskId` / `directorTaskId`，前端应并行读取该任务快照，并优先用任务真实阶段、当前章节和任务状态解释主按钮；任务快照读取失败时再退回小说资产体检，不能让慢体检阻塞弹窗打开。
- 接管入口只能把 `directorTaskId`、当前 active auto-director task 或 live auto-director projection 作为“当前导演任务”上下文。`workspaceTaskId` 属于普通编辑工作流 lane，不能传入接管弹窗参与“进入当前任务”判断；否则被本地收起但仍处于 `waiting_approval` 的手动流程会误导接管入口，以为存在可继续的自动导演任务。
- 书级自动化投影如果返回 `failed`、`blocked` 或 `waiting_recovery` 且包含 `latestTask.id`，前端必须把它视为当前需要处理的导演状态。即使 URL 没有 `directorTaskId`、active auto-director task 查询返回空，AI 驾驶舱、任务抽屉入口和恢复入口也要显示该投影，并在用户打开详情时把 `latestTask.id` 写入 `directorTaskId`。`completed` / `cancelled` 终态可以继续只在 URL 钉住时展示，避免旧任务反复打扰。
- 当接管入口能从任务快照或小说资产推断出下一章和章节总数时，默认入口可以提供“推进至第 N 章”的轻量选择。该选择必须生成显式 `chapter_range` 的 `autoExecutionPlan`，范围从当前待执行章开始，到用户选择的目标章结束；高级设置打开时仍以高级范围配置为准。
- 现有项目接管进入执行面时，用户提交的 `runMode`、`chapter_range` 与自动审批配置必须作为同一份执行契约写入任务 Seed，并驱动后续拆章细化与章节执行。运行时不得把范围接管降级为 `auto_to_ready`，也不得回退读取上一条已完成任务的范围；若最终持久化范围和用户请求不一致，应明确失败并保留可诊断证据，而不能显示为流程完成。
- `workflow_completed` 是任务主状态的终态事实。章节正文、连续性、角色资源和读者承诺的索引事件可以在安全落库后异步补记，但只能作为历史事件，不能覆盖完成任务的主进度、当前动作或检查点展示。
- 接管任务的 `downstreamReset` 元数据只表达“从接管点开始，后续旧资产需要重新校验”，不能覆盖任务已经推进到更后阶段的事实进度。UI 合成步骤状态时，应以当前运行阶段为边界，只把当前阶段及其后的 reset steps 显示为待推进；早于当前阶段的步骤应按任务进度或真实资产显示已完成。
- `chapter_batch_ready` 的质量提醒属于当前批次的继续门。用户点击“继续自动执行章节”后，`approveAutoExecutionScope` 应允许 AI 主驾跳过当前质量提醒并启动剩余章节。
- 章节范围自动执行的 StepModule 事实门控必须按本次授权范围裁剪章节进度。`chapter.draft.write`、`chapter.state.commit` 等范围内步骤只能校验当前 `autoExecution` / `autoExecutionPlan` 的章节区间，不能让范围外已有正文但缺状态提交的旧章节阻塞当前批次完成。
- 章节质量审校、章节修复和章节状态提交必须使用同一份章节范围事实。局部质量问题已经被质量闭环标记为 `terminalAction=defer_and_continue` 时，它是章节级质量债，不应再因为 `blockingObligations` 或缺少独立 `StoryStateSnapshot` 把全局自动导演卡在 `chapter.state.commit`；只有 `replan_required` / `recommendedAction=replan` 这类明确重规划信号才能阻断后续章节范围。
- `replan_required` 的继续语义必须由服务端按任务 checkpoint 统一规范化。无论入口发送普通 `resume`、批准关卡或从检查点恢复，运行时都按“保留可用正文、登记质量债、继续剩余章节”处理，不能因前端命令类型不同重读同一个重规划结果并再次暂停。
- `skip_quality_repair` 表示“先跳过本次质量 / 重规划建议并继续”。执行面必须把实际触发质量问题且已经生成正文的章节登记到 `qualityDebtSummaries`，再继续剩余章节范围；不能把风险当成已修复，也不能丢弃后续质量回收所需的章节、原因和时间信息。
- 质量债来源必须来自明确的 pipeline job 章节范围或已持久化章节事实，不能从 `nextChapterId` / `nextChapterOrder` 推断。`nextChapter*` 只表示下一章待执行游标，不表示当前质量问题来源；空正文、仅有执行合同或仅有任务单的章节不得进入 `skippedChapterIds`、`skippedChapterOrders`、`qualityDebtChapterIds` 或 `qualityDebtChapterOrders`。
- 自动导演 projection 必须优先相信任务 checkpoint。任务已经处于 `waiting_approval` 且存在 checkpoint 时，应屏蔽陈旧的 `DirectorStepRun.running`，否则 UI 会把等待处理的质量门显示成仍在执行。
- 自动导演展示态也必须反向保护真实运行态。任务已经处于 `running` 且存在当前推进标签、当前 item 或实时进度时，应屏蔽陈旧的 `waiting_approval` / `requiresUserAction` 投影；否则驾驶舱会把正在细化、写作或审校的任务误显示成“等待确认”，并露出无效确认按钮。
- 自动导演执行详情、AI 驾驶舱和进度弹窗必须共享同一条细粒度运行标签优先级：章节 pipeline 的 `currentItemLabel` / runtime projection `currentLabel` 高于 StepModule 的节点级 `DirectorStepRun.label`。`DirectorStepRun.label` 只能作为缺少任务标签时的兜底，不能把“正在自动审校第 N 章”覆盖成“执行章节生成批次”。
- 自动导演投影应携带章节质量根因：`rootCauseCode`、`blockingObligations`、`qualityDebtSummary` 和 `qualityBudgetSummary`。执行详情优先用这些字段解释“缺了什么、系统已处理到哪一步、下一步会怎么继续”，而不是把所有章节执行问题显示成通用失败。
- 角色准备阶段的 `character_setup_required` 是可恢复检查点，不是失败。若角色阵容候选已经生成但质量闸要求用户确认，StepModule 应把它识别为 acceptable pause：任务状态停在 `waiting_approval`，候选保留给用户审核或应用，不能再用“正式角色数为 0”把 `character.cast.prepare` 升级成失败。只有在没有正式角色、没有可用候选、也没有可恢复检查点时，才应视为角色准备失败。
- 角色阵容“应用”分为核心落库和增强补齐两层。核心落库同步完成主角、主要对手、开篇登场角色及必要关系，足以支持开篇规划与正文。外显资料、心智快照和完整动态投影属于延迟增强；快速启动不得等待它们。首章正文稳定落库后，系统才可为同一本书串行启动一个低优先级增强任务；失败只记录资料待补齐，不得把自动导演标记为失败。
- 角色阵容质量闸不得用正则、关键词表、固定文本片段或字符比例判断身份承接、隐藏真相、题材理解、语言质量或角色职责。这些创作语义必须交给 AI-first 结构化理解、PromptAsset、semantic retry 或 AI 评估链路。确定性闸门只能检查结构契约，例如是否存在 protagonist、gender、必填字段和可恢复检查点。

## 示例

推荐做法：

- `continue` 请求只创建或复用 active command，立即返回 command id、task id 和轻量状态。
- Worker lease 后调用统一 Pipeline，由 StepModule 组装输入、执行、验证输出并提交产物。
- 前端任务中心读取 runtime projection，而不是高频拉取完整 volumes、seed payload 或候选批次。

禁止做法：

- 在 route 里直接调用 `runDirectorPipeline`、`generateVolumes`、`chapterExecution` 或质量修复。
- 用 `setImmediate`、`void Promise` 或 fire-and-forget 在 Web API 进程中伪装后台任务。
- 让旧 task status 直接决定 runtime completion。
- 在 `director/` 内部新增直接写正文、直接 patch repair 或直接 full rewrite 的实现，把自动导演演变成旁路写作系统。
- 在核心运行时构造函数中继续堆叠动态 `require()`，导致依赖边界只能靠运行时碰撞发现。

## 失败模式

- 点击继续后普通查询接口一起挂起：优先检查是否有重型执行仍在 API 进程内运行。
- 点击“继续自动执行章节”后 toast 成功但没有新的 LLM 请求：优先检查 command 是否已成功执行但 `chapter_execution_node` 仍是 `waiting_approval`，以及 `auto_execute_range` 是否在恢复分支或质量提醒分支丢失了 `approveAutoExecutionScope`。
- 点击 `replan_required` 状态的“继续自动导演”后没有新 LLM 请求：检查服务端是否仍把任务 checkpoint 透传为普通 `resume`。继续运行时必须按 checkpoint 自动规范化为质量债继续路径，前端按钮类型不能改变该语义。
- 点击 `skip_quality_repair` 后直接越过空章节：检查质量债是否错误绑定到 `nextChapterOrder`。正确状态应把质量债绑定到刚完成并触发质量提醒的章节，状态重算后最早空正文章节仍应留在 `remainingChapterOrders` 首位。
- 跳过质量修复后下一章脱节：检查跳过前是否写入 `timeline_finalization/degraded` checkpoint，以及当前章节是否已有 `ChapterTimeAnchor`。如果没有，说明执行面把跳过误当成直接进入下一章。
- 单章 token 异常飙升：检查 `DirectorLlmUsageRecord.metadataJson.chapterId` 是否完整、`usage_anomaly` 熔断是否记录了触发章节，以及是否存在重复门禁、重复章节合同或 timeline 上下文膨胀。
- 章节范围任务停在 `chapter.state.commit facts are not complete yet`：先比较任务范围内和整本书的 `draftedChapterCount / committedChapterCount`。如果范围内已齐但整本书仍有旧章节缺 `StoryStateSnapshot` 或 `CanonicalStateVersion`，说明事实门控没有按 `autoExecution` / `autoExecutionPlan` 裁剪章节进度，应修 StepModule 的 scoped progress，而不是补写无关章节来绕过。如果范围内只差已经 `defer_and_continue` 的质量债章节，应检查质量债分类是否仍被 `blockingObligations` 抢先判成 blocking，以及 `chapter_state_committed` 进度是否接受降级继续状态。
- 执行详情仍只显示 `chapter.draft.write 未满足其完成标准`：检查章节 runtime package 是否已经写入 `failureClassification`，以及 `quality_loop_assessed` 事件是否把 `rootCauseCode` 和 `blockingObligations` 投影到前端。
- 当章节批次已写入 `pendingManualRecovery` 时，章节步骤的“未全部完成”属于合法暂停，不是步骤失败。步骤适配器必须保留最新批次错误和恢复位置，不能再抛出通用完成标准错误覆盖书级任务；恢复只能由显式用户命令清除该状态。
- 执行详情显示 `character.cast.prepare 未满足其完成标准`：先检查任务是否已有 `character_setup_required` 检查点和 `CharacterCastOption` 候选。如果候选存在，应修复 acceptable pause 或任务投影，而不是要求重新生成整条主链；如果候选不存在，再检查角色生成 Prompt、结构化输出和持久化路径。
- UI 显示失败但任务已重新排队：检查 projection 是否仍把旧 task status 当事实源。
- 小说实际存在失败导演任务但 AI 驾驶舱显示空闲：先检查当前 URL 是否只有 `workspaceTaskId` 而没有 `directorTaskId`，再查 `book-automation` 投影是否已经返回 `projection.status=failed` 和 `latestTask.id`。如果投影有失败任务但侧栏仍隐藏，说明前端把未钉住的失败投影当成历史终态过滤了；正确行为是显示失败投影，并让“查看失败原因”跳转到带 `directorTaskId` 的任务详情。
- 候选确认或恢复入口回到 `/novels/create`：检查 `resumeTargetToRoute`、书级自动化投影、任务 UI helper 和移动端入口是否仍在生成旧的 `workflowTaskId + mode=director` 链接。正确链接应使用 `/novels/auto-director?taskId=...`，旧链接只应由前端兼容跳转处理。
- 服务重启后假 running：检查租约过期、active step、command 状态和产物断点是否统一投影。
- 重复点击继续产生多条执行链：检查 command 幂等键和 active command 复用。
- 新书未选择简易创作却在开篇路线准备完成后直接开始第 1 章：检查确认接口、结构化大纲阶段或恢复逻辑是否把默认的 `professional` 误当成显式选择。只有用户提前选择简易创作时才可自动进入 `chapter_batch_ready`；否则必须停在 `production_experience_required`。
- `auto_to_ready` 停在“等待确认分卷策略”且没有 checkpoint：检查运行策略是否把普通 `downstream_recompute` 当成人工审批。前期规划门应自动使用安全范围授权，用户保护内容仍由 policy gate 拦截。
- 章节执行出现 `Chapter execution did not produce observable draft content`，实际原因却是“高内存卷规划正在处理同一范围”：优先检查章节执行触发的 JIT 路线预取是否携带同一个 `workflowTaskId`。自动导演在结构化规划阶段已经持有自己的高内存租约；同一任务的 JIT 卷规划必须沿用该所有者，否则会被错误识别为并发任务并返回 409。任务状态已失败但活动步骤仍显示运行中时，应以任务 `status` 和最后检查点为事实源，活动步骤属于待修复的旧投影。

高内存冲突属于可恢复资源等待，不得要求用户重新创建小说或重新生成已完成规划。失败卡必须说明已保存的范围，并提供“从检查点重新尝试”和“查看运行详情”；恢复操作沿用原任务、原模型和原策略快照。若冲突来自另一条真实仍在运行的任务，恢复前应等待其完成或取消；同任务 JIT 预取不应触发该提示。

不能用前端禁用按钮或降低轮询频率掩盖执行面阻塞。

## 相关模块

- `server/src/services/novel/director/DirectorCommandService.ts`
- `server/src/services/novel/director/DirectorCommandExecutor.ts`
- `server/src/services/novel/director/DirectorCommandInterpreter.ts`
- `server/src/services/novel/director/directorSubsystem.ts`
- `server/src/services/novel/director/runtime/`
- `server/src/services/novel/director/workflowStepRuntime/`
- `server/src/workers/`
- `client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx`
- `client/src/pages/tasks/TaskCenterPage.tsx`
- `client/src/components/autoDirector/AutoDirectorPauseNotificationWatcher.tsx`
- `client/src/pages/settings/AutoDirectorBrowserNotificationSettingsCard.tsx`

## 来源文档

- [自动导演执行面隔离与 API 保活计划](../../plans/auto-director-execution-plane-isolation-plan.md)
- [导演模式模块化与状态治理改造清单](../../plans/director-mode-module-state-refactor-checklist.md)
- [Novel Director 子系统](../../../server/src/services/novel/director/README.md)
- [README 当前能力说明](../../../README.md)

## 紧凑全书完成合同

自动导演按任务的目标章节数构建 `completionProfile`。目标不超过 60 章时使用 `compact_book`：原始的 `first30ChapterPromise` 仍原样保存，但在规划和正文上下文中解释为“全书核心承诺”；最大章节数为目标数加 5，追加章节只能用于收束既有主线。超过 60 章保持 `serial_book` 和“前 30 章承诺”语义。

紧凑作品的规划采用建立承诺、升级转向、解决兑现三段式结构，目标章节到达后必须通过结局合同检查才可以标记全书完成。结局合同关注主冲突、主角目标、关系变化、核心回报和主题落点；普通质量债不改变全书完成状态，缺少关键结局证据时才进入收尾或重规划恢复。

旧任务没有 `completionProfile` 时按连载模式兼容读取，不修改已有正文或原始承诺字段。

## 正文优先与自动恢复

自动导演的默认优先级是完成正文。章节已经产生可保存正文时，局部审校风险、自然度提示、回报尚未到兑现窗口和普通质量债都必须降级为章节级记录，不能单独把全局任务切到 `replan_required`。只有结构化状态明确要求重规划、正文不可用，或运行时/数据安全失败，才允许暂停批量执行。

章节运行时异常由当前章节负责自动处理；每章最多使用一次由问题策略快照提供的自动重试机会，且运行异常重试与质量修复共享这次机会。处理不能重写已稳定保存的前文，也不能创建第二条生产链。预算耗尽且仍没有可用正文时，才创建可恢复检查点，并保留章节、阶段和最近游标，避免把内部堆栈直接当成用户操作要求。

任务治理读取必须区分新版快照和历史兼容。带有有效 `issueGovernanceVersion + issuePolicy` 的任务始终使用启动时快照，运行途中修改全局或本书规则不得改变它；旧任务缺少快照时只在恢复读取边界临时解析当前本书规则，本书不存在时使用全局规则，不回写任务 Seed、不批量迁移历史数据。兼容上下文必须标记真实的 `global` 或 `novel` 来源，不能伪装成任务快照。

Worker 租约过期与章节运行共用问题治理的自动重试预算。第一次失去响应可以按 `runtime.worker_stale` 执行一次自动恢复，预算耗尽后停在人工恢复边界；不得再通过环境变量或运行模式维护独立的 2 次、5 次重试阈值。无法关联小说的孤立任务没有安全治理上下文，应直接暂停等待处理。

章节执行合同的复用必须先通过确定性结构门禁，不能只凭 `taskSheet` 和 `sceneCards` 存在就认定合同可用。只要章节目标、独占事件、结束状态、下一章入口、冲突与揭露强度、目标字数或禁止事项任一缺失，就必须保留旧规划作为生成上下文并重新进入执行合同生成与质量反馈循环。最终同步门禁与复用门禁必须使用同一套结构判断，避免旧任务在恢复时反复复用同一份残缺合同。

回报账本的 `overdue` 只有在当前章节已经越过明确的 `targetEndChapterOrder` 后才生效。仍处于承诺窗口内的项目属于待推进或紧急提示，不得让生成决策提前返回 `replan`。账本内部标识（例如 `payoff/payoff_missing_progress`）只能用于诊断和质量记录，不能写入章节的“必须推进”合同。

## 风险评分与问题动作

## 开书前问题治理

自动导演开书页的启动前准备阶段必须展示本书问题处理规则。规则初始读取全局默认值，用户不调整即可继续；用户调整后，规则作为本书配置传入开书请求，并在小说创建后保存为本书覆盖。

任务创建时必须把有效规则写入任务 Seed 快照。运行中的任务只读取这份快照，后续修改全局规则或本书规则不得改变当前任务。开书页的配置入口与小说生产页使用同一套问题目录、动作和安全锁定规则，不得维护第二套策略实现。

开书前配置的验证至少包括：默认值可直接启动、修改后的规则可进入任务快照、小说创建后可读取本书覆盖，以及安全锁定问题仍然优先于用户偏好。

### Background

自动导演需要把问题的紧急程度以新手能理解的方式表达出来，但不能让评分成为问题管理之外的第二条停止通道。风险分数只用于沟通、排序和通知；重试、继续、暂停或结束完全由稳定问题码对应的任务策略快照及安全强制规则决定。

### Current Rule

- 新任务把 1–8 分说明记录在 `DirectorIssueOccurrence.riskScore`；历史任务的 `DirectorRiskAssessment` 只作兼容读取和展示。8 分是最高风险分；评分不拥有暂停权限，也不覆盖问题动作。
- 全局和本书只保存问题码动作与自动重试次数。不存在独立风险阈值、书级阈值覆盖或任务 `riskPolicy` 快照。
- 自动导演每章最多发起一次自动修复。轻修失败后保留原正文并进入质量债或统一问题治理；质量预算不得把后续恢复静默升级为整章重写，`heavy_repair` 只能来自明确选择的修复任务。
- 需要关注的问题写入自动导演账本、运行时投影与通知渠道。外部通知按 `任务 + 问题指纹 + 动作` 去重，避免同一问题在重试时反复打扰用户。
- 全局和本书规则界面允许每个稳定问题码选择四种动作，并在用户产生未保存修改后显示风险提示。策略可保存用户偏好，但 `generation.output_unusable`、`quality.replan_required`、`runtime.token_budget_exceeded`、`runtime.protected_content`、`runtime.data_integrity` 与 `runtime.persistence_failed` 必须由目录中的 `enforcedAction` 执行安全兜底；此时实际决策的 `policySource` 为 `safety`，不能把偏好伪装成已自动放行。
- `replan_required`、`stop_for_replan`、无可用正文、运行时安全、数据完整性和受保护正文冲突通过问题目录中的安全动作进入可恢复暂停；其风险分可固定记为 8 分用于说明，但暂停不依赖评分模型或任何阈值。
- `local_patch_plan`、`continue_with_warning`、`defer_and_continue`、局部修复残留和普通质量债无论分数多高，都只能记录质量债或局部修复提醒；它们的 `canPause` 必须为 false，不能把全书任务路由到 `replan_required`。
- 章节流水线完成问题分类和动作治理后，自动导演检查点只消费该结构化结果，不得再调用风险评分模型重新决定继续或暂停。`qualityRepairRisk` 仅负责把影响范围和提示投影给用户；历史 `latestRiskAssessment` 可以保留展示，但不能在检查点重算。
- `DirectorPolicyEngine` 只负责执行前置边界：写操作是否允许、是否需要审批、是否影响用户保护内容，以及大范围或高成本动作是否越权。它不保存质量失败动作、自动修复次数或章节重试预算；这些运行期问题只能由问题策略快照和章节流水线处理。旧任务中残留的同名策略字段仅作兼容数据读取，不能重新接回执行分支。

### Related Modules

- `shared/types/directorRisk.ts`
- `server/src/prompting/prompts/director/directorIssueAssessment.prompts.ts`
- `server/src/services/novel/director/projections/novelDirectorRuntimeProjection.ts`
- `server/src/services/novel/director/automation/novelDirectorAutoExecutionCheckpointRuntime.ts`
- `shared/types/directorIssue.ts`
- `server/src/services/novel/director/issues/DirectorIssueService.ts`
- `client/src/components/autoDirector/DirectorRuntimeProjectionCard.tsx`

## 创作界面与生产合同

`creationExperience` 只表示工作区的显示偏好：`simple` 打开 `/novels/:id/simple` 阅读书架，`professional` 打开 `/novels/:id/edit` 完整工作台。它不能成为小说、章节、角色、规划、导出、删除或其他写操作的权限边界。

自动导演在前期准备完成后允许用户选择界面，两种选择都写入相同的 `full_book_autopilot`、全书执行计划和自动审批配置。`productionExperience` 仅保存当次选择以便返回对应界面；不得把专业界面降级为 `auto_to_ready`，也不得在简易界面切换到专业界面时等当前章节结束后停止自动生产。

界面可随时切换，切换只更新显示偏好并跳转路由，不创建第二条任务、不改写任务进度、不取消运行中的章节任务。旧任务中的历史模式字段按原数据兼容读取，但新的运行逻辑不得再根据界面偏好提前启动、暂停或改变全书生产范围。

## 简易创作的自动续写

简易创作书架是自动成书的恢复入口，而不是专业工作台的替代诊断页。书架投影已经返回最近自动导演任务的 `directorTaskId`，因此“按 AI 建议继续”必须直接向该任务提交继续命令；不得改用只查询 `queued/running` 任务的接口。重规划检查点会把任务置为失败态，重新查询活跃任务会错误地产生“没有找到可恢复的 AI 任务”。

当用户从简易创作书架明确选择继续时，已有可读正文的章节即使带有 `replan_required` 质量标记，也应先保留正文、登记章节级质量债并继续后续章节。该授权不适用于无可用正文、运行时安全、数据完整性或受保护人工内容冲突；这些情况仍需停在可恢复检查点。后续章节通过滚动规划与事实账本重新装配，不应要求新手理解或手动修改内部重规划信息。

简易创作书架投影任务的问题事件记录。每条记录展示风险分数、证据、影响章节、实际动作和下一步建议；这些信息必须来自自动导演的同一份事件账本与任务 Seed，不能在书架重新计算。书架的问题管理入口只调整本书的问题动作和自动重试次数，与专业模式使用同一套规则。
