# 自动导演简化阶段三独立验收（2026-09-29）

## 1. 验收结论

**未通过，需要返工。** 完整 fast、integration 与直接分支基点比较均无新增失败；Guard、类型检查和编译通过。但完整调用链复核发现候选确认、章节执行状态同步、步骤校准及接管后跟进存在行为回退，I5、I6 还有入口保护缺口。不能以守卫计数为零或现有测试通过替代业务验收。

本结论补充并修正方案台账中此前的 3B、3C“通过”记录：保留历史记录供追溯，以本次独立验收作为阶段三当前状态。完成下述返工和复验前，不满足阶段四的前置条件。

### 验收范围

- 分支：`refactor/director-simplification`。
- 被验收 HEAD：`6f72603e961dccbe19504ee64fd604960e9b91dd`；3C 实现提交 `6d06276c78940d50cf82c13ae03d11b0f4f60ac7`。
- 直接基点：`d3a9ca992133895f9ff97dd28a3dc73388ff37be`，独立工作区 `D:/code/ai-baseline-d3a9ca99`。
- 依据：执行方案第 3 节不变量、第 4 节验收及停止规则、第 6 节阶段三范围；既有 3A、3B、3C 报告和 wiki 边界说明。
- 方法：CodeGraph 调用链定位、源代码和历史差异审阅、两位独立审阅者复核、当前编译产物的内存复现、完整套件直接基点对比。
- 本次只记录验收，不修改业务代码、断言或守卫基线。阶段四动作表草稿及工作区其他修改不属于本次提交。

## 2. 已形成的改造成果

| 子阶段 | 成果 | 验收结果与限制 |
| --- | --- | --- |
| 3A 读取与修复分离 | 核心详情、列表、书级状态、运行记录及跟进读取不再顺带修复任务；Worker 领取前初扫，之后每 60 秒对账 | 核心读取路径和人工恢复锁扫描保护成立；不是所有历史 GET 的绝对纯读证明，见第 7 节 |
| 3B 状态写入门面 | 引入 `DirectorTaskStateWriter`，多数阶段、运行时和命令状态写入经过语义门面；提取任务创建字段组装，减少两份工厂逻辑 | 守卫覆盖的直接写入收敛成功；候选检查点、重试等间接路径尚未完全收敛 |
| 3B 显式恢复事务 | 显式人工恢复命令、锁清除和任务接受在事务中提交；锁存在时不复用已领取或正在执行的旧命令，命令结束竞态有回归覆盖 | 主要恢复路径成立；一般命令的接受竞态和 3C 新增写入口仍有缺口 |
| 3C 启动与运行分离 | Reader 返回 `{ launch, run }`；通常运行态更新保留启动配置；恢复位置以任务列为准，旧 seed 仅兼容读取 | 结构方向成立；启动边界及部分消费方不一致造成真实回退 |
| 3C 序列化边界 | 旧数据继续兼容读取，废弃 `directorRuntime` 不再通过新序列化路径写回；HTTP bootstrap 参数有明确适配层 | 不改数据库 schema；跨模块消费者兼容性仍需补齐 |
| 文档与维护 | 增补模块边界及 wiki 的启动合同、运行态、人工恢复规则 | 规则应保留；实现缺陷写入验收清单，不把 wiki 改成临时问题台账 |

### 守卫指标

以下是阶段三起点至当前的实际计数；第 6 节说明其中一处别名替换不满足 R3，故不能把最后一行的零计数当作完全收敛证明。

| 指标 | 阶段三起点 | 当前 | 说明 |
| --- | ---: | ---: | --- |
| `healOnReadCallSites` | 9 | 0 | 核心读路径移除修复；修复入口归 Worker |
| `directorTaskWritesOutsideState` | 63 | 0 | 直接写入匹配项归 Writer；间接应用服务写入仍需人工核验 |
| `directorSeedPayloadRefs` | 291 | 0 | 3B 先降至 285，3C 再归 Reader/Writer；一处参数别名仍需返工 |

阶段一、二的 `adHocCurrentTaskLookups`、`clientUrlTaskIdParams` 保持 0。后续阶段指标未完成，也未因本次验收下调：`continuationModeFlags=31`、`runModeBranches=45`、`inProcessBackgroundScheduling=13`、`stepRuntimeServiceLocator=54`、`clientStatusDerivation=205`、`legacyRuntimeTableReads=1`。

### 不变量判定

| 要求 | 判定 | 依据 |
| --- | --- | --- |
| I4 核心读取不写数据 | 核心范围通过，有既有边界例外 | 已移除读取修复调用；Worker 和读取纯度回归通过；不把既有分析 GET 写快照误报为新增回退 |
| I5 只有明确用户恢复能清锁 | 未通过 | 两个新增运行态写入口允许直接传入 `pendingManualRecovery=false`，绕过既有清锁检查 |
| I6 启动合同冻结、运行只更新 run | 未通过 | 候选确认和自动执行同步误走初始化；缺失字段填充、接管整体替换及旧模型覆盖路径不完全符合边界 |
| U5 保持既有行为 | 未通过 | 确认创建后失败、校准指令丢失、接管替换标记读写不匹配等 |
| R3、S2 | 需返工 | 等价参数改名导致计数下降；原有测试覆盖和小说身份断言需恢复 |

## 3. 必须修复的行为回退

### 3-1 / P1：候选确认创建小说后，第二次初始化因合同冲突失败

**位置：** `server/src/services/novel/director/runtime/novelDirectorConfirmRuntime.ts:87`、`:176`、`:289`、`:330`；`state/DirectorTaskStateWriter.ts:110`。

确认入口先用 `resolvedInput` 初始化并冻结合同。随后解析书籍 framing、类型、主副故事模式及生产基础，形成更完整的 `executionDirectorInput`；创建小说并关联任务后，再调用 `initializeTask` 写这个不同的输入。此时 `novelId` 已非空，候选定稿例外失效，Writer 抛出合同不可变错误，异常分支将任务标为失败，也没有启动后续流水线。

使用真实 `NovelDirectorConfirmRuntime`、Writer 和实际构建函数、内存资源/持久化替身复现，顺序为：

```text
bootstrap → create novel → attach novel → mark failed
Director launch contract is immutable after task creation (directorInput).
```

这是 3C 引入的阻断。旧初始化没有这项拒绝，不能归为基点历史失败。现有 `novelDirectorConfirmLaunchContract.test.js` 在创建领取边界提前结束，没有覆盖创建后第二次初始化。

**返工：** 在合法启动边界定稿完整输入，关联小说后只更新运行态；不得通过放宽 I6 或让已关联小说的任务任意替换合同来绕过。补齐“候选确认 → 资源解析 → 创建/关联 → 最终合同 → 流水线启动”的完整回归，并断言没有留下已创建但立即失败的开书任务。

### 3-2 / P1：章节执行进度同步误用初始化，运行模式转换时失败

**位置：** `server/src/services/novel/director/automation/novelDirectorAutoExecutionCheckpointRuntime.ts:76`。

`syncAutoExecutionTaskState` 是普通运行进度同步，却仍用 `initializeTask` 和整份请求重新建立合同。当前有效运行视图会把简易生产选择映射为全书执行，或把显式继续映射为章节执行；启动合同仍保留原始模式。真实 builder 带上这些有效请求字段后，初始化触发合同冲突，正常继续或状态同步失败。

内存复现：冻结的启动输入为 `auto_to_ready`，有效运行请求为 `full_book_autopilot`，调用实际同步函数得到：

```text
Director launch contract is immutable after task creation (directorInput).
```

**返工：** 改为运行态写入，只更新执行状态、恢复目标和必要的任务显示列，原样保留 launch。回归必须使用真实 builder，覆盖简易生产和显式执行继续两类有效模式；不能只用“返回 extra”的简化 builder 替身。

### 3-3 / P2：步骤模块忽略已保存的校准指令和有效运行模式

**位置：** `server/src/services/novel/director/workflowStepRuntime/directorWorkflowStepShared.ts:108`；`NovelDirectorService.ts:546`；`workflowStepRuntime/DirectorStepCalibrationService.ts:53`。

校准指令存入 `run.stepCalibration`，有效任务视图会把指令和当前生产选择合入执行请求。但 `loadDirectorModuleState` 直接返回 `state.launch.directorInput`，步骤实际生成无法读到这些运行态覆盖。启动合同只读是正确的，拿它直接替代有效执行请求则改变了业务结果。

实际 Reader/视图/模块加载复现：

```json
{
  "effectiveInstruction": "strengthen motivation",
  "loadedInstruction": null,
  "effectiveMode": "full_book_autopilot",
  "loadedMode": "auto_to_ready"
}
```

**返工：** 统一生成供步骤执行的有效请求，叠加已结构化的运行态覆盖而不回写 launch。断言用户校准指令真正进入生成依赖、简易生产模式真正进入步骤消费方，不能只断言运行态字段已落盘。

### 3-4 / P2：部分更新会误清恢复位置

**位置：** `server/src/services/novel/director/state/DirectorStateReader.ts:151`；`state/DirectorTaskStateWriter.ts:302`。

`splitDirectorTaskState` 对没有恢复目标的输入也产生 `run.resumeTarget=null`。`updateDirectorRunStateFromTaskData` 检查拆分后的对象是否含此属性，判断恒为真；部分输入只有 `directorSession` 时，也把既有 `resumeTargetJson` 清空。这违反“未提供则保留”的运行态更新语义。

内存复现：调用前恢复列包含小说和 pipeline 入口，传入不含恢复目标的部分任务视图后，实际写入值为 `null`。这是新 API 的可复现边界缺陷；本次没有把它扩写为“所有现有调用都会丢失位置”。

**返工：** 根据原始输入是否明确提供目标判断；省略保留、显式 null 清空、提供对象替换。三种情况都需回归，并保持任务列优先的读取规则。

### 3-5 / P2：接管写入嵌套替换标记，跟进模块仍读旧位置

**位置：** `server/src/services/novel/director/runtime/novelDirectorTakeoverContinue.ts:250`；`server/src/services/task/autoDirectorFollowUps/autoDirectorFollowUpProjection.ts:198`；`AutoDirectorFollowUpNotificationService.ts:58`。

被替换任务取消时，新 Writer 把标记写到 `takeover.replacementTaskId`。跟进投影和通知解析仍取顶层 `replacementTaskId`，不能识别已被新任务替代的记录。实际兼容解析复现：旧顶层数据读出任务编号，新嵌套数据读出 null。新测试只验证了存储位置，没有验证旧消费者。

**返工：** Reader/兼容边界统一输出替换关系，跟进投影与通知都消费该能力；补旧数据、新数据、取消旧任务并指向新任务的整链回归。不应把兼容原始 JSON 解析继续散落在消费者中。

## 4. 必须补齐的写入与合同边界

### 3-6 / P2：新增运行态写入口可无用户命令清除人工恢复锁

**位置：** `server/src/services/novel/director/state/DirectorTaskStateWriter.ts:251`、`:278`，对照同文件 `:210`。

`updateRunState` 拒绝直接写 false 或 Prisma `{ set: false }`。但 `updateDirectorRunState` 的 `taskData`、`updateDirectorRunStateMany` 的 `args.data` 直接交给 workflow 写入，未复用这项检查。

真实 Writer 的内存调用确认：`pendingManualRecovery=false` 被写入，且没有 `userCommandId`。没有找到当前生产调用方主动传 false，因此这是 **I5 的入口保护漏洞**，不是已经观测到用户暂停被后台自动解除。

**返工：** 所有写入口共用锁校验；只有带持久用户命令编号的专用清锁方法允许解除。逐个入口覆盖 false 和 `{ set: false }`，并保留事务恢复、租约结束及 Worker 扫描的原有测试。

### 3-7 / P2：一般命令接受失败仍返回 accepted

**位置：** `server/src/services/novel/director/commands/DirectorCommandService.ts:830`、`:888`、`:924`、`:949`。

显式恢复和要求活动任务的特定路径使用事务，但一般修复标题等命令仍先独立创建，再接受任务。若两步之间任务进入人工暂停，接受更新的 `pendingManualRecovery=false` 条件不匹配，返回 `count=0`；调用方忽略结果，仍通知 Worker 并向用户返回 accepted，留下不能按预期执行的排队命令。

可达链：标题修复 HTTP → `enqueueChapterTitleRepairCommand` → 通用 `enqueueExecutionCommand`。注入两步间暂停竞态，结果是锁保留、命令一条、接受更新计数 0，却仍 accepted。与 3B 前版本对照：旧版错误清锁，新版保住锁但仍谎报接受；两种结果不能视为同一历史问题。

**返工：** 保证命令创建和任务接受的一致性，检查更新计数并回滚或明确拒绝未接受的命令，不能自动清锁。补真实 Writer 和暂停竞态回归。

### 3-8 / P2：候选检查点、重试和模型覆盖仍绕过写入门面

**位置与链路：**

- `phases/novelDirectorCandidateStage.ts:373`、`:440`、`:561`、`:648` → `workflowService.recordCandidateSelectionRequired` → `NovelWorkflowApplicationService.ts:482` → Store 写入状态、检查点、进度、心跳及里程碑。
- `commands/DirectorCommandService.ts:452` → `workflowService.retryTask` → `NovelWorkflowApplicationService.ts:372` → Store 写入重试状态。
- 恢复命令/任务适配器 → `NovelWorkflowApplicationService.applyAutoDirectorLlmOverride`（`:412`）→ 旧 seed 构建逻辑 → Store；仍直接覆盖顶层模型和输入模型字段。

这些主要是既有路径未完成迁移，不能称为本轮新增业务回退。它们说明“只有一个写入口”“launch 冻结”的目标尚未全面实现。守卫匹配直接方法，不能自动证明所有间接应用服务链已收敛。

**返工：** 候选检查点与重试提供 Writer 语义入口，仍委托既有 workflow 持久化；模型恢复覆盖以显式运行态覆盖表达，不修改启动合同。核对所有导演调用方到实际写库的路径，保持非导演 lane 的原有工作流边界。

### 3-9 / P2：合同缺失字段补齐和接管整体替换边界不严格

**位置：** `server/src/services/novel/director/state/DirectorTaskStateWriter.ts:62`、`:110`、`:119`。

- 已关联小说的普通任务也可补齐启动合同缺失字段：冲突检查对当前缺失字段直接跳过，没有限制在尚未关联小说的候选首次定稿边界。内存调用给已关联任务补 provider，写入成功。
- `replaceLaunchContract="takeover"` 只跳过冲突检测，仍执行 `mergeLaunchState`，新合同省略的旧 model 等字段留下；不是方案要求的整体替换。内存调用整体替换后仍保留 old model。

常规接管当前会新建任务，本次没有证明这两个 API 缺陷已在常规接管中触发；判定为 I6 合同入口缺口。现有缺字段测试没有明确限定 `novelId=null`；整体替换测试没有断言省略字段被删除。

**返工：** 候选首次定稿、已建立合同的更新和接管整体替换分别执行明确规则。补绑定小说后的缺字段拒绝、候选首次合法定稿、完整替换删除旧字段的测试；不能把合并称为整体替换。

## 5. 3A 完成项与观测补充

核心读路径不再调用修复器；修复器由 Worker 持有，初扫先于领取，周期扫描不放入 API 进程。3A 返工已去掉 facade `.bind` 等价绕行，并在聚合及排队修复层保护人工恢复锁。后续 3C 的 Writer 漏洞不等于这项扫描保护失效。

修复例程分类保持如下，供后续阶段七使用：

| 例程 | 分类与去向 |
| --- | --- |
| `healBrokenAutoDirectorCandidateSeedPayload` | 历史候选数据修复，暂留 Worker |
| `healHistoricalAutoDirectorRecoveryFailure` | 历史恢复兼容修复，暂留 Worker |
| `healHistoricalAutoDirectorFront10RecoveryFailure` | 历史前十章恢复兼容修复，暂留 Worker |
| `healChapterTitleDiversitySoftFailure` | 历史标题错误兼容，暂留 Worker |
| `healStaleAutoDirectorQueuedProgress` | 排队运行态对账，Worker 周期处理 |
| `healStaleAutoDirectorRunningTask` | 失联/中断对账，Worker 周期处理 |
| `healStaleAutoDirectorStructuredOutlineProgress` | 结构化规划进度对账，Worker 周期处理 |
| `healRuntimeGateApprovalState` | 步骤事实与任务行审批状态不一致的对账 |
| `healRuntimeFailedState` | 步骤事实与任务行失败状态不一致的对账 |
| `syncActiveAutoDirectorAutoExecutionTaskState` / `syncAutoDirectorChapterBatchCheckpoint` | 章节执行和批次检查点对账，同属一组执行状态协调 |

**观测缺口 / P3：** `NovelWorkflowHealingService.ts:305`、`:364` 的成功修复结果没有形成方案要求的触发日志，`workers/directorTaskHealingSweep.ts:54` 主要记录异常。3B 后若事实对账仍触发，需要能识别修复类别和任务，才能追踪残留多写入口。应补精简的结构化日志，避免把全部 seed 或创作内容写入日志。

## 6. 守卫和测试治理返工

### R3：等价选项别名不是解析入口收敛

`director/http/novelWorkflows.ts:100` 把 `seedPayloadMode` 改为 `directorTaskDataMode`；`services/task/adapters/NovelWorkflowTaskAdapter.ts:468`、`:512` 接受两者并执行相同 compact 分支，适配器 `:498` 仍直接解析原始 JSON。这里确有一处守卫引用因等价改名消失，并未由 Reader 消除对应解析依赖。

须恢复这项引用/基线统计，或完成真正的 Reader 边界迁移。若认为原指标把外部 DTO 选项误计为业务解析，需要按 R1/R3 报告并获批准后修改定义，不能直接把改名后的 0 当作达标。此结论不推定执行者意图。

`workflow/http/novelWorkflowBootstrapBody.ts` 对旧 HTTP `seedPayload` 的兼容转换则是外部参数适配，不应和上述别名混为一谈；它没有通过隐藏业务读写入口达到降数。

### S2：恢复原有覆盖，保留小说身份断言

- `server/tests/directorRunCommandService.test.js:571`、`:1321` 的两处旧场景补入 `full_book_autopilot`，替换原有 `auto_to_execution` 覆盖，移除了原模式转换场景。应该恢复旧场景，另增全书场景，不能用预先相同的合同掩盖转换问题。
- `server/tests/novelDirectorRetry.test.js:457` 将旧 bootstrap 上的 `novelId` 断言替换为 title 断言，没有在新持久化/执行边界保留同一本小说的等价身份断言。调用入口可以调整，身份语义必须保留。
- 新合同测试必须使用真实输入构建和完整确认链；新增覆盖不能只验证 guard 抛错或提前中断路径。

**提交颗粒度说明：** 3C 实现提交涉及 68 个文件，超过 S6 的 40 文件阈值；3A/3B/3C 拆分仍不足以满足该次提交的颗粒度约束。返工按独立边界拆分提交，逐批核验。这里是流程缺口，不额外认定为运行时错误。

## 7. 既有例外与本次范围外事项

- 步骤事实已变化而任务行等待 Worker 对账，跟进动作可能暂时 forbidden，窗口约 60 秒；2026-09-27 已获人工接受，阶段四仍需确认消失。不能把该已批准窗口再次当作本轮新增阻断。
- 既有 workspace-analysis/manual-edit-impact GET 在显式 taskId 下会保存分析快照。因此本报告认可的是计划指定核心查询的读取纯度，不宣称全站所有 GET 均不写库。
- Worker 每 60 秒扫描历史任务的成本可另行优化；本轮不删除历史数据或清理数据库。
- 基点历史 fast、integration 失败不在本次重构修复范围；完整身份清单见附录。
- manual_create 的旧恢复目标兼容需要补输入契约测试；尚未证明有实际调用依赖该字段，不把潜在场景计为已复现用户回退。
- 本次没有浏览器、截图或人工 UI 点验；阶段二已有人工界面验收事项仍由用户完成。
- 没有改 schema、提示词、步骤内生成算法或章节质量策略。本次返工建议也不授权修改这些边界。

## 8. 新鲜验证证据

### 环境与完整性

两工作区先分别编译 shared/server，之后执行测试；当前分支另完成全仓 `pnpm typecheck`。Node `v24.20.0`，统一显式环境 `NODE_ENV=test`、`AI_NOVEL_DATABASE_MODE=sqlite`、`RAG_ENABLED=false`；从当前 `.env` 加载其他相同配置。按各工作区官方 `scripts/run-tests.cjs` 的完整 fast/integration 分组选文件，fast 并发 4，integration 串行。

每次运行创建独立 SQLite 库，以现有 103 个 SQLite migration SQL 初始化；测试清理保护钩子保留这些库，没有执行 reset 或删除数据库。最终功能复现采用模块加载拦截与内存替身，不需要实际小说数据或 AI 请求。独立审阅的早期导入曾触发现有 Prisma 模块初始化，因此不声称整个审阅过程绝无运行时数据库初始化；没有执行应用数据清理/迁移，最终复现均已改为导入前拦截。

对照器要求完整闭合的 JUnit；按“仓库相对文件 + 测试名称”比较，忽略迁移后的行号，不以失败数量相同代替身份相同。文件加载失败独立记为 `<file-load-error>`。

| 检查 | 基点 | 当前 | 结论 |
| --- | --- | --- | --- |
| shared/server 编译 | exit 0 | exit 0 | 当前测试读取新编译产物 |
| 全仓 `pnpm typecheck` | 本次不重复基点全仓检查 | exit 0 | shared、server、client、desktop 均完成 |
| `directorSimplificationGuard.test.js` | 参考已提交基线 | 12/12，exit 0 | 计数通过，语义缺陷见上文 |
| 完整 fast | 1,393：1,341 通过 / 40 失败 / 12 跳过 | 1,450：1,398 通过 / 40 失败 / 12 跳过 | 新增失败：无；已修复基点失败：无 |
| 完整 integration | 144：132 通过 / 10 失败 / 2 跳过 | 144：132 通过 / 10 失败 / 2 跳过 | 新增失败：无；已修复基点失败：无 |

两完整套件均 exit 1，不能写成“全部通过”。当前 fast 比直接基点累计多 57 项，这包含阶段一至三累计新增/调整，不能全部算作阶段三新增。

**与此前报告的环境差异：** 之前的 fast 同环境报告为 37 项失败，本次显式预加载 `RAG_ENABLED=false` 后基点和当前均为 40 项。额外三项为 `bookAnalysis` 的 facet 检索、`knowledgeServiceStatus` 的归档清理入队及恢复重建入队；关闭 RAG 时与各测试期望不同。直接基点本轮也失败，所以不是此次重构新增。历史方案的 34/6、此前本机的 37/10、本次的 40/10 分属不同环境证据，应保留各自失败身份，不混写数字。

**异常复跑：** 第一次当前 fast 得到 1,448 项、41 项失败，含 `onboardingServices.test.js` 文件加载失败。同一时段运行过类型检查/Prisma 生成，但没有足够证据证明它是原因。该文件同配置隔离重跑 3/3；停止编译/生成后完整 fast 再跑得到 1,450 项、40 项失败，与基点身份一致。本报告采用最终完整结果，保留首次异常记录，不将其直接归为业务回归或确定的环境原因。

### 可追溯产物

| 产物 | 路径 |
| --- | --- |
| 基点 fast JUnit、元数据及数据库 | `D:/code/ai-baseline-d3a9ca99/server/.tmp/stage3-acceptance-baseline-20260929-fast.{xml,json,sqlite}` |
| 基点 integration | `D:/code/ai-baseline-d3a9ca99/server/.tmp/stage3-acceptance-baseline-20260929-integration.{xml,json,sqlite}` |
| 当前最终 fast | `D:/code/ai/server/.tmp/stage3-acceptance-current-final-20260929-fast.{xml,json,sqlite}` |
| 当前 integration | `D:/code/ai/server/.tmp/stage3-acceptance-current-20260929-integration.{xml,json,sqlite}` |
| 首次当前 fast 异常记录 | `D:/code/ai/server/.tmp/stage3-acceptance-current-20260929-fast.{xml,json,sqlite}` |
| onboarding 定向复跑 | `D:/code/ai/server/.tmp/stage3-acceptance-onboarding-20260929-fast.{xml,json,sqlite}` |
| 最终身份对照 | `D:/code/ai/server/.tmp/stage3-acceptance-final-fast-comparison.json`、`stage3-acceptance-final-integration-comparison.json` |
| 本轮安全运行与对照工具 | `D:/code/ai/server/.tmp/stage3-acceptance-run.cjs`、`stage3-acceptance-compare.cjs`、`preserve-test-sqlite-cleanup.cjs` |

基点 fast 结束 UTC `2026-09-29 05:16:35`；当前最终 fast 开始 `06:27:08`、结束 `06:28:54`；当前 integration 结束 `05:24:04`。元数据记录完整提交、文件数（基点 263/12、当前 273/15）、环境、迁移数及退出码。`.tmp` 是本地验收产物目录，不加入产品提交；以下附录把失败身份纳入版本记录。

## 9. 建议返工顺序与复验标准

1. 修复 3-1、3-2 的真实启动/执行阻断；先补完整链回归，保持合同冻结。
2. 修复 3-3、3-4、3-5 的有效请求、恢复位置和替换关系消费者契约。
3. 修复 3-6、3-7，统一锁检查与命令接受一致性；补所有 Writer 入口及暂停竞态回归。
4. 完成 3-8、3-9 的间接写入收敛和严格启动边界；补对账日志。
5. 消除 R3 等价别名降数，恢复 S2 原断言及旧模式场景；按小批次提交，不改守卫口径和阈值来掩盖缺口。
6. 重新编译，再跑 Guard、类型检查、上述真实链回归、完整 fast 和 integration；与直接基点及本报告失败身份比较，明确新增失败为无。
7. 每项标明实现与证据，更新台账；在 I5、I6、U5 和 R3/S2 问题全部关闭前不宣布阶段三完成。

本次为内部验收文档，按 `readme-release-updater` 检查范围后跳过 release notes 和 README 最新更新。现有 wiki 已表达正确的长期边界，本轮没有产生新的架构规则，不添加临时缺陷 wiki 条目。

## 附录 A：阶段三修改过的测试与原因

本次验收没有改测试。以下列出被验收的阶段三实现/返工提交涉及的测试（均位于 `server/tests/`），区分入口适配与语义缺口；不能把入口适配统称为业务断言不变。

| 文件 | 调整目的或审阅结论 |
| --- | --- |
| `autoDirectorFollowUpActionExecutor.test.js` | 移除读时修复后，按当前状态校验动作；已批准的 Worker 对账窗口另记 |
| `directorReadPathsArePure.test.js` | 新增核心读取纯度回归 |
| `directorWorker.test.js` | Worker 领取前初扫及周期修复 |
| `directorManualRecoveryLock.test.js` | 新增聚合/后台修复保留人工锁回归 |
| `novelWorkflowCancellation.test.js` | 将取消恢复归一化测试定位到修复器入口 |
| `novelWorkflowRecoveryNormalization.test.js` | 将历史恢复归一化测试定位到修复器入口 |
| `directorTaskStateWriter.test.js` | 新增/扩展写门面、锁与启动/运行状态边界；新增运行态入口缺少清锁覆盖 |
| `novelWorkflowTaskFactory.test.js` | 新增共用建任务字段组装回归 |
| `directorRunCommandService.test.js` | 事务恢复、接管幂等、命令结束竞态及 Reader/Writer 替身；两处旧模式场景需恢复，见 S2 |
| `novelDirectorConfirmDedup.test.js` | 确认路径使用状态写门面并保留创建去重语义 |
| `novelWorkflowRuntime.test.js` | 调整恢复/运行时入口及移除无生产调用的旧后台恢复链测试；历史台账说明此项删除，不作为新增通过数 |
| `taskRecoveryRoutes.test.js` | 显式命令恢复入口及返回边界 |
| `autoDirectorValidationContract.test.js` | 任务验证消费 Reader 视图 |
| `directorBookAutomationProjection.test.js` | 书级投影消费统一任务读取替身 |
| `directorLaunchContractImmutable.test.js` | 新增合同冻结/候选定稿/接管测试；缺字段和替换删除语义覆盖不足 |
| `directorRecoverySampleAudit.test.js` | 审计样本从 Reader/运行视图取任务信息 |
| `directorStateReader.test.js` | 新增 typed launch/run、兼容数据及恢复位置优先回归 |
| `directorTaskFactInspection.test.js` | 事实检查读取统一状态 |
| `directorWorkflowStepModules.test.js` | 步骤模块任务读取替身适配；尚缺校准指令实际进入生成的回归 |
| `novelDirectorAutoExecutionRuntime.test.js` | 自动执行读取与运行态存储断言适配；真实 builder 与合同冻结组合缺覆盖 |
| `novelDirectorCandidateRuntime.test.js` | 候选阶段状态入口适配 |
| `novelDirectorChapterTitleRepair.test.js` | 标题修复 Writer/Reader 替身适配 |
| `novelDirectorCharacterGate.test.js` | 角色阶段任务状态读取适配 |
| `novelDirectorConfirmLaunchContract.test.js` | 新增候选确认合同回归；只到领取边界，遗漏创建后初始化 |
| `novelDirectorPipelineRuntime.test.js` | 主流水线读取/写入门面适配 |
| `novelDirectorRetry.test.js` | 恢复写 run、冻结 launch 的新边界；缺小说身份等价断言，见 S2 |
| `novelDirectorStructuredOutlinePersistence.test.js` | 结构化规划 Reader 与增量持久化适配 |
| `novelDirectorTakeover.test.js` | 接管任务状态读取适配 |
| `novelDirectorTakeoverContinue.test.js` | 接管取消与嵌套运行态存储适配；未检查跟进消费者 |
| `novelDirectorTakeoverExecution.test.js` | 接管执行范围和恢复状态入口适配 |
| `novelWorkflowBootstrapBody.test.js` | 新增外部 bootstrap DTO 兼容适配测试 |
| `novelWorkflowContinue.test.js` | 继续入口读取 Reader/运行态字段适配 |
| `simpleCreationMode.test.js` | 简易生产任务状态替身适配 |
| `fixtures/directorSimplification.baseline.json` | 同步阶段指标；定义与阈值未因本次验收修改，R3 别名仍需处理 |

## 附录 B：本次同环境完整失败身份

下列清单由最终完整 JUnit 对照生成；每项在基点和当前同时失败。`<file-load-error>` 表示测试文件级失败，不把它错误算成某条内部用例。基点历史问题留待独立清理。

### fast：40 项

- `server/tests/autoDirectorAutoApprovalAudit.test.js`：`auto director auto-approval audit loads the latest 10 records per novel`。
- `server/tests/bookAnalysis.test.js`：`HybridRetrievalService retrieveByFacet applies facet filters`。
- `server/tests/bookAnalysis.test.js`：`NovelExportService exports generated chapters as a knowledge document for diagnosis`。
- `server/tests/bookAnalysis.test.js`：`NovelReferenceService formats structured timeline nodes by phase`。
- `server/tests/bookAnalysisCharacterCandidate.test.js`：`generateAllCandidates skips generated rows and processes failed candidates`。
- `server/tests/bookAnalysisCharacterCandidate.test.js`：`generateCharacterProfile transitions candidate to generated with arcs and scenes`。
- `server/tests/bookAnalysisCharacterCandidate.test.js`：`identifyCharacterCandidates dedupes candidates and keeps generated rows intact`。
- `server/tests/bookAnalysisCharacterCandidate.test.js`：`legacy generateCharacters identifies then generates profiles`。
- `server/tests/chapterArtifactInfluence.test.js`：`artifact delta expires accepted influence proposals once their window has passed`。
- `server/tests/chapterArtifactInfluence.test.js`：`artifact delta only applies accepted influence proposals that are active in this chapter`。
- `server/tests/chapterStructuredOutputNormalization.test.js`：`character resource extraction schemas cap resource deltas at eight items`。
- `server/tests/characterMind.test.js`：`character mind persistence archives the old current snapshot before creating a replacement`。
- `server/tests/characterVisibleProfile.test.js`：`chapter character context includes compact visible profile summary`。
- `server/tests/directorDirectoryBoundary.test.js`：`director root stays limited to compatibility facades`。
- `server/tests/directorDisplayStateBuilder.test.js`：`display state keeps running mode when task is running despite stale approval projection`。
- `server/tests/directorDisplayStateBuilder.test.js`：`display state maps chapter draft execution into chapter stage and uses fact progress`。
- `server/tests/knowledgeServiceStatus.test.js`：`archiving knowledge document queues index cleanup and leaves document content untouched`。
- `server/tests/knowledgeServiceStatus.test.js`：`restoring archived knowledge document queues a rebuild and marks indexing queued`。
- `server/tests/novelContinuationReferenceHardening.test.js`：`<file-load-error>`。
- `server/tests/novelDirectorCharacterGate.test.js`：`director character phase applies an existing draft cast option without regenerating`。
- `server/tests/novelDirectorConfirmDedup.test.js`：`confirm runtime creates the novel through the standard runtime node`。
- `server/tests/novelDirectorStageNodeAdapters.test.js`：`director planning stages expose standard node adapter contracts`。
- `server/tests/novelDirectorStructuredOutlinePersistence.test.js`：`runDirectorStructuredOutlinePhase persists chapter detail after each completed chapter`。
- `server/tests/novelDirectorStructuredOutlinePersistence.test.js`：`runDirectorStructuredOutlinePhase resumes from the next incomplete chapter`。
- `server/tests/novelDirectorTakeoverExecution.test.js`：`continue_existing chapter takeover does not reuse the requested auto execution range`。
- `server/tests/novelExportService.test.js`：`buildExportContent uses novel title plus timestamp as export filename`。
- `server/tests/novelPlanningService.test.js`：`<file-load-error>`。
- `server/tests/novelProduction/artifactCheckpoint.test.js`：`checkpoint: active running claim does not start another extraction`。
- `server/tests/novelWorkflowContinue.test.js`：`novel workflow continue route accepts range and full-book continuation modes`。
- `server/tests/novelWorldModelSelection.test.js`：`novel theme world prompt stays within a one-shot JSON budget`。
- `server/tests/payoffLedgerShared.test.js`：`buildPayoffLedgerResponse orders items by risk and computes summary counts`。
- `server/tests/ragContextualChunk.test.js`：`<file-load-error>`。
- `server/tests/ragJobListing.test.js`：`<file-load-error>`。
- `server/tests/ragRetrievalTrace.test.js`：`RagRetrievalTracer writes sampled trace summaries without chunk text`。
- `server/tests/routes.test.js`：`novel routes preserve book framing fields through create-get-update cycle`。
- `server/tests/routes.test.js`：`PUT /api/settings/rag saves extended settings and auto-enqueues reindex`。
- `server/tests/style-engine.test.js`：`StyleRewriteService includes preview anti-ai rules in the repair prompt`。
- `server/tests/styleGenerationSanitizer.test.js`：`sanitizeStyleContextForGeneration redacts source entities before writer context`。
- `server/tests/tools.test.js`：`agent tool definitions keep zod declarations in dedicated schema modules`。
- `server/tests/worldContextGateway.test.js`：`gateway delegates novel theme world generation through novel world service`。

### integration：10 项

- `server/tests/p0bRealPrismaChain.test.js`：`legacy project migration feeds shared review context through manual audit on a real sqlite chain`。
- `server/tests/p0bRealPrismaChain.test.js`：`persisted volume strategy resumes auto director into structured outline on a real sqlite chain`。
- `server/tests/p0bRealPrismaChain.test.js`：`volume workspace projects feed the same shared review context through manual audit on a real sqlite chain`。
- `server/tests/prompting-governance.test.js`：`prompt governance keeps inline SystemMessage/HumanMessage builders in the approved set`。
- `server/tests/prompting.test.js`：`character cast prompt hardens real-name constraints and required gender output`。
- `server/tests/prompting.test.js`：`prompt registry exposes versioned planning assets`。
- `server/tests/ragCompatibilityBootstrap.test.js`：`legacy provider-specific embedding env is imported when generic embedding env is absent`。
- `server/tests/ragCompatibilityBootstrap.test.js`：`legacy RAG env bootstrap preserves the historical default collection when legacy knowledge exists`。
- `server/tests/ragCompatibilityBootstrap.test.js`：`packaged desktop preserves a user-saved RAG pause`。
- `server/tests/ragCompatibilityBootstrap.test.js`：`packaged desktop restores the legacy forced RAG pause only when no user runtime settings exist`。
