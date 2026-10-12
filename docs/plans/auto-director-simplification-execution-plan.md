# 自动导演瘦身改造执行方案

更新日期：2026-09-24

适用对象：执行改造的开发者或 AI 模型。**动手前必须通读第 1～4 节，并先读第 7 节状态台账。**

关联文档：

- [自动导演 Runtime 与恢复边界](../wiki/workflows/auto-director-runtime.md)（旧规则集合，本方案完成过程中逐步改写）
- [自动导演执行面隔离与 API 保活计划](./auto-director-execution-plane-isolation-plan.md)
- 守卫测试：`server/tests/directorSimplificationGuard.test.js`
- 守卫基线：`server/tests/fixtures/directorSimplification.baseline.json`

---

## 1. 完成预期

本节是验收依据。实现细节可以调整，本节不可以。

### 1.1 用户能感知到的结果（全部阶段完成后）

| 编号 | 用户看到的结果 |
| --- | --- |
| U1 | **书就是任务的地址。** 从小说列表、首页、简易书架、完整工作台、运行记录进入同一本书，刷新页面、重启桌面版、复制地址重新打开，看到的都是这本书当前的 AI 任务。小说页面地址栏里不出现 `directorTaskId`、`workspaceTaskId`、`taskId`。旧链接仍能打开，打开后参数会被自动去掉。 |
| U2 | **一本书同一时间只有一条进行中的 AI 任务。** 已有进行中的任务时再启动新任务，要么明确提示“这本书已有进行中的 AI 任务”，要么（仅限“按现有进度接管”）明确替换旧任务，旧任务进入运行记录成为历史。 |
| U3 | **所有界面对同一个暂停给出同样的状态和按钮。** 简易书架、完整工作台、AI 驾驶舱、任务抽屉显示的主状态、主按钮文案、按钮效果完全一致，按钮由服务端给出。 |
| U4 | **只看不改。** 打开页面、刷新列表、查看运行记录不会改变任何任务的状态、进度或检查点。 |
| U5 | **能力不变。** 开书、候选、规划、正文、审校修复、质量债、重规划、暂停恢复、接管的行为与改造前一致，生成质量不变。 |

唯一例外：**开书前**（选择方向阶段，书还不存在）的 `/novels/auto-director?taskId=...` 保留任务编号，因为此时没有书可以绑定。书一旦创建，该页面自动跳转到这本书的地址。

### 1.2 工程上可检查的结果

每项指标由守卫测试自动统计，当前值见基线文件。全部阶段完成时，目标值均为 0。

| 指标 | 含义 | 基线（2026-09-24） | 目标 | 阶段 |
| --- | --- | --- | --- | --- |
| `adHocCurrentTaskLookups` | 绕过统一入口，自行按书查找导演任务 | 16 | 0 | 1 |
| `clientUrlTaskIdParams` | 前端把任务编号当 URL 参数读写 | 34 | 0 | 2 |
| `healOnReadCallSites` | 读取路径里“顺手修复”任务状态 | 9 | 0 | 3 |
| `directorTaskWritesOutsideState` | `state/` 以外直接写任务状态 | 64 | 0 | 3 |
| `directorSeedPayloadRefs` | `state/` 以外直接读写 seedPayload | 292 | 0 | 3 |
| `continuationModeRefs` | 按“继续模式”参数分支 | 31 | 0 | 4 |
| `runModeBranches` | 直接按运行模式分支 | 45 | 0 | 5 |
| `inProcessBackgroundScheduling` | 进程内 `setImmediate` 伪装后台任务 | 13 | 0 | 5 |
| `stepRuntimeServiceLocator` | 步骤模块回调流水线的全局获取函数 | 54 | 0 | 5 |
| `clientStatusDerivation` | 前端自行推断导演状态 | 205 | 0 | 6 |
| `legacyRuntimeTableAccess` | 访问旧运行时表 | 1 | 0 | 7 |

此外每个阶段要新增“不变量测试”（第 3 节）。**不变量测试和指标一起构成完成标准，缺一不可。**

### 1.3 不在范围内（看到了也不要做）

- 不改提示词、章节生成 / 审校 / 修复算法、问题目录、质量策略内容。
- 不改界面视觉和布局，只改数据来源、链接和按钮来源。
- 不新增功能、运行模式或检查点类型。
- 不改 `manual_create`、`creation_studio` 两条业务线的逻辑，只把 `workspaceTaskId` 移出 URL。
- 不改 Prisma schema，不删表删列，不修改历史数据。第 7 阶段经人工批准并完成备份后除外。
- 不顺手拆文件、改命名、调格式、“优化”阶段范围以外的代码。

---

## 2. 为什么之前会“改好又回去”，以及本方案怎么防

### 2.1 原因（已在代码中核实）

1. **“这本书当前是哪个任务”有四种判定。** `findActiveTaskByNovelAndLane` 只看活动态并按 `updatedAt` 取前 10 条；`book-automation` 投影按 `updatedAt` 取任意状态的最新一条；`bootstrapTask` 先找活动态再退回最新；接管有自己的过滤。四种判定结果可能不同，前端只好把任务编号钉在 URL 里，URL 又和服务端判定互相打架。
2. **读操作会写数据。** 每次读取任务都会执行 `healAutoDirectorTaskState`，里面依次跑 10 个修复例程。同一个任务，谁在什么时候读它，都可能改变它的状态。某次修复写进自愈例程，下一次读取时另一个例程又把它改回去。
3. **同一状态有多个写入口和多份存储。** 任务表的列、`seedPayloadJson` 的 20 多个顶层字段、`DirectorRun/StepRun/Event/Artifact`、旧运行时表并存。修好一个入口，另一个入口还在写旧值。
4. **目标只写在对话和 wiki 里，没有可执行的检查。** 下一次会话的模型看不到“已经决定不这样做”，按局部合理性又改回去。wiki 里大量规则本身就是“X 优先于 Y”这类补丁。

### 2.2 防回退机制（必须遵守）

| 编号 | 规则 |
| --- | --- |
| R1 | **棘轮守卫。** `directorSimplificationGuard.test.js` 的每项指标只能降，不能升。降了必须在同一提交里把基线下调到新值（测试会提示），否则测试失败。提高基线、修改指标定义或排除名单，必须经人工批准并记录在第 7 节台账。 |
| R2 | **不变量测试不可放宽。** 每个阶段新增的不变量测试就是完成标准本身。之后任何阶段不得删除、`skip`、`todo` 或放宽其断言。确需修改时，停止并报告。 |
| R3 | **禁止规避指标。** 不得通过改名（例如把 `directorTaskId` 改成 `dirTaskId`）、拼接字符串、换一个等价函数、挪到排除目录等方式让指标下降。评审发现即判定该阶段未完成并回滚。 |
| R4 | **台账先读后写。** 每阶段开始前读第 7 节；结束时填写日期、提交、指标新值、新增测试、遗留问题。 |
| R5 | **wiki 同步删旧规则。** 阶段完成时，把 `docs/wiki/workflows/auto-director-runtime.md` 中与本阶段结果矛盾的规则删除或改写为新的不变量。旧规则留在 wiki 里，下一个模型就会照着改回去。 |
| R6 | **冲突优先级。** `AGENTS.md` > 本方案 > wiki 中的旧规则 > 现有代码写法。 |

---

## 3. 不变量清单

每条不变量都要有对应的测试文件。测试文件名是约定，执行时按此命名。

| 编号 | 不变量 | 测试 | 阶段 |
| --- | --- | --- | --- |
| I1 | 同一本书任意时刻最多一条非终态（`queued` / `running` / `waiting_approval`）的 `auto_director` 任务。所有新建入口都保证这一点。 | `server/tests/directorCurrentTask.test.js`（真实数据库，加入 integration 列表） | 1 |
| I2 | “书的当前导演任务”只由 `resolveCurrentDirectorTask(novelId)` 决定：未归档、按 `createdAt` 降序、再按 `id` 降序的第一条，**不按状态过滤，不按 `updatedAt` 排序，不触发任何修复**。 | 同上 + 指标 `adHocCurrentTaskLookups = 0` | 1 |
| I3 | 为小说页面（`/novels/:id/edit`、`/novels/:id/simple` 及其子路由）生成的链接不含任务编号。服务端 `resumeTargetToRoute` 和前端链接函数都满足。 | `server/tests/novelRouteWithoutTaskId.test.js`、`client/src/lib/novelRoutes.test.mjs` | 2 |
| I4 | 所有 GET 接口和查询服务不写数据库。对同一任务连续调用详情、列表、书级投影、运行记录后，任务行（`status`、`updatedAt`、`seedPayloadJson`、`checkpointType`、`pendingManualRecovery`）不变。 | `server/tests/directorReadPathsArePure.test.js`（真实数据库） | 3 |
| I5 | `pendingManualRecovery` 只能被用户显式命令清除。后台轮询、Worker 恢复、读取路径都不能清除。 | `server/tests/directorManualRecoveryLock.test.js` | 3 |
| I6 | 任务的启动合同（输入、运行模式、执行范围、问题策略快照等）在任务创建后不可变，只有“接管替换”会整体换一份。 | `server/tests/directorLaunchContractImmutable.test.js` | 3 |
| I7 | 每种检查点类型在服务端都有唯一的可选动作表；所有界面拿到的可选动作来自同一个函数；用过期的检查点提交动作返回 409。 | `server/tests/directorCheckpointResolutions.test.js` | 4 |
| I8 | 执行循环语义：已完成的步骤跳过；遇到暂停写检查点并返回；逐步协作模式每步后暂停；恢复时从第一个未完成步骤开始；不重写已有正文。 | `server/tests/directorPlanExecutor.test.js` | 5 |
| I9 | 同一任务在书级投影、简易书架、驾驶舱接口返回的 `dashboardView` 完全相同（`deepEqual`）。 | `server/tests/directorDashboardViewParity.test.js` | 6 |

真实数据库测试参考 `server/tests/p0bRealPrismaChain.test.js` 的写法，并把新文件名加入 `server/scripts/run-tests.cjs` 的 `integrationTests` 集合。

---

## 4. 执行规则

### 4.1 分支与提交

- 在专用分支 `refactor/director-simplification` 上执行，从哪个分支拉出由人决定。一个阶段一个或多个提交，不跨阶段混改。
- 提交信息按仓库规则使用 `优化：` 前缀，例如 `优化：小说页面按书读取 AI 任务，地址不再携带任务编号`。
- 用户可见的变化只出现在阶段 2、4、6。这三个阶段按 README Release Notes Workflow 更新发布说明，其余阶段在报告中说明“纯内部改动，跳过发布说明”。

### 4.2 每阶段必跑的验证

```text
pnpm --filter @ai-novel/server test              # 所有阶段；包含守卫测试
pnpm --filter @ai-novel/server test:integration  # 阶段 1、3、4、5、6
pnpm typecheck                                   # 所有阶段
pnpm --filter @ai-novel/client test              # 阶段 2、4、6
```

界面验收由人进行。执行者在报告里列出需要人工点验的页面和操作路径，不自行做浏览器或截图验证。

**“通过”的判定：与分支基点对比，不得新增失败。** 基点 `d3a9ca99` 本身存在历史失败：按下面的隔离方式运行，fast 套件 34 项，集成套件 6 项（`p0bRealPrismaChain` 3 项、`prompting` 2 项、`prompting-governance` 1 项）。每次验收都必须运行**完整的** fast 套件和集成套件，列出失败清单，与基点清单比较，报告里写明“新增失败：无”。只跑相关的针对性测试不能作为通过依据。

- **按“文件 + 测试名称”对比，不按行号对比。** 本阶段改过的测试文件行号会移动，同一行号在两边可能是不同的测试。
- **用隔离进程运行后再对比。** `pnpm --filter @ai-novel/server test` 的 fast 模式把所有测试文件放在同一进程里执行，文件之间共享的 `prisma` 替身会互相干扰，失败数不稳定，在 Windows 上还可能挂住不退出。对比时使用 `node --test --test-concurrency=4 --test-timeout=120000 --test-reporter=junit --test-reporter-destination=<文件> <测试文件…>`，从 junit 结果里提取失败的测试名称。

注意：`server/tests/*.test.js` 读取的是 `server/dist` 编译产物。切换分支或提交后，必须先重新编译 `shared` 和 `server`，再单独运行测试文件，否则测的是上一次编译的代码。

如果历史基点 `d3a9ca99` 因工作树初始化或测试进程异常而无法形成完整 JUnit 报告，必须记录具体阻碍，不能把不完整输出写成“与基点一致”。执行者还要对比阶段开始前最近一份已验收阶段的完整 JUnit 快照，并明确称为“前置阶段回归对比”。这项补充比较只说明相对前置阶段没有引入失败，**不能替代分支基点对比，也不能据此宣布阶段验收通过**；直接基点比较仍不可判定时，必须作为验收缺口列出，待补齐有效对照后再关闭。不同 Windows 工作树的 SQLite 初始化和 Prisma 引擎启动情况可能造成集成失败数不同，报告应分别列出各自环境及失败清单，不得把环境差异折算成“新增失败：无”。

### 4.3 修改现有测试的规则

- 只允许修改“因为删除或移动了内部实现，导致无法导入或编译”的测试，改为测试新的入口。
- 行为断言（状态值、事件、输出内容、调用次数）不得放宽。
- `server/tests/directorDirectoryBoundary.test.js` 中固定的根目录文件清单只允许删减，不允许新增。
- 每个修改过的测试都要在报告里列出文件和原因。

### 4.4 停止条件

遇到以下任一情况立即停止，写报告等待人工决定，不要绕过：

| 编号 | 情况 |
| --- | --- |
| S1 | 需要提高任一基线，或修改守卫的指标定义、排除名单。 |
| S2 | 需要删除、跳过或放宽不变量测试，或放宽现有行为断言。 |
| S3 | 需要修改 Prisma schema，或修改、删除已有数据库数据。 |
| S4 | 某个入口的现有产品语义不清楚，例如某种情况下应该拒绝还是替换、某个检查点应该给哪些按钮。 |
| S5 | integration 测试失败，且无法在本阶段范围内定位原因。 |
| S6 | 本阶段改动预计超过 40 个文件，需要先拆成子阶段。 |

### 4.5 阶段报告模板

```markdown
## 阶段 N 报告
- 分支 / 提交：
- 指标变化：指标名 旧值 → 新值（基线已同步下调：是/否）
- 新增不变量测试：文件名，覆盖的不变量编号
- 修改的现有测试：文件名 + 原因
- 入口 / 决策清单：（本阶段要求填写的表）
- 验证命令与结果：
- 需要人工点验的界面路径：
- 遗留问题与停止条件：
- wiki 改写：删除 / 改写了哪些旧规则
```

### 4.6 给执行模型的提示词模板

```text
你在执行 docs/plans/auto-director-simplification-execution-plan.md 的第 N 阶段。
1. 先完整阅读该文档第 1～4 节和第 7 节台账，再阅读第 N 阶段。
2. 只做第 N 阶段列出的事情。范围以外的问题记到报告的“遗留问题”，不要修。
3. 运行 node --test server/tests/directorSimplificationGuard.test.js，确认开始前全部通过。
4. 按阶段步骤实施。每让一项指标下降，同步下调基线文件中的对应数值。
5. 遇到第 4.4 节任一停止条件，立即停止并输出报告。
6. 完成后运行第 4.2 节要求的命令，按第 4.5 节模板输出报告，并更新第 7 节台账。
不得通过改名、拼接字符串或挪目录规避守卫指标；不得删除或放宽任何测试断言。
```

---

## 5. 目标模型

改造完成后，自动导演只有下面五个核心概念：

```text
书 (novelId)
 └─ 当前导演任务      resolveCurrentDirectorTask(novelId)，唯一判定
     ├─ 启动合同       创建时写入，之后只读
     ├─ 运行状态       只经 state/ 写入：阶段、章节游标、检查点、人工恢复锁、质量债
     ├─ 执行           一个步骤计划 + 一个循环（DirectorPlanExecutor），只在 Worker 中运行
     ├─ 暂停           检查点 + 服务端给出的可选动作表
     └─ 展示           一个 DashboardView，所有界面共用
```

---

## 6. 阶段

### 阶段 0：守卫与基线（已完成）

- 已新增守卫测试 `server/tests/directorSimplificationGuard.test.js` 和基线 `server/tests/fixtures/directorSimplification.baseline.json`，共 11 项指标。
- 守卫测试放在 `server/tests/` 下，会被 `pnpm --filter @ai-novel/server test` 的 fast 模式自动运行。
- 查看各指标当前明细：在 `server/` 目录执行 `$env:DIRECTOR_GUARD_PRINT="1"; node --test tests/directorSimplificationGuard.test.js`。
- 守卫已做反向验证：把基线调低 1 时测试失败，恢复后通过。

### 阶段 1：一本书一个当前导演任务（服务端）

**目标：** 服务端对“这本书当前是哪个导演任务”只有一种答案，并且新建任务时不会出现两条同时进行的任务。

**完成标准：** 不变量 I1、I2 测试通过；`adHocCurrentTaskLookups = 0`；本阶段不改前端。

**步骤：**

1. 新增 `server/src/services/novel/director/state/currentDirectorTask.ts`，并在 `state/index.ts` 导出：
   - `resolveCurrentDirectorTask(novelId)`：查询 `lane = auto_director`、该 `novelId`、未归档的任务，按 `createdAt desc, id desc` 取第一条。必须使用不触发修复的原始查询（参考 `getVisibleRowsByNovelIdRaw` 的归档过滤，但排序改为 `createdAt`，不要 `take: 10`）。
   - `findActiveDirectorTask(novelId)`：在上一步的结果上判断是否处于非终态，**不要再写一套查询**。
   - `startDirectorTaskForNovel(input, { whenActive: "reject" | "supersede" })`：在一个 `prisma.$transaction` 内先查该书的非终态导演任务。
     - `reject`：抛出 `AppError(409)`，错误码 `DIRECTOR_TASK_ALREADY_ACTIVE`，附带 `activeTaskId`，用户文案为“这本书已有进行中的 AI 任务，请先继续或取消当前任务。”
     - `supersede`：把这些任务置为 `cancelled`，`lastError` 写“已被新的 AI 任务替换”，同时把它们仍处于活动状态的 `DirectorRunCommand` 置为 `cancelled`，然后创建新任务。
2. 列出所有创建 `auto_director` 任务的入口。可以用 `rg -n "lane: \"auto_director\"" server/src` 和 `rg -n "forceNew" server/src` 查找。逐一改为调用 `startDirectorTaskForNovel`，并在报告中填写入口清单：

   | 入口（文件:函数） | 现有行为 | 选择 reject / supersede | 理由 |
   | --- | --- | --- | --- |

   已知入口和应保持的语义：
   - `DirectorCommandService.enqueueTakeoverCommand`：策略不是 `continue_existing` 且已有活动任务时，使用 `reject`。现有逻辑是在 Worker 里的 `startTakeover` 报同样的错，这里只是提前到入队时。策略是 `continue_existing` 时，使用 `supersede`。
   - `novelDirectorTakeoverExecution` 中的 `bootstrapTask({ forceNew })`：改为复用入队时已创建的任务，不再二次新建。
   - 候选确认时把书前任务挂到新书上（`attachNovelToTask`）：新书不会有其他任务，但仍要经过同一检查。
   - 任何其他入口的语义不清楚时，触发 S4。
3. 把守卫统计到的 16 处按书查导演任务（`NovelDirectorService`、`novelDirectorContinueRuntime`、`DirectorTakeoverReadService`、`autoDirectorMemorySafety`、`http/novelWorkflows.ts`、`agents/tools/directorRuntimeTools.ts`）全部改为调用第 1 步的两个函数。要求“活动任务”的调用方用 `findActiveDirectorTask`，要求“最近任务”的调用方用 `resolveCurrentDirectorTask`。
4. `DirectorBookAutomationProjectionService` 中直接用 `prisma.novelWorkflowTask.findFirst(... orderBy updatedAt)` 取 `latestTask` 的地方，改为 `resolveCurrentDirectorTask`。这一处守卫统计不到，必须手工修改，并在报告中确认。
5. 写一个只读检查脚本 `server/scripts/report-director-task-conflicts.cjs`，统计现有数据库中“同一本书有多条非终态导演任务”的书及任务编号，只打印不修改。执行者运行一次，把结果写进报告。**不要修复这些数据**（S3），`resolveCurrentDirectorTask` 会取最新创建的一条作为当前任务。

**禁止：** 不改前端；不改现有接口的请求和响应格式；不删除 `findActiveTaskByNovelAndLane` 等通用函数（其他业务线还在用）。

#### 阶段 1 报告

- **分支 / 提交：** `refactor/director-simplification`，基于 `feature/creative-carryover-contract` 的 `d3a9ca992133895f9ff97dd28a3dc73388ff37be`；阶段实现提交 `3e20bbef`，审查修复提交 `6c4ff9f8`。
- **指标变化：** `adHocCurrentTaskLookups` 16 → 0；`directorTaskWritesOutsideState` 64 → 63；`directorSeedPayloadRefs` 292 → 291。三个基线值均已同步下调。
- **新增不变量测试：** `server/tests/directorCurrentTaskResolution.test.js` 覆盖创建时间/id 决定当前任务、归档过滤及状态无关；`server/tests/directorCurrentTask.test.js` 使用真实 SQLite 覆盖当前任务选择、并发 reject、supersede 和活动命令取消。两者覆盖 I1、I2。
- **修改的现有测试：** `server/tests/directorRunCommandService.test.js` 增加启动服务桩、`continue_existing` 使用 supersede 的断言，以及“不同策略不复用命令”“终态任务的旧命令不复用”“已被替换任务不落命令”三个回归测试；`server/tests/autoDirectorMemorySafety.test.js` 调整为 mock 统一活动任务入口。`directorCurrentTaskResolution.test.js` 在每项测试后恢复模块缓存。
- **入口 / 决策清单：**

  | 入口（文件:函数） | 现有行为 | 选择 reject / supersede | 理由 |
  | --- | --- | --- | --- |
  | `NovelWorkflowApplicationService.bootstrapTask` | 通过可见任务列表复用任务或直接创建 | 已有当前任务时复用；没有任务时 `reject` 后创建 | 统一书级当前任务选择，并在创建事务中阻止并发重复任务 |
  | `NovelWorkflowApplicationService.attachNovelToTask` | 候选确认后把书前任务关联到新书 | `reject` | 关联前检查同一本书是否已有活动任务，并在事务中完成关联 |
  | `DirectorCommandService.enqueueTakeoverCommand` | Worker 的 `startTakeover` 才处理冲突 | `continue_existing` 用 `supersede`；其他策略用 `reject` | 把既有策略语义提前到命令入队，并让旧任务及活动命令一起结束 |
  | `novelDirectorTakeoverExecution` | 执行时 `bootstrapTask({ forceNew: true })` | 复用入队时创建或选定的任务 | 避免入队和 Worker 执行时各自产生任务 |

- **当前任务查询迁移：** 活动任务调用改到 `findActiveDirectorTask`：`NovelDirectorService`、`novelDirectorContinueRuntime`、`DirectorTakeoverReadService`、`autoDirectorMemorySafety`、`http/novelWorkflows.ts`、`agents/tools/directorRuntimeTools.ts`；最近可见任务调用改到 `resolveCurrentDirectorTask`：`DirectorBookAutomationProjectionService`。后者的 `updatedAt` 查询也已替换。
- **验证命令与结果：** 当前任务、命令服务和内存安全针对性测试通过（43/43）；`node --test server/tests/directorSimplificationGuard.test.js` 通过（12/12）；`pnpm typecheck` 在阶段实现提交前通过，代码审查修复后 `pnpm --filter @ai-novel/server typecheck` 通过。`node server/scripts/report-director-task-conflicts.cjs` 输出 `conflictNovelCount: 0`，只读检查未发现冲突任务。
- **集成验证：** 审查修复后重跑 `pnpm --filter @ai-novel/server test:integration`，运行 146 项，134 项通过、10 项失败。3 项 `p0bRealPrismaChain.test.js` 在 Windows 下以 `spawnSync pnpm.cmd EINVAL` 失败；4 项 `ragCompatibilityBootstrap.test.js` 在临时库 `prisma db push` 的 Schema Engine 初始化失败；其余 3 项为不涉及本阶段文件的 Prompt 治理断言（`ComicFactService.ts` 内联消息）和缺少 `novel.character.castOptions@v2` 资产的两项断言。当前任务真实 SQLite 测试在同一轮通过。失败项留待各自范围处理，不放宽断言。
- **代码审查修复：** 只复用策略相同且关联任务仍活动的 `continue_existing` 命令；新接管命令通过事务内的活动任务条件更新与命令写入，避免被并发替换后留下悬空命令。新增三项回归测试；复审确认没有遗留 Critical 或 Important 问题。
- **需要人工点验的界面路径：** 无；本阶段未改前端。
- **遗留问题与停止条件：** 集成套件仍有上述 10 项失败；失败点已定位到临时数据库启动兼容和无关 Prompt 检查，本阶段 I1、I2 相关测试通过。未修改 Prisma schema 或现有数据库数据。
- **wiki 改写：** 在 `docs/wiki/workflows/auto-director-runtime.md` 补充书级当前任务唯一判定、活动任务定义和启动冲突策略，并把接管链中的旧任务选择规则改为统一入口。
- **发布说明：** 本阶段为内部架构、测试与计划维护，没有明确用户可见变化，按仓库规则跳过发布说明和 README 最新更新。

#### 阶段 1 返工要求（2026-09-24 验收）

必须修复，修复后重新验收：

1. **接管丢失上一条任务的上下文。** 接管命令入队时已经新建了本次任务，所以在 `NovelDirectorService.startTakeover` 里，`resolveCurrentDirectorTask` 返回的就是本次任务自己，`findLatestAutoDirectorTask` 因此恒为 `null`。`loadDirectorTakeoverState` 靠它读取上一条任务的 `autoExecutionPlan`、`runMode`（决定是否允许延迟生成章节合同）、`autoExecution` 游标和最近检查点。
   - 修法：在 `state/currentDirectorTask.ts` 新增 `resolvePreviousDirectorTask(novelId, excludeTaskId)`，查询条件与 `resolveCurrentDirectorTask` 相同，只是排除指定任务，取第一条。`startTakeover` 在有 `commandTaskId` 时用它实现 `findLatestAutoDirectorTask`。
   - 回归测试：上一条任务的 seed 带 `runMode: "full_book_autopilot"` 和 `autoExecution` 游标，并且已被 `continue_existing` 替换为 `cancelled`。断言接管时 `loadDirectorTakeoverState` 得到的 `latestTaskId`、`latestAutoExecutionState`、`latestCheckpoint` 来自这条被替换的任务。
2. **fast 套件新增 15 项失败。** `directorBookAutomationProjection.test.js` 仍在替换 `prisma.novelWorkflowTask.findFirst`；`novelWorkflowContinue.test.js` 第 19、70 行仍在替换 `findActiveTaskByNovelAndLane`。按 4.3 的规则把替身改为替换新入口（`resolveCurrentDirectorTask` / `findActiveDirectorTask`，或它们使用的 `findMany` 与归档查询）。原有断言的含义保持不变，例如第 70 行仍要断言“只查询活动任务、没有活动任务时返回 null”。
3. 修复后运行完整的 fast 套件和集成套件，按 4.2 与基点清单对比，报告写明“新增失败：无”。

建议修复（不阻塞验收，可在本阶段一并处理）：

- 策略不是 `continue_existing` 时，重复点击接管会返回 409，不再像原来那样复用已入队的命令。建议在策略、请求内容和任务活动状态都相同时复用命令，任一不同则按现有规则处理。
- `startDirectorTaskForNovel` 复制了一份 `createWorkflow` 的建任务字段组装逻辑，两处以后可能改得不一致。建议抽出一个共用的字段组装函数，两处都调用它。

#### 阶段 1 返工执行记录（2026-09-27）

- **接管上下文：** 新增 `resolvePreviousDirectorTask(novelId, excludeTaskId)` 并从 `startTakeover` 排除本次已创建任务，回归覆盖上一条已取消任务提供的 `runMode`、执行范围、章节游标和检查点。
- **测试入口：** 书级投影测试切到 `findMany` 与归档查询；工作流路由测试切到 `findActiveDirectorTask`。历史任务用真实当前任务解析路径读取，断言终态任务不会被当成活动任务，且路由不读取任务详情。
- **定向验证：** `pnpm --filter @ai-novel/shared build`、`pnpm --filter @ai-novel/server build`、`pnpm --filter @ai-novel/server typecheck` 通过；`directorSimplificationGuard.test.js` 12/12 通过；接管及当前任务相关回归 35/35 通过，历史任务路由回归 1/1 通过。`server/tests/fixtures/directorSimplification.baseline.json` 的指标无需调整。
- **fast 全量：** 当前分支 1,420 项中 1,377 通过、31 失败。失败位置：`autoDirectorAutoApprovalAudit.test.js:159`、`bookAnalysis.test.js:1190,2773`、`bookAnalysisCharacterCandidate.test.js:211,253,306,355`、`chapterArtifactInfluence.test.js:7,72`、`chapterStructuredOutputNormalization.test.js:91`、`characterMind.test.js:24`、`characterVisibleProfile.test.js:53`、`directorDirectoryBoundary.test.js:14`、`directorDisplayStateBuilder.test.js:8,121`、`dramaPipelineContract.test.js:400`、`novelDirectorCharacterGate.test.js:238`、`novelDirectorStageNodeAdapters.test.js:9`、`novelDirectorStructuredOutlinePersistence.test.js:124,332`、`novelDirectorTakeoverExecution.test.js:441`、`novelExportService.test.js:7`、`novelProduction/artifactCheckpoint.test.js:119`、`novelWorkflowContinue.test.js:99`、`novelWorldModelSelection.test.js:55`、`payoffLedgerShared.test.js:159`、`ragRetrievalTrace.test.js:20`、`style-engine.test.js:593`、`styleGenerationSanitizer.test.js:110`、`tools.test.js:43`、`worldContextGateway.test.js:72`。这些失败位置均出现在基点 fast 日志中；基点 Windows runner 未正常退出，日志记录到 1,321 个通过、67 个失败和 12 个跳过后仍挂起，因此无法用该次运行核对完整基点总数。
- **集成全量：** 当前分支 146 项中 134 通过、10 失败、2 跳过。失败位置：`p0bRealPrismaChain.test.js:483,495,507`、`prompting-governance.test.js:122`、`prompting.test.js:148,419`、`ragCompatibilityBootstrap.test.js:256,288,321,337`。这些位置均在基点集成输出或基点单文件复跑中复现；RAG 四项在两边单文件运行时均因 Prisma schema engine 错误失败。
- **新增失败：无（按失败测试位置与基点已观测日志/复跑对照）。** 当前 Windows runner 的全量数量与方案记录的基点数量口径不同，且基点 fast runner 没有返回最终摘要；本记录明确保留该总量对比限制。发布说明与 README 最新更新按内部重构范围跳过。

### 阶段 2：小说页面地址不再携带任务编号

**依赖：** 阶段 1 完成。

**目标：** 实现 U1。小说页面通过 `novelId` 获取当前任务，URL 不再参与任务选择。

**完成标准：** I3 测试通过；`clientUrlTaskIdParams = 0`；人工点验清单全部通过。

**步骤：**

1. 服务端新增两个按书访问的接口（旧接口保留）：
   - `GET /api/novels/director/novels/:novelId/current`：返回 `resolveCurrentDirectorTask` 的任务摘要（`id`、`status`、`checkpointType` 等现有轻量字段）加 `isActive`，没有任务时返回 `null`。
   - `POST /api/novels/director/novels/:novelId/commands`：解析当前任务后，交给现有 `/tasks/:taskId/commands` 的同一处理函数，不另写逻辑。没有当前任务时返回 404。
2. 服务端 `resumeTargetToRoute`：目标路由是 `/novels/:id/edit` 或 `/novels/:id/simple` 时，输出的链接不带任何任务编号。`/novels/create?mode=director` 这类书前候选链接照旧带 `taskId`。补 `server/tests/novelRouteWithoutTaskId.test.js`。
3. 前端新增 `client/src/lib/legacyTaskUrlParams.ts`，提供 `stripLegacyTaskUrlParams(searchParams)`：去掉 `directorTaskId`、`workspaceTaskId`、`taskId`，保留其他参数。小说页面加载时调用一次，并用 `replace` 改写地址。**这是全前端唯一允许出现这些参数名的文件**，守卫已把它排除在统计外。
4. 把前端生成小说页链接的逻辑集中到 `client/src/lib/novelRoutes.ts`（如 `getNovelWorkspaceHref`、`getDirectorCockpitActionHref`、`buildTaskNoticeRoute` 中与小说页相关的部分），输出不含任务编号。补 `client/src/lib/novelRoutes.test.mjs`。
5. 小说页面（`NovelEdit`、`SimpleNovelShelfPage`、`NovelWorkspaceRail`、驾驶舱、任务抽屉、接管弹窗、跟进中心的书级入口等）一律用 `novelId` 调用第 1 步的接口或现有的 `book-automation/:novelId`，不再读写 URL 中的任务编号。删除 `novelEditWorkflowParams.ts` 中的 `directorTaskId` / `workspaceTaskId` 读写函数，并同步修改它的测试。
6. `manual_create` 业务线：`useNovelEditWorkflow` 调用 `bootstrapNovelWorkflow` 时只传 `novelId`，不传 `workflowTaskId`。服务端 `bootstrapTask` 已支持按书返回已有任务，不需要改服务端。
7. `/novels/auto-director?taskId=...`：保留；当该任务已关联 `novelId` 时，用 `replace` 跳转到这本书的地址。
8. 运行记录页（`client/src/pages/tasks/`）可以继续按任务编号查看历史记录；它的“打开来源页面”必须跳到不带任务编号的书地址。

**人工点验清单（写进报告）：** 从列表、首页、书架、工作台、运行记录分别进入同一本书；刷新；使用带旧参数的链接打开；书前候选页确认方向后自动跳转；接管替换后原书页面显示新任务。

**禁止：** 不改页面布局和视觉；不在前端新增任何“挑选当前任务”的逻辑，包括按状态过滤、按时间排序或读取本地存储。

### 阶段 3：读操作不写数据，任务状态只有一个写入口

**目标：** 实现 U4，并让任务状态只在一个模块里写入和解析。

**完成标准：** I4、I5、I6 测试通过；`healOnReadCallSites`、`directorTaskWritesOutsideState`、`directorSeedPayloadRefs` 均为 0。

本阶段较大，按 3A → 3B → 3C 顺序分三个子阶段提交。

**3A 读操作不写数据**

1. 从 `NovelWorkflowStoreService.getVisibleRowById`、`getVisibleRowsByNovelId`，以及 `NovelWorkflowTaskAdapter`、`AutoDirectorFollowUpService`、`novelCoreCrudService` 等读取路径中，移除 `healAutoDirectorTaskState` 调用。
2. 新增 `server/src/workers/directorTaskHealingSweep.ts`，在 Director Worker 进程（`server/src/workers/directorWorker.ts`）开始领取命令之前先执行一次，之后每 60 秒对导演任务调用一次 `healAutoDirectorTaskState`。不要放进 API 进程；`app.ts` 中现有的 `initializePendingRecoveries` 启动顺序保持不变。守卫只允许 `server/src/workers/` 调用该函数。
3. `AutoDirectorFollowUpActionExecutor` 是用户动作入口：改为直接基于当前状态校验，不再先修复。若因此行为发生变化，触发 S4。
4. 投影需要“疑似失联”这类显示时，只允许根据 `heartbeatAt` 与当前时间在内存里计算，不写库。
5. 在报告中确认 `NovelWorkflowHealingService` 里 10 个例程各自的分类（下表是初步判断，执行者要读代码核实）：

   | 例程 | 初步分类 | 去向 |
   | --- | --- | --- |
   | `healBrokenAutoDirectorCandidateSeedPayload` | 历史数据修复 | Worker 周期修复，阶段 7 改为一次性脚本 |
   | `healHistoricalAutoDirectorRecoveryFailure` | 历史数据修复 | 同上 |
   | `healHistoricalAutoDirectorFront10RecoveryFailure` | 历史数据修复 | 同上 |
   | `healChapterTitleDiversitySoftFailure` | 历史兼容 | 同上 |
   | `healStaleAutoDirectorQueuedProgress` | 运行时失联 | Worker 周期修复 |
   | `healStaleAutoDirectorRunningTask` | 运行时失联 | Worker 周期修复 |
   | `healStaleAutoDirectorStructuredOutlineProgress` | 运行时失联 | Worker 周期修复 |
   | `healRuntimeGateApprovalState` | 多写入口造成的不一致 | Worker 周期修复；3B 完成后应不再触发，触发时记日志 |
   | `healRuntimeFailedState` | 多写入口造成的不一致 | 同上 |
   | `syncActiveAutoDirectorAutoExecutionTaskState` / `syncAutoDirectorChapterBatchCheckpoint` | 多写入口造成的不一致 | 同上 |

6. 补 I4 测试：构造处于各种陈旧状态的任务，依次调用详情、列表、`book-automation`、运行记录、跟进中心，断言任务行完全不变。

**3B 任务状态只有一个写入口**

1. 新增 `server/src/services/novel/director/state/DirectorTaskStateWriter.ts`，提供明确的方法：`markRunning`、`markWaitingCheckpoint`、`markFailed`、`markCompleted`、`markCancelled`、`markPendingManualRecovery`、`clearPendingManualRecovery`、`updateRunState`。内部委托现有的 `workflowService` 方法，不要重写 SQL。
2. `clearPendingManualRecovery` 必须传入 `{ userCommandId }`，缺失时抛错，以此实现 I5。
3. 把 director 目录中 `state/` 以外的 64 处任务状态写入逐个替换为调用 Writer。可以按目录分批提交，每批同步下调基线。
4. 补 I5 测试。

**3C 任务状态只有一个解析入口**

1. 扩展 `state/DirectorStateReader.ts`，提供 `readDirectorTaskState(row)`，返回 `{ launch, run }` 两部分：
   - `launch`（启动合同，只读）：`directorInput`、`runMode`、`autoExecutionPlan`、`autoApproval`、`issueGovernanceVersion`、`issuePolicy`、`issuePolicySource`、`completionProfile`、`startupPreparation`、`provider`、`model`、`temperature`、`creativeCarryoverContract`。
   - `run`（运行状态）：`directorSession`、`autoExecution`、`taskNotice`、`stepReview`、`candidateStage`、`batches`、`candidate`、`productionExperience`；恢复位置以任务表的 `resumeTargetJson` 列为准，seed 里的 `resumeTarget` 只作兼容读取。
   - `directorRuntime` 字段已废弃：只读不写。
2. 数据仍存放在 `seedPayloadJson`，本阶段不改 schema。
3. Writer 只允许在任务启动边界写入 `launch`：新建小说任务、书级候选确认（把尚未关联小说的候选任务定稿为真实开书合同）和接管替换。候选确认仅能对 `auto_director + novelId 为空` 的任务整体建立最终合同；普通运行态更新只接受 `run` 字段并原样保留已建立的 `launch`，即使扁平兼容视图包含临时运行模式或输入覆盖，也不得将其写回启动合同。候选阶段快照缺失的类型化字段可在首次定稿时补齐，已存在字段必须一致；未分类的 `legacyContext` 只作兼容载荷，不作为 I6 合同字段。接管替换仍须整体替换合同。以此实现 I6 且保留候选确认原有的整本自动驾驶模式。
4. 把 director 目录中 `state/` 以外的 292 处 `seedPayload` 引用改为使用 Reader 或 Writer。
5. 补 I6 测试。

**禁止：** 不改 schema；不改任何业务判断结果，只改“从哪里读、经谁写”。

#### 阶段三完整独立验收与返工要求（2026-09-29）

**当次结论：未通过，需要返工。** 被验收提交为 `6f72603e`（3C 实现 `6d06276c`）；本记录补充并修正此前 3B、3C 的通过结论，历史台账保留用于追溯。完整证据、改造成果、测试调整清单和失败身份见 [阶段三独立验收报告](../reports/auto-director-stage3-acceptance-2026-09-29.md)。2026-09-30 返工后的自动化复验结果见第 7 节台账和[返工记录](../reports/auto-director-stage3-rework-2026-09-29.md)；独立代码审阅尚未执行。

- **已完成的结构改造：** 核心读路径移除修复，Worker 初扫及周期对账；多数状态写入归 Writer；Reader 区分启动合同与运行态，恢复位置以任务列为准，废弃运行时字段不写回。三个守卫指标均计为 0，但存在守卫未覆盖的语义缺陷及一处等价别名降数。
- **必须修复的回退：** 候选确认在创建/关联小说后再次初始化，因最终输入不同而失败；自动执行进度同步误走初始化，模式转换时触发合同冲突；步骤模块只取启动输入，丢失运行态校准指令与有效模式；部分更新误清恢复列；接管嵌套替换标记与跟进/通知旧读取位置不匹配。
- **必须补齐的边界：** 新增单条/批量运行态写入口绕过人工锁检查；一般命令接受更新为 0 仍返回 accepted；候选检查点、重试和模型覆盖的间接写入尚未归 Writer；已关联小说仍允许补启动字段，接管替换实际合并旧字段。补事实对账成功日志。
- **R3 / S2 返工：** `seedPayloadMode` 改为同义 `directorTaskDataMode` 仅消除一处计数，需恢复统计或完成真实读取收敛；恢复命令测试中的旧模式转换场景，保留恢复测试的小说身份断言。使用真实 builder 和完整确认链补回归，不降低守卫阈值或放宽原断言。返工按独立边界小批次提交。
- **完整测试证据：** 先分别重新编译，再用新建隔离 SQLite 库及 103 个 migration SQL 同环境对照 `d3a9ca99`。显式 `NODE_ENV=test`、`RAG_ENABLED=false` 下，fast 基点 1,393/1,341 通过/40 失败/12 跳过，当前 1,450/1,398/40/12；integration 两侧均 144/132/10/2。按文件和测试名称比较，新增失败：无、已修复基点失败：无。Guard 12/12、全仓 typecheck 和 shared/server 编译通过。此前 37 项 fast 失败与本次 40 项的预加载环境差异在报告中逐项说明，不能混写。首次当前 fast 的文件加载异常经定向及完整复跑未再出现，保留原始记录。
- **范围：** 本次只做验收和文档记录，没有修改业务代码、测试、守卫或 schema；既有 60 秒对账窗口沿用人工批准。本次属于内部验收，跳过发布说明及 README；wiki 正确的长期规则保持有效。

#### 阶段 2、3A 复核与 3B 中期检查（2026-09-27）

测试结论：已提交代码加 3B 未提交改动，按“文件 + 测试名称”隔离对比阶段 1 终点 `6013eb31`，fast（34 项）、集成（6 项）、客户端（6 项）失败清单完全相同，类型检查通过。下列问题都是测试覆盖不到的代码层问题。

**执行顺序：** 先单独提交 3A 返工（3A-1、3A-2），再补阶段 2 的三项（2-1、2-2、2-3），最后完成并提交 3B。

阶段 2 返工（必须）：

- **2-1 跟进中心仍按 URL 里的任务编号选任务（R3）。** 读取逻辑被移进守卫排除的 `client/src/lib/legacyTaskUrlParams.ts`（`readLegacyDirectorTaskId`），`AutoDirectorFollowUpCenterPage.tsx:152` 用它选任务；`DingTalkNotifier.ts:83`、`WeComNotifier.ts:71` 仍在生成新的 `follow-ups?directorTaskId=` 链接。修法：两个通知器改用 `?novelId=`；跟进中心只按 `novelId` 选择，旧参数只清理、不参与选择；`legacyTaskUrlParams.ts` 只保留 `stripLegacyTaskUrlParams`，候选链接的生成和读取函数移到 `novelRoutes.ts`。
- **2-2 服务端仍生成带 `directorTaskId` 的小说页链接（U1）。** 位置：`RecoveryTaskService.ts:44`、`FirstNovelOnboardingService.ts:159,180,194`、`CreationStudioService.ts:559`、`DirectorBookAutomationProjectionModel.ts` 的 `buildNovelHref`。前端虽然在打开后清理，但地址栏会先出现参数，新增的消费方也容易漏掉清理。修法：从源头去掉参数，并在 `novelRouteWithoutTaskId.test.js` 中逐个断言这些生成函数的输出。

- **2-3 恢复开书页的创作界面选择（2026-09-27 人工决定）。** `AutoDirectorCreatePage.tsx` 在任务已关联小说时立即跳转，页面上的“简易模式 / 专业模式”选择和候选交接界面（`StageCandidates.tsx`）因此无法到达，新手会被直接送进完整工作台。修法：任务已关联小说时，先显示这组选择；用户选定后，用 `replace` 跳到对应的书页地址（`/novels/:id/simple` 或 `/novels/:id/edit`，都不带任务编号）。页面布局和文案保持改造前的样子；这是方案第 1 节“开书前页面保留任务编号，书创建后跳到书的地址”的具体落法。补客户端测试，断言选择前不跳转、选择后跳到对应地址。

阶段 2 建议（写进报告，需要人工点验确认）：

- 跟进中心的选中项不再写进地址，刷新或后退后会丢失。
- 普通编辑工作流初始化不再把 `entry` / `stage` 合并进已有任务，属于 U5 范围内的行为差异，需在报告里注明。
- 4e29ffa4 误提交了 `.superpowers/sdd/…/task-3-report.md`，应取消跟踪。

3A 返工（必须）：

- **3A-1 `.bind` 规避守卫（R3）。** `NovelWorkflowService.ts:35` 把会被计数的转发方法改成了 `readonly healAutoDirectorTaskState = ….bind(…)`，功能不变，只是让守卫正则匹配不到。修法：从 `NovelWorkflowService` 删除这个入口，`workers/directorTaskHealingSweep.ts` 直接创建 `NovelWorkflowHealingService` 调用。
- **3A-2 Worker 扫描绕过人工暂停保护。** `directorTaskHealingSweep.ts` 只传任务编号，`healAutoDirectorTaskState` 开头的“已请求取消 / 等待人工恢复就跳过”两道判断只检查传入的任务行，传空即失效。`healStaleAutoDirectorQueuedProgress` 自己不检查 `pendingManualRecovery`，会把“排队中 + 等待人工恢复”的任务改成 `running`，违反 AGENTS.md 的人工暂停规则。3A 之前读取路径会传入任务行，所以这是 3A 引入的问题。修法：`healAutoDirectorTaskState` 在没有传入任务行时，先读取任务行再做两道判断，保证任何调用方都受保护。回归测试写进 `directorManualRecoveryLock.test.js`：任务为 `queued`、`pendingManualRecovery=true`、当前项不是排队项，扫描后五列不变；`failed` 且带锁的任务经过历史失败修复后锁仍在。
- **3A-3 S4 行为窗口（2026-09-27 人工批准接受）。** 用户动作不再先修复后，在“步骤事实已进入审批或失败、任务行仍为 `running`”的窗口内（最长约 60 秒），跟进动作会返回 `forbidden`。用户决定接受这个窗口，不在用户命令里补做同步；阶段 4 让检查点自带可选动作后，这个窗口应随之消失，阶段 4 验收时确认。以后遇到 S4 仍须先停下等待决定，不能先合入。

3A 建议：

- 报告补齐 10 个修复例程的分类、改过的测试（`autoDirectorFollowUpActionExecutor.test.js:948`）以及失去“先修复”的命令路径清单。
- 台账“读操作保持纯读”说得过满：带 `workflowTaskId` 的 `GET /workspace-analysis/:novelId`、`GET /manual-edit-impact/:novelId` 仍会写运行时快照，这是既有问题，登记为遗留。
- 扫描不按状态过滤，会全量扫描所有导演任务；`tasks.ts` 仍在传已经无效的 `heal` 参数。

3B 中期检查（未提交，不做通过判定）：

- `directorTaskWritesOutsideState` 63 → 0，下降真实，没有发现通过别名、中括号取方法名或解构绕过守卫。
- 完成前必须处理：
  - I5 测试只覆盖写入器本身，要补齐 Worker 恢复、后台扫描、命令接受三类场景，并包含 3A-2 的回归。
  - `markCompleted`、`markCancelled`、`markPendingManualRecovery` 只是原样转发给 `updateRunState`，并且没有调用方。要么补上实际语义并替换现有写入（`requeueTaskForRecovery` 5 处、`cancelTask` 2 处、`novelDirectorTakeoverExecution.ts:474` 的 `markTaskFailed?.(`），要么删掉这三个方法。
  - `enqueueExecutionCommand` 默认清除人工恢复锁，改为默认保留、由用户命令显式清除。
  - `resumePendingAutoDirectorTasks` 没有生产调用方，为它新增的后台恢复链路要么删掉，要么在报告里说明保留理由。
  - 报告说明编排器 `markTaskRunning` → `markRunning` 改名带来的 6 处下降，以及 `directorSeedPayloadRefs` 因端口类型收窄附带下降的 6 处。
  - 阶段 1 留给 3B 的两项：非 `continue_existing` 接管重复提交返回 409；建任务字段组装重复。

#### 阶段 3B 验收记录（2026-09-28）

- **结论：阶段 3B 代码验收通过，直接基点对比缺口已关闭。** `DirectorTaskStateWriter` 成为导演任务状态写入门面；命令创建与任务接受/人工恢复锁清除在同一事务中提交。I5 覆盖写入器、命令接受、命令租约恢复、启动恢复和 3A-2 后台扫描保护。人工恢复锁只由带持久命令编号的用户恢复命令清除；一般状态写入也拒绝 Prisma `{ set: false }` 形式。带锁任务恢复时仅复用仍处于 `queued` 的命令；若先前命令已 `leased` 或 `running`，会为恢复请求创建独立的排队命令，避免旧 Worker 在恢复事务后结束时吞掉恢复请求。未锁定任务已有活动命令时继续复用，不重置其运行状态。
- **中期检查项已关闭：** `markCompleted`、`markCancelled`、`markPendingManualRecovery` 分别承担完成检查点、取消任务、转人工恢复队列语义并有调用方；移除了无生产调用方的 `resumePendingAutoDirectorTasks` 后台自动恢复链；接管命令在策略与规范化请求负载相同时复用；`startDirectorTaskForNovel` 与 `createWorkflow` 共用 `workflow/taskCreation` 字段组装。
- **指标：** `directorTaskWritesOutsideState` 63 → 0；`directorSeedPayloadRefs` 291 → 285。状态写入指标中有 6 处因把编排器 `markTaskRunning` 调用迁到语义门面 `markRunning` 而下降；seed 引用伴随下降的 6 处来自收窄 Writer 端口类型，不是排除守卫目录或改写指标。
- **直接基点复验：** 在 `d3a9ca992133895f9ff97dd28a3dc73388ff37be` 与当前分支分别使用新建的隔离 SQLite 库，按现有 103 个 SQLite migration SQL 初始化；没有访问或修改开发数据库，测试清理钩子保留全部隔离库。基点缺少本地 `.env`，为保证配置一致，基点测试通过 `DOTENV_CONFIG_PATH` 加载当前工作区配置（其中 `RAG_ENABLED=false`）。完整 fast：基点 1,393 项（1,344 通过、37 失败、12 跳过），当前 1,435 项（1,386 通过、37 失败、12 跳过）；按 JUnit `文件 + 测试名称` 比较，新增失败 0、已修复基点失败 0。完整 integration：基点和当前均为 144 项（132 通过、10 失败、2 跳过），失败身份完全一致，新增失败 0。完整报告分别为基点 `D:/code/ai-baseline-d3a9ca99/server/.tmp/stage3b-d3a9-fast-sameenv-full.xml`、`D:/code/ai-baseline-d3a9ca99/server/.tmp/stage3b-d3a9-integration-sameenv.xml`，以及当前 `server/.tmp/stage3b-fast-isolated-comparison.xml`、`server/.tmp/stage3b-integration-isolated-comparison.xml`。
- **本机环境差异说明：** 本次同环境直接对照的 fast 比方案记录的历史 34 项多 3 项，且三项都在基点和当前复现：`novelDirectorConfirmDedup.test.js` 缺少 DeepSeek 配置；`routes.test.js` 的小说书籍 framing 用例缺少模型配置；RAG 重建队列用例在本机 `RAG_ENABLED=false` 下预期应与实际关闭状态冲突。RAG 服务和路由在基点至当前之间无源码改动。integration 比方案记录的历史 6 项多 4 项，均为 Windows Prisma/`pnpm.cmd` 启动问题，集中在 `ragCompatibilityBootstrap.test.js`；10 项完整失败清单见下文。报告按本机同环境失败身份对比，没有把环境差异折算为新增失败。
- **测试数量说明：** 相对直接分支基点，当前 fast 累计多 42 项；相对 3A 验收快照多 16 项，其中 4 项为阶段 2 路由测试、12 项为阶段 3B 测试。`taskRecoveryRoutes.test.js` 的一项既有用例调整断言目标以匹配显式恢复命令，未放宽行为要求。integration 比 3A 快照少 4 项，是移除无生产调用方后台恢复链时同步删除的测试。
- **基点验收结论：** 4.2 要求的完整 fast 与 integration 直接对照均已完成，失败清单逐项一致，新增失败：无。此前置阶段回归对比仅作补充，不再作为直接基点对比的替代。阶段 3B 完整验收通过，可以进入阶段 4 的动作表确认；阶段 4 实现仍须在用户确认 S4 动作表后开始。
- **修改既有测试的原因（符合 4.3，原有行为断言未放宽）：**
  - `directorRunCommandService.test.js`：测试替身改接事务化工作流端口和语义状态写入器；保留原命令行为断言，并增加人工恢复锁、排队/运行命令交错和事务回滚断言。
  - `novelDirectorConfirmDedup.test.js`：状态入口迁到语义门面后，把替身从旧方法名改为 `markRunning`；原有去重行为和调用结果断言不变。
  - `novelWorkflowRuntime.test.js`：移除已删除且无生产调用方的后台自动恢复链测试，改为验证启动时锁定中断任务且不自动排队；对手动恢复语义的断言保持严格。
  - `taskRecoveryRoutes.test.js`：恢复路由已提交显式恢复命令，不再直接调用被移除的后台继续入口；调整既有用例的断言对象，但仍断言请求接受结果和恢复命令语义，没有放宽行为断言。
- **历史验收环境 fast 失败清单（34 项）：**
  - `autoDirectorAutoApprovalAudit.test.js`：`auto director auto-approval audit loads the latest 10 records per novel`。
  - `bookAnalysis.test.js`：`NovelExportService exports generated chapters as a knowledge document for diagnosis`；`NovelReferenceService formats structured timeline nodes by phase`。
  - `bookAnalysisCharacterCandidate.test.js`：`identifyCharacterCandidates dedupes candidates and keeps generated rows intact`；`generateCharacterProfile transitions candidate to generated with arcs and scenes`；`generateAllCandidates skips generated rows and processes failed candidates`；`legacy generateCharacters identifies then generates profiles`。
  - `chapterArtifactInfluence.test.js`：`artifact delta only applies accepted influence proposals that are active in this chapter`；`artifact delta expires accepted influence proposals once their window has passed`。
  - `chapterStructuredOutputNormalization.test.js`：`character resource extraction schemas cap resource deltas at eight items`。
  - `characterMind.test.js`：`character mind persistence archives the old current snapshot before creating a replacement`。
  - `characterVisibleProfile.test.js`：`chapter character context includes compact visible profile summary`。
  - `directorDirectoryBoundary.test.js`：`director root stays limited to compatibility facades`。
  - `directorDisplayStateBuilder.test.js`：`display state maps chapter draft execution into chapter stage and uses fact progress`；`display state keeps running mode when task is running despite stale approval projection`。
  - `novelContinuationReferenceHardening.test.js`：Node test runner以该测试文件绝对路径作为失败名称。
  - `novelDirectorCharacterGate.test.js`：`director character phase applies an existing draft cast option without regenerating`。
  - `novelDirectorStageNodeAdapters.test.js`：`director planning stages expose standard node adapter contracts`。
  - `novelDirectorStructuredOutlinePersistence.test.js`：`runDirectorStructuredOutlinePhase persists chapter detail after each completed chapter`；`runDirectorStructuredOutlinePhase resumes from the next incomplete chapter`。
  - `novelDirectorTakeoverExecution.test.js`：`continue_existing chapter takeover does not reuse the requested auto execution range`。
  - `novelExportService.test.js`：`buildExportContent uses novel title plus timestamp as export filename`。
  - `novelPlanningService.test.js`：Node test runner以该测试文件绝对路径作为失败名称。
  - `artifactCheckpoint.test.js`：`checkpoint: active running claim does not start another extraction`。
  - `novelWorkflowContinue.test.js`：`novel workflow continue route accepts range and full-book continuation modes`。
  - `novelWorldModelSelection.test.js`：`novel theme world prompt stays within a one-shot JSON budget`。
  - `payoffLedgerShared.test.js`：`buildPayoffLedgerResponse orders items by risk and computes summary counts`。
  - `ragContextualChunk.test.js`、`ragJobListing.test.js`：Node test runner以各自测试文件绝对路径作为失败名称。
  - `ragRetrievalTrace.test.js`：`RagRetrievalTracer writes sampled trace summaries without chunk text`。
  - `style-engine.test.js`：`StyleRewriteService includes preview anti-ai rules in the repair prompt`。
  - `styleGenerationSanitizer.test.js`：`sanitizeStyleContextForGeneration redacts source entities before writer context`。
  - `tools.test.js`：`agent tool definitions keep zod declarations in dedicated schema modules`。
  - `worldContextGateway.test.js`：`gateway delegates novel theme world generation through novel world service`。
- **本机同环境 direct 基点与当前共同的 fast 失败清单（37 项）：**
  - `autoDirectorAutoApprovalAudit.test.js`：`auto director auto-approval audit loads the latest 10 records per novel`。
  - `bookAnalysis.test.js`：`NovelExportService exports generated chapters as a knowledge document for diagnosis`；`NovelReferenceService formats structured timeline nodes by phase`。
  - `bookAnalysisCharacterCandidate.test.js`：`identifyCharacterCandidates dedupes candidates and keeps generated rows intact`；`generateCharacterProfile transitions candidate to generated with arcs and scenes`；`generateAllCandidates skips generated rows and processes failed candidates`；`legacy generateCharacters identifies then generates profiles`。
  - `chapterArtifactInfluence.test.js`：`artifact delta only applies accepted influence proposals that are active in this chapter`；`artifact delta expires accepted influence proposals once their window has passed`。
  - `chapterStructuredOutputNormalization.test.js`：`character resource extraction schemas cap resource deltas at eight items`。
  - `characterMind.test.js`：`character mind persistence archives the old current snapshot before creating a replacement`。
  - `characterVisibleProfile.test.js`：`chapter character context includes compact visible profile summary`。
  - `directorDirectoryBoundary.test.js`：`director root stays limited to compatibility facades`。
  - `directorDisplayStateBuilder.test.js`：`display state maps chapter draft execution into chapter stage and uses fact progress`；`display state keeps running mode when task is running despite stale approval projection`。
  - `novelContinuationReferenceHardening.test.js`、`novelPlanningService.test.js`、`ragContextualChunk.test.js`、`ragJobListing.test.js`：Node test runner 以测试文件本身报告失败，详见 JUnit 文件级错误。
  - `novelDirectorCharacterGate.test.js`：`director character phase applies an existing draft cast option without regenerating`。
  - `novelDirectorConfirmDedup.test.js`：`confirm runtime creates the novel through the standard runtime node`。
  - `novelDirectorStageNodeAdapters.test.js`：`director planning stages expose standard node adapter contracts`。
  - `novelDirectorStructuredOutlinePersistence.test.js`：`runDirectorStructuredOutlinePhase persists chapter detail after each completed chapter`；`runDirectorStructuredOutlinePhase resumes from the next incomplete chapter`。
  - `novelDirectorTakeoverExecution.test.js`：`continue_existing chapter takeover does not reuse the requested auto execution range`。
  - `novelExportService.test.js`：`buildExportContent uses novel title plus timestamp as export filename`。
  - `artifactCheckpoint.test.js`：`checkpoint: active running claim does not start another extraction`。
  - `novelWorkflowContinue.test.js`：`novel workflow continue route accepts range and full-book continuation modes`。
  - `novelWorldModelSelection.test.js`：`novel theme world prompt stays within a one-shot JSON budget`。
  - `payoffLedgerShared.test.js`：`buildPayoffLedgerResponse orders items by risk and computes summary counts`。
  - `ragRetrievalTrace.test.js`：`RagRetrievalTracer writes sampled trace summaries without chunk text`。
  - `routes.test.js`：`PUT /api/settings/rag saves extended settings and auto-enqueues reindex`；`novel routes preserve book framing fields through create-get-update cycle`。
  - `style-engine.test.js`：`StyleRewriteService includes preview anti-ai rules in the repair prompt`。
  - `styleGenerationSanitizer.test.js`：`sanitizeStyleContextForGeneration redacts source entities before writer context`。
  - `tools.test.js`：`agent tool definitions keep zod declarations in dedicated schema modules`。
  - `worldContextGateway.test.js`：`gateway delegates novel theme world generation through novel world service`。

- **本机同环境 direct 基点与当前共同的 integration 失败清单（10 项）：**
  - `p0bRealPrismaChain.test.js`：`legacy project migration feeds shared review context through manual audit on a real sqlite chain`；`volume workspace projects feed the same shared review context through manual audit on a real sqlite chain`；`persisted volume strategy resumes auto director into structured outline on a real sqlite chain`。
  - `prompting-governance.test.js`：`prompt governance keeps inline SystemMessage/HumanMessage builders in the approved set`。
  - `prompting.test.js`：`prompt registry exposes versioned planning assets`；`character cast prompt hardens real-name constraints and required gender output`。
  - `ragCompatibilityBootstrap.test.js`：`legacy RAG env bootstrap preserves the historical default collection when legacy knowledge exists`；`legacy provider-specific embedding env is imported when generic embedding env is absent`；`packaged desktop restores the legacy forced RAG pause only when no user runtime settings exist`；`packaged desktop preserves a user-saved RAG pause`。
- **Wiki 与发布说明：** 人工恢复锁边界已经记录在自动导演运行时 wiki；本次只补直接基点的验收证据，没有新增长期规则，不另改 wiki。阶段属于纯内部架构和测试改动，跳过 release notes 与 README 最新更新。

### 阶段 4：检查点自带可选动作

**依赖：** 阶段 3 完成。

**目标：** 实现 U3。暂停时有哪些按钮、每个按钮做什么，由服务端的一张表决定，替代现在“继续模式 × 检查点类型 × 状态 × 布尔开关”的交叉判断。

**完成标准：** I7 测试通过；`continuationModeRefs = 0`；删除 `novelDirectorContinueRuntime.ts` 中用 `currentStage?.includes("质量")` 判断状态的代码。

**步骤：**

1. **先填表、后写代码。** 执行者读现有前端各界面、书级投影和 `novelDirectorContinueRuntime.continueTask`，填写下表并提交人工确认（这是 S4 类决策点，确认前不写实现）。下表已按当前代码核对，仍是待人工批准的方案：

   | 检查点 / 状态 | 可选动作（主动作在前） | 对应现有行为与边界 |
   | --- | --- | --- |
   | `pendingManualRecovery = true`（优先于检查点） | `resume_from_saved_chapter`（从保存进度继续） | 现有“继续自动导演”；恢复意图必须显式确认并清除人工恢复锁。此状态下不显示检查点的继续动作。 |
   | `candidate_selection_required` / 等待确认 | `open_candidate_selection`（去确认书级方向） | 导航到候选页；候选选择和确认仍由候选页处理，不经 `resolve_checkpoint`。 |
   | `book_contract_ready` / 等待审核 | `open_book_contract`（查看书级创作约定）、`approve_and_continue`（确认并继续） | 导航到 `story_macro` 审核页；继续沿用现有 `resume` / gate approval 语义。 |
   | `character_setup_required` / 等待审核 | `open_character_setup`（查看角色准备）、`approve_and_continue`（确认并继续） | 导航到角色页；继续沿用现有 `resume` / gate approval 语义。 |
   | `volume_strategy_ready` / 等待审核 | `open_volume_strategy`（查看卷战略）、`approve_and_continue`（确认并继续） | 导航到 `outline` 审核页；继续沿用现有 `resume` / gate approval 语义。 |
   | `production_experience_required` | `choose_simple`（使用阅读书架）、`choose_professional`（使用完整工作台） | 调用现有生产方式选择接口；它会保存选择并开始全书生产，不由 `resolve_checkpoint` 代替。 |
   | `step_review_required` / 等待审核 | `validate_step`（AI 检查）、`improve_step`（AI 完善）、`regenerate_step`（重新生成）、`open_review_stage`（查看审核阶段，存在审核范围时）、`accept_and_continue`（确认并继续） | 三种校准继续使用现有 `calibrate_step` 命令；后两种可编辑动作需要步骤编号，完善 / 重生成可带用户指令。“保存并确认”和“继续自动导演”当前调用同一操作，表中合并为一个动作。只有最终确认动作进入 `resolve_checkpoint`。 |
   | `chapter_batch_ready` / 等待继续 | `continue_chapters`（继续自动执行章节）、`open_chapter_execution`（进入章节执行） | 延续 `auto_execute_range` 和现有章节导航。 |
   | `chapter_batch_ready` / 失败或取消 | `continue_chapters`（从当前范围继续）、`open_quality_repair`（查看质量修复）、`open_chapter_execution`（进入章节执行） | 保留小说页现有恢复与质量修复入口；`pendingManualRecovery` 为真时由上一行覆盖。 |
   | `replan_required` / 等待、失败或取消 | `replan_then_continue`（重规划后继续）、`open_quality_repair`（查看质量修复） | 保留当前重规划恢复及质量修复导航。此检查点表示必须处理整书计划，不把 `skip_quality_repair` 作为绕过重规划的动作；本地质量债的延后规则由结构化质量决策决定。 |
   | `workflow_completed` | `open_chapter_execution`（进入章节执行） | 现有章节执行导航，不触发自动导演恢复命令。 |
   | 失败且无检查点、无人工恢复锁 | `retry_from_checkpoint`（从最近进度恢复） | 对应驾驶舱的“从最近进度恢复”；仅在失败恢复入口判定可用时提供。任务中心仍只负责查看记录和返回来源页。 |
   | `rewrite_snapshot_created` | 不适用 | 它是 `NovelWorkflowMilestoneType` 的里程碑，不属于 `NovelWorkflowCheckpoint`，不能出现在检查点动作表中。 |

   **动作来源边界：** `availableActions` 覆盖书页、书架、驾驶舱等来源工作区中的检查点级按钮，包括导航、现有领域命令和检查点恢复命令；任务中心保持只读。取消任务、修复章节标题、补齐导演产物等不由检查点决定的独立操作继续走各自既有入口，不混入检查点表。动作描述需要区分 `resolve_checkpoint` 恢复动作、导航动作和已有领域命令；只有恢复动作使用 `expectedCheckpointType` 做过期检查。步骤校准需要的步骤编号 / 用户指令等上下文随相应领域命令提交。

   **质量策略约束：** 本动作表不能把 `pause_for_manual` 自动改成继续，也不能绕过 `stop_for_replan` / `replan_required`。本地可延后的质量问题仍按统一 issue decision 记录质量债并继续；任何继续动作必须保留当前快照选定的质量策略。

2. 在 `shared/types/` 新增检查点动作表和类型。动作编号是封闭集合；每个动作包含 `id`、`label`、`description`、`primary` 和 `kind`（恢复、导航或现有领域命令），按需携带稳定目标或领域输入定义。
3. 服务端生成投影时附带 `availableActions`，所有书级投影使用同一个函数生成；按表中的状态和安全前置条件过滤动作，不在前端复制检查点 / 状态决策。
4. 新增命令类型 `resolve_checkpoint { actionId, expectedCheckpointType }`：检查点已变化时返回 409 和“任务状态已变化，请刷新后再操作”；`actionId` 不在当前检查点的动作表中时返回 400。
5. 在 `commands/` 中用一个函数把恢复类 `actionId` 映射为显式的恢复意图，例如 `{ kind: "approve_current_gate" }`、`{ kind: "resume_from_saved_chapter", chapterId }`、`{ kind: "replan_then_continue", anchorChapterId }`、`{ kind: "continue_chapter_range", chapterId }`。`continueTask` 的入口只接收恢复意图，不再接收 `continuationMode`、`forceResume`、`acceptManualChanges`、`approveCurrentGate` 等散落参数。下游如果仍需要这些布尔值，只能由一个 `intentToExecutionOptions(intent)` 函数统一推导；不得新增绕过质量策略的恢复意图。
6. 旧接口 `POST /:id/continue` 保留一个版本周期，参数经 `commands/legacyContinuationAdapter.ts` 转换为 `actionId`。这是唯一允许出现 `continuationMode` 的服务端文件，守卫已排除。
7. 前端所有检查点级暂停按钮都从 `availableActions` 渲染，不再按 `checkpointType` 自行决定按钮；不同 `kind` 分别导航、调用现有领域命令或提交 `resolve_checkpoint`。检查点之外的任务生命周期 / 局部修复操作不属于此表。
8. 补 I7 测试：每种检查点类型在表中都有条目；每个动作只映射一种恢复意图；检查点过期时返回 409；书级投影、书架、驾驶舱的 `availableActions` 相同。

**禁止：** 不新增动作语义。表中的每个动作都必须对应一个现有行为。

### 阶段 5：只保留一个执行循环

**依赖：** 阶段 4 完成。

**目标：** 删掉“流水线 → 编排器 → 步骤模块 → 步骤运行时 → 流水线”的循环调用和进程内伪后台，只保留“步骤计划 + 一个循环”。

**完成标准：** I8 测试通过；`inProcessBackgroundScheduling`、`runModeBranches`、`stepRuntimeServiceLocator` 均为 0；现有 integration 测试（`novelDirectorPipelineRuntime`、`directorWorkflowStepModules`、`p0bRealPrismaChain`、`novelDirectorRetry`、`directorTaskFactInspection`）全部通过。

按 5A → 5D 分四个子阶段提交。

**5A 去掉进程内伪后台**

对 13 处 `scheduleBackgroundRun` / `setImmediate`，逐一确认调用链起点，并在报告中列表：

- 起点是 `DirectorCommandExecutor`（已在 Worker 中）：改为直接 `await`。
- 起点是 HTTP 路由：改为入队命令，由 Worker 执行。可以使用现有命令类型；需要新命令类型时，触发 S4。

**5B 收敛运行模式**

新增 `server/src/services/novel/director/runtime/directorRunContract.ts`，提供 `resolveDirectorRunContract(launch)`，返回：

- `planEnd`：`"ready" | "execution" | "full_book"`
- `pausePolicy`：`"gates" | "each_step"`
- `autoApproveSafeScope`：`boolean`

把 director 中其余 45 处运行模式判断改为读取这个契约。这是唯一允许直接判断 `runMode` 的文件，守卫已排除。

**5C 单一执行循环**

1. 新增 `runtime/DirectorPlanExecutor.ts`，使用已经存在但未被主流水线使用的 `buildDirectorPlanningWorkflowPlan`，加上章节执行步骤。循环语义：步骤已完成则跳过；否则执行；步骤要求暂停，或 `pausePolicy = each_step`，就写检查点并返回。
2. 删除 `NovelDirectorPipelineRuntime.runPipeline` 中写死的 `if (phase === ...)` 链，改为调用执行器。
3. 把 `executeStoryMacroStep` 等步骤实现移到 `phases/` 下对应的阶段文件，改为显式传入依赖的函数；步骤模块直接调用阶段函数。
4. 删除 `getDirectorCoreStepRuntime` 和 `DirectorCoreStepModuleRuntime` 中第二套对象装配。新增唯一的装配入口 `runtime/directorCompositionRoot.ts`，供 `NovelDirectorService` 和 Worker 共用。
5. `novelDirectorPipelineRuntime.ts` 如果被删除，同步从 `directorDirectoryBoundary.test.js` 的根目录清单中移除（只允许删减）。
6. 补 I8 测试：用假步骤模块验证跳过、暂停、逐步暂停、从第一个未完成步骤恢复。

**5D LangGraph 实验代码**

确认 `langgraphPilot/DirectorLangGraphPilot.ts` 是否在生产路径中通过配置启用。未启用则删除；已启用或无法确定，触发 S4。

**禁止：** 不改步骤内部的生成逻辑、提示词或质量判断；不改章节流水线 `startPipelineJob` / `resumePipelineJob` 的内部实现。

### 阶段 6：只保留一个展示模型

**依赖：** 阶段 4 完成（需要 `availableActions`）。

**目标：** 主状态、主进度、主按钮只由 `buildDirectorDashboardView` 决定，前端只负责展示。

**完成标准：** I9 测试通过；`clientStatusDerivation = 0`（守卫已排除 `client/src/api/` 和 `client/src/pages/tasks/`）。

**步骤：**

1. 服务端：`DirectorBookAutomationProjectionModel.buildDisplayState` 和 `DirectorDisplayStateBuilder.buildDirectorDisplayState` 改为 `buildDirectorDashboardView` 的内部输入，或者删除。所有书级接口（`book-automation`、简易书架、阶段 2 的 `current`）返回同一函数生成的 `dashboardView`。
2. 前端：`NovelEdit.tsx`、`novelWorkflowTaskUi.ts`、`novelEditTakeover.shared.ts`、`novelEditAutomationStatus.ts` 等文件中根据 `pendingManualRecovery`、`checkpointType`、`waiting_approval` 推断状态的代码，全部改为读取 `dashboardView` 的 `mode`、`headline`、`progress`、`availableActions`。
3. 补 I9 测试。

**禁止：** 不改展示文案和布局。如果现有界面之间文案不一致，以 `dashboardView` 的结果为准，并在报告中列出变化，供人工确认。

### 阶段 7：兼容代码清理（需要人工批准）

**前置条件：** 阶段 1～6 已在 `beta` 上稳定运行一个发布周期；人工明确批准；按 `AGENTS.md` 完成数据库备份并核验备份文件。

1. 移除对旧运行时表的读取（当前 1 处，在 `novelDirectorRuntimeProjection.ts`）。是否删表单独决策，并走 schema 迁移流程。
2. 把 3A 中标为“历史数据修复”的例程改为一次性脚本：默认只打印要修改的内容，显式加参数才写入；由人执行，之后从周期修复中删除这些例程。
3. 是否保留没有 `issueGovernanceVersion` 的旧任务兼容路径、旧风险评估字段、`POST /:id/continue` 旧接口，由人决定。
4. 改写 `docs/wiki/workflows/auto-director-runtime.md`：以第 3 节不变量为主体，删除已经被结构消除的“X 优先于 Y”类规则，保留仍然成立的失败模式和诊断路径。

---

## 7. 状态台账

每个阶段结束时追加一行。人工批准的例外（R1、R2、S1～S6）也记录在这里。

| 日期 | 阶段 | 提交 | 指标变化 | 新增测试 | 遗留问题 / 批准记录 |
| --- | --- | --- | --- | --- | --- |
| 2026-09-24 | 0 | 与阶段 1 同批提交 | 建立基线（11 项） | `directorSimplificationGuard.test.js` | 阶段 1 分支基点：`feature/creative-carryover-contract` @ `d3a9ca992133895f9ff97dd28a3dc73388ff37be`；执行分支为 `refactor/director-simplification` |
| 2026-09-24 | 1 | `3e20bbef` + `6c4ff9f8` | `adHocCurrentTaskLookups` 16 → 0；`directorTaskWritesOutsideState` 64 → 63；`directorSeedPayloadRefs` 292 → 291 | `directorCurrentTaskResolution.test.js`、`directorCurrentTask.test.js` | 集成套件 134/146；10 项未通过的原因见阶段报告 |
| 2026-09-24 | 1 验收 | `2f0bdeb8` | 指标核验一致 | — | **未通过，需返工。** ① 接管时 `startTakeover` 的 `findLatestAutoDirectorTask` 恒为 null，丢失上一条任务的执行范围、运行模式、章节游标和检查点，属于行为回退（违反 U5）；② fast 套件相对基点新增 15 项失败（`directorBookAutomationProjection` 13 项、`novelWorkflowContinue` 第 19、70 行），原因是测试替身仍替换旧查询函数。集成套件与基点一致（6 项历史失败），类型检查通过，不变量测试 44/44 通过。 |
| 2026-09-27 | 1 复验 | `6013eb31` | 指标无变化 | `directorTakeoverPreviousTask.test.js`；`novelDirectorTakeover`、`directorCurrentTaskResolution` 各补 1 项 | **通过。** 按测试名称隔离对比：fast 套件当前分支与基点失败清单完全相同（各 34 项），集成套件完全相同（各 6 项），新增失败为 0；类型检查通过。遗留（不阻塞，放到阶段 3B 单一写入口时处理）：非 `continue_existing` 接管重复提交返回 409，不再复用已入队命令；`startDirectorTaskForNovel` 与 `createWorkflow` 的建任务字段组装重复。 |
| 2026-09-27 | 2 | `52818adf` + `d6172213` + `78bbcf00` + `4e29ffa4` + `8444ee27` | `clientUrlTaskIdParams` 34 → 0；其他指标不变 | `novelRouteWithoutTaskId.test.js`、`novelWorkflowCandidateSelectionRouting.test.js`、`simpleShelfCurrentDirectorTask.test.js`、`novelChapterRouteContracts.test.js`、`novelRoutes.test.mjs`、跟进任务选择状态测试 | **通过代码验收。** Guard 12/12；类型检查及客户端构建通过。客户端完整套件 216/222，6 项失败名称与基线完全一致。按仓库官方分组隔离运行并与阶段 2 起点 `6013eb31` 比较：fast 1,417/34 失败/12 跳过，对比基线 1,413/34/12；集成 146/10/2，与基线 146/10/2；两套失败的 `文件 + 测试名称` 清单完全一致，新增失败：无。当前 Windows 环境集成基线包含 4 项 `ragCompatibilityBootstrap.test.js` Prisma 引擎启动失败；阶段 2 起点已有同样失败。候选任务跳转、章节子路由清理、旧链接参数移除和 takeover 当前任务切换的人工验收待用户统一进行。 |
| 2026-09-27 | 3A | `9d2cf8a2` | `healOnReadCallSites` 9 → 0；其他指标不变 | `directorReadPathsArePure.test.js`、`directorWorker.test.js` | **通过独立代码验收。** Typecheck、server build 通过；定向 20/20、关联 37 通过/1 跳过；完整 fast 1,419/34 失败/12 跳过（基点 1,417/34/12），integration 147/10/2（基点 146/10/2），按文件和测试名称比较新增失败均为 0。读操作保持纯读，Worker 初扫先于领取并每 60 秒修复。遗留 S4 行为窗口：步骤事实先进入审批/失败而任务行仍为 `running` 时，跟进动作暂时返回 `forbidden`，直到 Worker 对账；阶段 4 的动作表验收需明确该窗口。纯内部改动，跳过发布说明。 |
| 2026-09-27 | 2、3A 复核 | `dc830e9b` + 3B 工作区 | 指标核验一致 | — | **测试层面无新增失败**（fast、集成、客户端失败清单与 `6013eb31` 完全相同）。**阶段 2 有条件通过**，需补 2-1（跟进中心按 URL 任务编号选任务，R3）、2-2（服务端仍生成带任务编号的小说页链接）、2-3（恢复开书页创作界面选择，人工决定）。**3A 未通过**，需返工 3A-1（`.bind` 规避守卫，R3）、3A-2（Worker 扫描绕过人工暂停保护）。**人工批准：** 3A-3 的 S4 行为窗口（最长约 60 秒）接受，阶段 4 验收时确认已消失。3B 未提交，中期检查结论见“阶段 2、3A 复核与 3B 中期检查”。 |
| 2026-09-27 | 3A 返工 | `a5d31fde` + `738ed3c0` | 无指标变化 | `directorManualRecoveryLock.test.js`；更新 `novelWorkflowCancellation.test.js`、`novelWorkflowRecoveryNormalization.test.js` 到修复器入口 | **通过。** 3A-1 删除 facade 的 `.bind` 转发并由 Worker 直接持有修复器；3A-2 在无行调用时先加载任务行，并在聚合与排队进度修复两层保护人工恢复锁。Guard 12/12、typecheck、server build 通过。完整 fast 失败 34 项、集成失败 10 项，与 `stage3a` 基线按“文件 + 测试名称”完全一致，新增失败：无；集成新增 1 项真实 SQLite 回归通过。纯内部改动，跳过发布说明。 |
| 2026-09-27 | 2-3 返工验收 | `c5f5847a` + `c5041786` | 指标与基线 fixture 不变；检查点判定共用一个语义入口 | `novelRoutes.test.mjs`、`autoDirectorWorkspaceUxContracts.test.js`；更新 `directorBookAutomationProjection.test.js`、`onboardingServices.test.js` | **代码验收通过，人工界面点验待用户完成。** 接管任务在 `production_experience_required` 时保留界面选择，用户选定后才进入 `/simple` 或 `/edit`；任务编号不进入小说页 URL。全仓 `pnpm typecheck` 通过；客户端 225/219/6，与客户端基线 210/204/6 的 6 个失败名称一致。Fast 当前 1,423/1,377/34/12，对照基线 1,413/1,367/34/12；integration 当前 148/136/10/2，对照基线 146/134/10/2；两套均按文件与测试名称比较，新增失败：无。测试保护钩子保留的 SQLite 路径记录在阶段报告；未删除数据。手工点验路径见阶段报告。该记录只补充代码验收，尚不宣告阶段 2 的人工验收完成。 |
| 2026-09-28 | 3B 验收 | `6452309b` | `directorTaskWritesOutsideState` 63 → 0；`directorSeedPayloadRefs` 291 → 285 | `directorTaskStateWriter.test.js`、`novelWorkflowTaskFactory.test.js`、命令服务中的恢复锁及命令完成竞态回归 | 与 `d3a9ca99` 同环境直接对照：fast 基点 1,393/37 失败/12 跳过，当前 1,435/37/12；integration 基点和当前均 144/10 失败/2 跳过。两套均按文件与测试名称比较，新增失败：无、已修复基点失败：无。隔离新库按 103 个 SQLite migration SQL 初始化；基点加载当前 `.env`，RAG 默认关闭；Windows integration 含 4 项既有 Prisma/`pnpm.cmd` 启动失败。阶段 3B 完整验收通过；纯内部改动，跳过发布说明。 |
| 2026-09-29 | 3C 验收 | `6d06276c` | `directorSeedPayloadRefs` 285 → 0；阶段 1～3 相关守卫指标保持 0 | `directorStateReader.test.js`、`directorTaskStateWriter.test.js`、`directorLaunchContractImmutable.test.js`、`novelDirectorConfirmLaunchContract.test.js`、`novelWorkflowBootstrapBody.test.js` 及相关调用方回归 | **通过。** Guard 12/12；全仓 `pnpm typecheck`、server build 通过；定向回归 60/60。隔离新库并按 103 个 SQLite migration SQL 初始化后，同环境对比 `d3a9ca99`：fast 当前 1,450/37 失败/12 跳过，基点 1,393/37/12；integration 当前与基点均 144/10/2。均按“文件 + 测试名称”比较，新增失败：无、已修复基点失败：无。运行态更新保留启动合同；候选确认与接管边界有回归覆盖。阶段 3C 完成；纯内部改动，跳过发布说明和 README 更新。 |
| 2026-09-29 | 3 完整独立验收 | 验收对象 `6f72603e` | 三项指标为 0；一处同义参数改名不满足 R3 | 本次不改测试；完整调用链和内存边界复现 | **未通过，需返工；修正此前 3B/3C 通过结论。** 确认创建后合同冲突、自动执行同步误初始化、校准请求丢失、部分更新清恢复目标、接管标记消费不兼容；另有 I5/I6 入口及间接写入缺口、命令接受竞态和 S2 测试覆盖缺口。新鲜 fast 基点 1,393/40 失败/12 跳过、当前 1,450/40/12；integration 均 144/10/2，失败身份一致，新增失败：无。Guard 12/12、typecheck、编译通过。完整成果和返工清单见 [独立验收报告](../reports/auto-director-stage3-acceptance-2026-09-29.md)；阶段四前置条件未满足。纯内部验收文档，跳过发布说明。 |
| 2026-09-30 | 3 返工自动化复验 | `fa27e018`、`efe98db5`、`6b84ef45`、`499c3984`、`abeb5158` | 阶段 1～3 守卫指标仍满足基线 | 完整确认链、章节执行有效模式、Writer 边界、命令并发、模型覆盖、候选/重试入口与事实对账回归 | **自动化复验通过，独立代码审阅尚未执行。** shared/server 编译、全仓 typecheck、Guard 12/12；隔离库完整 fast 当前 1,484/1,432 通过/40 失败/12 跳过，对照基点 1,393/1,341/40/12；integration 两侧均 144/132/10/2。按文件＋用例名比较新增失败：无，基点失败消失：无。详见[返工记录](../reports/auto-director-stage3-rework-2026-09-29.md)。阶段四人工动作表仍须单独确认；工作区中阶段四草稿不属于本次提交。 |
