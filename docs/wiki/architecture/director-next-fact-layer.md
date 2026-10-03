# 自动导演新内核事实层边界

## Background

自动导演重构需要把运行合同、可变控制态、产物账本、质量债和事件序列从旧任务载荷中分离出来。若这些事实继续由不同服务各自解析和回写，恢复时无法判断哪些输入已经冻结、哪些进度可以前进，也无法保证同一本书只有一个活跃运行。

## Decision

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

投影来源路由只由 `novelId` 生成，因此可以让书页恢复现场，却不能把 Run ID 或任务 ID 变成页面地址。查询接口连续读取前后，六张事实表的列值必须完全相同；需要改变状态的行为只能走命令服务。

命令幂等键由 `DirectorNextCommand` 作为唯一入口。打开 Run、控制态迁移和 handoff 都在同一事务中写入命令结果与事实；重放命令只返回已保存结果，不再次调用状态迁移。HTTP 层可以把领域版本冲突转换成 409，但不能在路由里自行重试或修改控制态。

执行器每次只推进一个领域动作。步骤开始先记录游标，步骤产物和用量事件落账后才推进 `step_finished`；在这两个边界之间进程崩溃时，下一次循环从产物事实重新计算，不依赖内存游标。守卫拒绝事件按 Run 记录，达到合同中的拒绝预算后写入结构化人工恢复信号并暂停。

Worker 候选只包含 `queued`、`running` 和 `waiting_gate`，暂停中的 Run 不会被后台重新领取。领取使用数据库条件更新，心跳和到期时间由运行时注入；竞争失败的 Worker 放弃该 Run，租约过期后才允许另一个 Worker 接手。异常次数按注入的策略快照计算；预算内只记录失败并等待接管，预算耗尽后写结构化人工恢复信号，后台不能清除暂停。

自动恢复额度来自不可变合同中的 pipelinePolicy.maxAutomaticRetries（0 或 1），不得读取全局设置或固定为一次。未持有策略快照的历史内核测试合同保持一次默认值；无效的已保存额度按零处理。已开始的步骤只有在依赖图仍要求重新执行同一步骤时才被视为中断，已经提交的可用产物直接复用，不消耗重生成额度。

捕获异常和未完成步骤的跨进程中断均保存 execution_failure。controlVersion 标识该次步骤尝试，已捕获异常不能在重领时再次计费。额度按最近一次 stop_signal_cleared 之后的失败事实计算，耗尽后写人工恢复信号并暂停；只允许显式恢复命令开启新的恢复区间。该预算保护步骤重生成，与章级共享修复额度及单章 token 硬限各自独立，不能用于重新生成已闭合正文。

HTTP 门面只负责结构化校验、调用应用服务和返回投影。命令接口返回 `202`，步骤执行始终由 Worker 完成；当前 Run、历史和详情接口都通过同一个投影服务读取，详情只在适配层追加事件时间线。`DIRECTOR_NEXT_ENABLED` 默认关闭，关闭时不加载新模块、不挂载路由也不启动新 Worker；开启后由模块根目录的组合入口装配 Prisma 适配器。新建的 `queued` Run 在 Worker 首轮领取后先通过版本化 `start` 迁移进入 `running`，再执行步骤，确保命令创建与后台执行之间的边界是显式的。

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
