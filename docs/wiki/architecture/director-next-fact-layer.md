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

租约的到期时间和比较时间由调用方传入，仓储不得调用 `Date.now()` 或 `new Date()`。事件序号和产物版本在事务中递增，读取和投影只能经应用端口获得事实。

质量债是可继续生产的局部信息，不得被仓储或投影转换成全局重规划。人工恢复锁仍由控制态和显式用户命令解除，后台扫描不能清除它。

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
- `server/src/prisma/schema.prisma`
- `server/src/prisma/schema.sqlite.prisma`
- `server/tests/directorNext/persistence.test.js`

## Source Documents

- [自动导演重构路线图](../../superpowers/plans/2026-09-30-director-rebuild-00-roadmap.md)
- [自动导演领域内核计划](../../superpowers/plans/2026-09-30-director-rebuild-01-domain-kernel.md)
- [自动导演事实层持久化计划](../../superpowers/plans/2026-09-30-director-rebuild-03-persistence.md)
