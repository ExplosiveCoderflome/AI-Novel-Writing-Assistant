# 自动导演重构 · 计划 03：持久化（任务级，待细化）

状态：**待开发，任务级计划**。代码级步骤在计划 01 验收通过后细化。详细程度说明见计划 00 第 2 节。

**目标：** 为新内核新增独立的事实表、迁移和仓储实现，使计划 01 的领域类型能够被持久化。

**依赖：** 计划 01（领域类型）。

**设计文档：** 第 4 节（事实层）、第 6.3 节（数据库兜底的不变量）。

**风险等级：高。** 项目有 Postgres 和 SQLite 两套 schema 与迁移，漏改任何一处都会导致运行时缺表。这份计划每个 Task 都由我逐步验收。

## Global Constraints

- 继承计划 00 第 3、6 节的全部约束。
- **只新增，不修改、不删除**任何已有表、列、索引、迁移。
- **不得对开发库运行迁移。** 验证只用临时数据库；对开发库的任何操作需用户批准并先备份。
- 必须同时维护四个事实源：`server/src/prisma/schema.prisma`、`server/src/prisma/schema.sqlite.prisma`、`server/src/prisma/migrations/`、`server/src/prisma/migrations.sqlite/`（依据 `docs/wiki/debugging/database-migration-drift.md`）。
- **一条迁移只负责一张表及其索引**；SQLite 迁移必须保持 `CREATE TABLE` / `CREATE INDEX` 语句可被运行时识别。
- 模型名统一前缀 `DirectorNext`，不得与任何旧 `Director*` 模型重名或建立外键。
- 业务代码只经仓储访问数据库；`domain/` 仍然禁止 import `prisma`。

## 需要新增的表（名称已定稿，不得改动）

| 表 | 作用 | 关键列与约束 |
| --- | --- | --- |
| `DirectorNextRun` | Run 合同，创建后不可变 | `id`、`novelId`、`driver`、`planVersion`、`contractJson`、`createdAt`；无 `updatedAt` |
| `DirectorNextRunControl` | 唯一可变的控制态，与 Run 一对一 | `runId`（主键且外键）、`novelId`（冗余，用于部分唯一索引）、`version`、`status`、`pauseJson`、`gateJson`、`cursorStepId`、`failureReason`、`leaseOwner`、`leaseExpiresAt`、`heartbeatAt`、`updatedAt` |
| `DirectorNextArtifact` | 产物台账，**以书为键而不是以 Run 为键**（新 Run 要能接着已有产物继续） | `id`、`novelId`、`type`、`scope`、`version`、`status`、`protectedUserContent`、`contentRef`、`contentHash`、`producedByRunId`、`createdAt`；唯一约束 `(novelId, type, scope, version)` |
| `DirectorNextQualityDebt` | 质量债，只追加 | `id`、`novelId`、`runId`、`chapterOrder`、`code`、`action`、`createdAt` |
| `DirectorNextEvent` | 事件日志，只追加，仅用于审计与时间线 | `id`、`runId`、`seq`（按 Run 递增）、`type`、`payloadJson`、`promptVersion`、`model`、`createdAt`；唯一约束 `(runId, seq)` |
| `DirectorNextCommand` | 命令幂等记录 | `id`、`runId`、`type`、`idempotencyKey`（唯一）、`payloadJson`、`resultJson`、`createdAt` |

### 数据库层不变量（必须由迁移 SQL 实现）

- **一本书同一时间最多一个活跃 Run**：在 `DirectorNextRunControl` 上建部分唯一索引。

```sql
CREATE UNIQUE INDEX "DirectorNextRunControl_novelId_active_key"
ON "DirectorNextRunControl"("novelId")
WHERE "status" IN ('queued', 'running', 'waiting_gate', 'paused');
```

  Prisma schema 无法声明部分唯一索引，因此它只能写在迁移 SQL 里，两个迁移目录各一份。
- 已有的 `status` 取值与计划 01 的 `RunStatus` 完全一致。

## 需要新增的文件

| 路径 | 职责 |
| --- | --- |
| `server/src/modules/director/application/ports.ts` | 仓储接口（见下） |
| `server/src/modules/director/application/index.ts` | 出口 |
| `server/src/modules/director/infrastructure/prismaRunRepository.ts` | `RunRepository` 实现 |
| `server/src/modules/director/infrastructure/prismaArtifactLedger.ts` | `ArtifactLedger` 实现 |
| `server/src/modules/director/infrastructure/prismaQualityDebtRepository.ts` | `QualityDebtRepository` 实现 |
| `server/src/modules/director/infrastructure/prismaEventLog.ts` | `EventLog` 实现 |
| `server/src/modules/director/infrastructure/index.ts` | 出口 |
| `server/tests/directorNext/persistence/*.test.js` | 真实 SQLite 集成测试，并把文件名加入 `server/scripts/run-tests.cjs` 的 `integrationTests` |

## 仓储接口（定稿，`ports.ts`）

```ts
import type {
  ArtifactRef, ArtifactStatus, ArtifactType, QualityDebtRef,
  RunContract, RunControl, RunEvent,
} from "../domain";

export interface RunRepository {
  open(contract: RunContract): Promise<RunControl>;
  getContract(runId: string): Promise<RunContract | null>;
  getControl(runId: string): Promise<RunControl | null>;
  findActiveRunIdByNovel(novelId: string): Promise<string | null>;
  transition(runId: string, event: RunEvent, expectedVersion: number): Promise<RunControl>;
  acquireLease(runId: string, owner: string, ttlMs: number, now: Date): Promise<boolean>;
  heartbeat(runId: string, owner: string, ttlMs: number, now: Date): Promise<boolean>;
  listExpiredLeases(now: Date): Promise<string[]>;
}

export interface ArtifactLedger {
  listByNovel(novelId: string): Promise<ArtifactRef[]>;
  record(input: {
    novelId: string; type: ArtifactType; scope: string; status: ArtifactStatus;
    protectedUserContent: boolean; contentRef: string; contentHash: string; producedByRunId: string;
  }): Promise<ArtifactRef>;
  markStale(novelId: string, types: readonly ArtifactType[]): Promise<number>;
}

export interface QualityDebtRepository {
  record(input: { novelId: string; runId: string; chapterOrder: number; code: string; action: string }): Promise<void>;
  listByNovel(novelId: string): Promise<QualityDebtRef[]>;
}

export interface EventLog {
  append(input: { runId: string; type: string; payload: unknown; promptVersion?: string; model?: string }): Promise<void>;
  list(runId: string): Promise<Array<{ seq: number; type: string; payload: unknown; createdAt: Date }>>;
}
```

约束：
- `transition` 必须在**一个数据库事务内**读取当前控制态、调用领域层 `applyEvent`（传入 `expectedVersion`）、写回；版本不匹配抛出领域层的 `VersionConflictError`，不得吞掉。
- `transition` **不得**自行判断状态合法性，只调用 `applyEvent`；非法迁移由领域层抛出 `InvalidTransitionError`。
- `record` 写产物时版本号取该 `(novelId, type, scope)` 的当前最大版本加一，在事务内完成。
- 所有时间由调用方传入（`now`），仓储内不得调用 `Date.now()`，便于测试。

## Tasks（任务级）

| Task | 内容 | 验收 |
| --- | --- | --- |
| 1 | 两份 schema 新增 6 个模型 | `prisma validate` 对两份 schema 都通过 |
| 2 | 新增 12 条迁移（6 张表 × Postgres 与 SQLite 各一），部分唯一索引单独一条 | 从空库执行全部 SQLite 迁移得到全部新表；`integrity_check`、`foreign_key_check` 通过；现有 `runtimeMigrations.test.js` 与 `prismaMigrationCompleteness.test.js` 全部通过且未被修改 |
| 3 | `ports.ts` 与 `RunRepository` 实现 | 真实 SQLite：并发 `open` 同一本书第二个活跃 Run 被唯一索引拒绝；`transition` 版本冲突；租约获取、心跳、过期列表 |
| 4 | `ArtifactLedger` 与 `QualityDebtRepository` 实现 | 版本递增；`markStale` 只影响指定类型；`listByNovel` 与领域类型一致；质量债只追加 |
| 5 | `EventLog` 实现 | `seq` 按 Run 严格递增且无重复（并发追加） |
| 6 | 边界测试：扩展 `boundary.test.js`，允许 `infrastructure/` import `@prisma` 与 `../../../db/prisma`，其余层仍只能 import 模块内文件 | 新增与原有边界用例全部通过 |

## 停止条件

继承计划 00 的 G1～G6，另加：

| 编号 | 情况 |
| --- | --- |
| P1 | 迁移完整性测试失败，且原因是新迁移以外的文件 |
| P2 | 需要修改任何已有模型、表、迁移 |
| P3 | 真实 SQLite 无法初始化（Windows 下 Prisma 引擎问题）：停止并报告具体错误，不要改用内存替身代替集成测试 |

## 验收者检查项

1. 用临时数据库从零执行全部 SQLite 迁移，确认新表、索引、`integrity_check`、`foreign_key_check`。
2. 手动验证部分唯一索引：同一 `novelId` 插入第二条活跃控制行必须失败，终态行不受限。
3. `git diff --name-only` 中不得出现任何已有迁移目录下的旧文件。
4. 确认 `transition` 内部没有自己的状态合法性判断。
5. 仓储内没有 `Date.now()`、`new Date(`。
