# 自动导演新内核事实层边界

## Background

自动导演重构需要把运行合同、可变控制态、产物账本、质量债和事件序列从旧任务载荷中分离出来。若这些事实继续由不同服务各自解析和回写，恢复时无法判断哪些输入已经冻结、哪些进度可以前进，也无法保证同一本书只有一个活跃运行。

## Decision

### Agent 入口与历史计划

HTTP 冻结不能保护进程内工具调用。新导演启用时，应用层从 Agent 工具目录和 AI 规划上下文排除旧 Runtime 工具；工具注册表保留稳定执行包装，在执行前读取当前应用边界。这样已保存的计划和切换前缓存的工具定义也不能绕过切换。

拒绝使用 `CONFLICT`，避免执行器自动重试旧动作。来源导航只查询旧任务的小说归属，不解析 Seed、不协调旧状态、不追加旧命令，也不把旧请求转换成新生成授权。创作范围和恢复由小说导演台负责。相关装配及单进程策略约束见 `server/src/app/director/entry/README.md`。

新内核采用 `domain -> application ports -> infrastructure repositories` 的依赖方向。领域层只处理计划、控制态、停止信号和投影，不知道 Prisma、数据库时钟或随机 ID；应用层只定义事实访问端口；Prisma 实现集中在 `infrastructure/`。

持久化事实分成六张独立表：

- `DirectorNextRun` 保存不可变的 `RunContract` 快照。
- `DirectorNextRunControl` 保存版本化控制态和租约，并用部分唯一索引限制同一本书的活跃运行数为一。
- `DirectorNextArtifact` 以 `(novelId, type, scope, version)` 记录产物版本；`chapter_draft` 不因上游重算被自动标记失效。
- `DirectorNextQualityDebt` 只追加章节质量债。
- `DirectorNextEvent` 以 `(runId, seq)` 保存运行事件序列。
- `DirectorNextCommand` 预留幂等命令事实，与运行事件分开维护。

## Current Rule

控制态迁移必须在事务内读取当前版本，调用领域层 `applyEvent`，再用 `runId + expectedVersion` CAS 写回。版本冲突和非法迁移都向上抛出，仓储不得复制状态机判断。

事实读取由 `FactsLoader` 统一完成。它只按合同中的小说范围加载产物和质量债，按 Run 加载事件，并把结构化 `stop_signal` 与带 `signalSeq + commandId` 的 `stop_signal_cleared` 配对；不得从错误文本推断停止原因。`ProjectionService` 只能把已保存合同、控制态和事实交给领域 `project()`，计划版本缺失时直接报错，不能静默换用最新计划。

持久化产物状态只接受 `draft`、`confirmed`、`user_edited`、`stale`。未知状态必须产生类型化 `FactIntegrityError`，不能默认为已确认，否则异常记录会满足依赖并让生成步骤被跳过。停止信号解析异常也属于该类型。Worker 遇到这类错误立即记录 `data_integrity` 停止信号并进入安全暂停，不消耗模型重试预算，也不改写异常产物；仅相同的错误文本不能触发该分支。只读查询继续明确报错，不能把无法读取的台账伪造成有效进度。数据修复前显式恢复也不能绕过事实校验。

运行记录与可操作的 `DashboardView` 是不同读合同。`RecordProjection` 遇到类型化事实完整性错误或缺少保存的计划版本时，只读合同与控制态以保留诊断记录：显示真实的持久化状态、已有暂停原因和本书来源，进度明确标为不可读取，不提供命令。一个异常记录不能使其他正常记录消失。运行合同身份缺失、未知控制状态或其他未分类异常仍向上报错，不能制造小说归属或伪造恢复状态；当前态/详情投影和执行器继续严格拒绝异常事实，不因列表可显示而允许推进。

投影来源路由只由 `novelId` 生成，因此可以让书页恢复现场，却不能把 Run ID 或任务 ID 变成页面地址。查询接口连续读取前后，六张事实表的列值必须完全相同；需要改变状态的行为只能走命令服务。

命令幂等键由 `DirectorNextCommand` 作为唯一入口。打开 Run、控制态迁移和 handoff 都在同一事务中写入命令结果与事实；重放命令只返回已保存结果，不再次调用状态迁移。HTTP 层可以把领域版本冲突转换成 409，但不能在路由里自行重试或修改控制态。

执行器每次只推进一个领域动作。步骤开始先记录游标，步骤产物和用量事件落账后才推进 `step_finished`；在这两个边界之间进程崩溃时，下一次循环从产物事实重新计算，不依赖内存游标。守卫拒绝事件按 Run 永久记录，但计数只包含最近 `step_finished`、`stop_signal_cleared` 或 `gate_regeneration_requested` 之后的拒绝；成功阶段的历史拒绝不能耗尽另一个阶段的额度，进程重启不能重置当前序列。达到合同拒绝预算后写结构化人工恢复信号并暂停；保护作者内容的拒绝直接安全暂停，避免重复执行同一覆盖动作。

拒绝预算耗尽是执行保护结果，不是业务根因。`action_rejected` 保存原动作、结构化原因与诊断说明，停止事件同时保留对应原因。投影只读最近进度边界之后的原因，按结构化代码与保存的阶段名称解释阻塞；不能通过英文报错关键字匹配决定恢复路径。可审阅的受保护过期结果使用保存结果确认门恢复，具体事务边界见 [导演半自动确认与恢复边界](../workflows/director-next-assisted-gates.md)。

Worker 候选只包含 `queued`、`running`。`waiting_gate` 和暂停中的 Run 不会被后台重新领取；等待确认的小说不能阻挡其他小说的排队运行。领取使用数据库条件更新，心跳和到期时间由运行时注入；竞争失败的 Worker 放弃该 Run，租约释放或过期后才允许另一个 Worker 接手。异常次数按注入的策略快照计算；预算内只记录失败并等待接管，预算耗尽后写结构化人工恢复信号，后台不能清除暂停。

Worker 常驻循环必须隔离调度设施异常，按有上限的退避继续轮询；单个候选的归属或领取错误不能阻挡后面的小说。重复 start 共享同一循环，显式唤醒只中断退避等待，不能同时启动第二个循环；关闭服务撤销在途执行，普通唤醒不能复活关闭中的服务。

每次领取使用独立 owner。续约串行执行，Promise 拒绝和 false 都代表旧执行失去许可；独立到期计时防止悬挂的续约让模型请求无限运行。生产 Worker 经 infrastructure/execution 适配器注入取消作用域；LLM 请求合并 AbortSignal，Prisma 入口拒绝撤销后的业务操作，调用计费记录作为观察事实继续保存。取消前已提交的结果保留，已发出的数据库操作无法由信号撤回；事务中后续操作失败应回滚整个事务。正常收束也撤销遗留异步操作并按 owner 释放租约，迟到的旧心跳/释放不能影响下一次领取。

调度设施恢复与章节重生成预算分开。租约撤销不能写入另一个执行者的失败/暂停，也不能清除原有人工恢复锁。具体模块边界见 `application/execution/README.md` 与 `platform/runtime/execution/README.md`。

业务执行收束后，不等待悬挂的续约请求才释放租约；关闭会话必须立即撤销作用域，迟到的续约结果不得重启计时或改变健康状态。领取/续约返回时已到期则同步撤销，不能依赖零延迟定时器拦截后续调用；领取期间服务停止时，返回的租约只允许释放，不能启动业务。这些保护覆盖调度时序，不改变保存结果、质量策略或人工恢复权限。

排队 GET 只读取租约、创建时间与 Worker 健康事实。有效租约显示启动中，健康执行其他作品时解释串行等待；后台不可用或无有效租约的异常等待提供来源页 retry_start。该命令在事务中校验版本、执行世代和租约条件，保留同一 Run 的范围、用量和正文，再唤醒幂等循环；它只适用于 queued，不能代替 paused 的显式 resume 或等待确认的门控操作。运行记录仍是只读来源导航，前端不得根据字符串或本地计时自行授权恢复。

发布质量门应包含 Worker 常驻循环故障注入、心跳拒绝/丢失/悬挂、SQL 写入撤销和 retry_start 的 HTTP/SQLite 回归；只验证 tick 的正常迁移或新建空库成功，不能证明异常后新书可启动。

每个未完成阶段的自动恢复额度来自不可变合同中的 pipelinePolicy.maxAutomaticRetries（0 或 1），不得读取全局设置或固定为一次。未持有策略快照的历史内核测试合同保持一次默认值；无效的已保存额度按零处理。已开始的步骤只有在依赖图仍要求重新执行同一步骤时才被视为中断，已经提交的可用产物直接复用，不消耗重生成额度。

捕获异常和未完成步骤的跨进程中断均保存 execution_failure。controlVersion 标识该次步骤尝试，已捕获异常不能在重领时再次计费。Worker 与执行器通过同一规则，只累计当前阶段在最近的已保存 step_finished、stop_signal_cleared 或 gate_regeneration_requested 边界之后的失败；前面阶段已恢复成功的异常仍保留在历史中，但不占用后续阶段额度。新异常保存 stepId，保存产物后控制态更新失败的旧阶段异常也不能计入另一个阶段；步骤尚未开始的异常以空 stepId 单独计数。

历史失败缺少 stepId 时，只能按已保存边界保守累计，不猜测阶段、不回写旧事件。计数来自持久事实，进程重启不能恢复同一未完成阶段已经消耗的额度。额度耗尽仍写人工恢复信号并暂停，只有显式恢复命令可以解除暂停；阶段成功边界不会清除暂停或安全停止信号。该预算保护步骤重生成，与章级共享修复额度及单章 token 硬限各自独立，不能用于重新生成已闭合正文。

HTTP 门面只负责结构化校验、调用应用服务和返回投影。命令接口返回 `202`，步骤执行始终由 Worker 完成；当前 Run、历史和详情接口都通过同一个投影服务读取，详情只在适配层追加事件时间线。`DIRECTOR_NEXT_ENABLED` 默认开启，只有显式关闭时才不加载新模块、不挂载路由或启动新 Worker；开启后由模块根目录的组合入口装配 Prisma 适配器。新建的 `queued` Run 在 Worker 首轮领取后先通过版本化 `start` 迁移进入 `running`，再执行步骤，确保命令创建与后台执行之间的边界是显式的。

应用层只能依赖端口和领域出口，HTTP 层只能依赖应用 facade；基础设施实现只由组合入口装配。跨书历史筛选在持久化查询中按 `paused`、`waiting_gate` 和 `failed` 状态筛选，并保持读取接口无写入。

租约的到期时间和比较时间由调用方传入，仓储不得调用 `Date.now()` 或 `new Date()`。事件序号和产物版本在事务中递增，读取和投影只能经应用端口获得事实。

质量债是可继续生产的局部信息，不得被仓储或投影转换成全局重规划。人工恢复锁仍由控制态和显式用户命令解除，后台扫描不能清除它。

## 生产计划与章节链的职责

生产计划声明放在 `steps/planDefinition.ts`，与测试计划和在途 Run 的版本分开。P0 目录中的候选生成、项目创建、资产盘点不属于该生成图；规划资产有各自的唯一生产步骤，章节生产以批次闭合事实作为导演侧产物。审校、修复、连续性、伏笔和角色同步仍在章节生产链内部执行，导演不重复调用它们。

`chapter_draft` 在该图中是外部类型。它保留覆盖保护语义，但不能伪装成新导演生成的第二份正文；章节内容仍以业务表为准。声明计划通过验证只证明依赖和边界一致，不能证明底层业务服务已接通。

## Failure Modes

- 把运行合同字段拆写到控制表，会让重试或恢复改变用户已经确认的范围、问题策略或模型配置。
- 省略 CAS 条件会使并发 Worker 覆盖游标，造成重复执行或跳过步骤。
- 让事件或产物版本在事务外计算，会产生重复序号或跨范围错误复用最新产物。
- 把 `chapter_draft` 当作普通上游产物失效，会覆盖用户已经保存的正文。
- 用内存替身代替真实 SQLite 集成测试，会漏掉唯一索引、外键和并发事务问题。

## Related Modules

- `server/src/modules/director/domain/`
- `server/src/modules/director/application/`
- `server/src/modules/director/infrastructure/`
- `server/src/modules/director/http/`
- `server/src/modules/director/bootstrap.ts`
- `server/src/prisma/schema.prisma`
- `server/src/prisma/schema.sqlite.prisma`
- `server/tests/directorNext/persistence.test.js`

## Source Documents

- [自动导演重构路线图](../../superpowers/plans/2026-09-30-director-rebuild-00-roadmap.md)
- [自动导演领域内核计划](../../superpowers/plans/2026-09-30-director-rebuild-01-domain-kernel.md)
- [自动导演事实层持久化计划](../../superpowers/plans/2026-09-30-director-rebuild-03-persistence.md)
