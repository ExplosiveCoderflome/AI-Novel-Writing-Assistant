# 自动导演重构 · 计划 04：应用层、Worker、接口与开关（P3 细化版）

状态：**P3 已完成**。事实装载、停止信号生命周期、版本化计划投影、命令幂等事务、假步骤恢复、拒绝预算、租约竞争、策略重试耗尽暂停、HTTP 门面与开关边界均已通过验证。

**目标：** 实现五种命令、单一执行循环、以 Run 为单位的 Worker 租约，以及独立接口 `/api/director-next/*`，全部由环境开关控制，不影响任何现有入口。

**依赖：** 计划 01、03。

**设计文档：** 第 5.3、6、8.1 节。

## P3 细化覆盖（2026-10-01，执行时以此为准）

1. `FactsLoader` 只通过 `RunRepository`、`ArtifactLedger`、`QualityDebtRepository` 和 `EventLog` 读取事实；它返回 `RunContract`、`RunControl` 和 `FactsSnapshot`，不写入任何表。停止信号只接受事件账本中结构化的 `stop_signal` 载荷，控制态中的暂停也只按已保存的 `PauseKind` 映射，禁止从错误文本或关键词猜测停止原因。
2. `ProjectionService` 只读取 `FactsLoader` 和不可变的计划注册表，再调用领域层 `project()`；来源路由由小说 ID 生成，不能包含 Run ID、任务 ID 或控制态字段。`summary` 与 `detail` 共用同一投影函数，事件时间线只在 detail 适配层追加。
3. 计划注册表按 `contract.planVersion` 查找已冻结的 `PlanDefinition`；找不到版本是应用错误，不能回退到最新计划。测试使用内存注册表和真实临时 SQLite 两种方式覆盖。
4. 命令幂等记录必须与 Run 创建或控制态迁移处于同一数据库事务。`DirectorNextCommand` 的 `idempotencyKey` 是唯一入口；相同键直接返回第一次保存的结果，不重新执行。为此在应用端口增加命令仓储的读取、原子保存和结果更新能力，Prisma 实现仍只放在 `infrastructure/`。
5. Worker 只领取 `DirectorNextRunControl` 的活跃 Run，租约过期后重新从事实层计算 `next()`；不读取旧任务、旧命令或旧导演服务。每个步骤边界先写产物/事件，再推进控制态，崩溃恢复依赖事实账本而不是内存游标。
6. HTTP 路由只解析结构化请求、调用命令服务或投影服务并立即返回；命令返回 `202`，路由不等待步骤执行。`DIRECTOR_NEXT_ENABLED` 默认关闭时不挂载路由、不实例化新 Worker；`app.ts` 只能追加受开关保护的代码。
7. 应用层只依赖 `application/ports.ts` 和领域出口；`http/` 只能依赖应用 facade，不能 import `infrastructure/`。集成测试统一使用临时 SQLite 文件，禁止连接开发库或使用内存替身替代真实持久化验收。

## Global Constraints

- 继承计划 00 第 3、6 节的全部约束。
- **不修改任何现有路由、现有 Worker、现有入口**；只在 `server/src/app.ts` 增加**受开关控制的**挂载与启动（改动限于这一个既有文件，且必须是追加，不得改动其他行）。
- 开关：环境变量 `DIRECTOR_NEXT_ENABLED`，默认关闭。关闭时：不挂载路由、不启动 Worker、不加载新模块的运行时代码。
- 新 Worker 只租约 `DirectorNextRunControl`，**绝不读取或领取旧任务、旧命令**。
- 长任务只在 Worker 中运行；HTTP 层只收命令并返回投影。路由内不得 `await` 步骤执行。
- 人工暂停只能经 `resume` 命令离开，该规则已由计划 01 的迁移表保证，应用层不得另设绕过路径。
- 读取接口只调用投影，不得有任何写操作。
- 所有时间、随机数、环境变量读取集中在 `application/` 的单一 `runtime` 注入点，`domain/` 继续禁止。

## 需要新增的文件

| 路径 | 职责 |
| --- | --- |
| `server/src/modules/director/application/commandService.ts` | 五种命令的处理：`open_run`、`resolve_gate`、`resume`、`handoff`、`cancel` |
| `server/src/modules/director/application/runExecutor.ts` | 执行循环：读事实 → `next()` → 守卫 → 执行步骤 → 落账 |
| `server/src/modules/director/application/stepRegistry.ts` | 步骤实现注册表：`stepId → (context) => Promise<StepResult>` |
| `server/src/modules/director/application/factsLoader.ts` | 由仓储组装 `FactsSnapshot`（产物、质量债、停止信号） |
| `server/src/modules/director/application/worker.ts` | 租约、心跳、按 Run 运行循环、租约过期后由其他 Worker 重新领取 |
| `server/src/modules/director/application/projectionService.ts` | 读取事实并调用领域 `project()` |
| `server/src/modules/director/http/routes.ts` | `/api/director-next/*` 路由 |
| `server/src/modules/director/http/index.ts` | 出口与 `mountDirectorNext(app)` |
| `server/tests/directorNext/application/*.test.js` | 使用假步骤与真实 SQLite 的测试 |

补充文件：

| 路径 | 职责 |
| --- | --- |
| `server/src/modules/director/infrastructure/prismaCommandRepository.ts` | `DirectorNextCommand` 的幂等记录与原子命令结果持久化 |
| `server/src/modules/director/application/runtime.ts` | 统一注入时间、随机 ID、环境开关和 Worker 标识，业务服务不直接读取环境变量 |

## 命令契约（定稿）

```ts
type Command =
  | { type: "open_run"; novelId: string; driver: "auto" | "assisted"; stepIdsInScope: string[] | null; idempotencyKey: string }
  | { type: "resolve_gate"; runId: string; decision: "confirm" | "confirm_after_edit" | "regenerate"; expectedVersion: number; idempotencyKey: string }
  | { type: "resume"; runId: string; expectedVersion: number; idempotencyKey: string }
  | { type: "handoff"; runId: string; toDriver: "auto" | "assisted"; expectedVersion: number; idempotencyKey: string }
  | { type: "cancel"; runId: string; expectedVersion: number; idempotencyKey: string };
```

- 相同 `idempotencyKey` 重复提交返回第一次的结果，不重复执行。
- `expectedVersion` 不匹配返回 HTTP 409，文案："状态已变化，请刷新后再操作"。
- 对已有活跃 Run 的书执行 `open_run`：返回 409，文案："这本书已有进行中的创作，请先继续或取消当前创作。"
- `handoff` 在已保存边界生效：当前步骤结束后，关闭旧 Run，以同一份产物台账创建新 Run；不迁移任何状态。

## 接口（定稿）

| 方法与路径 | 作用 |
| --- | --- |
| `POST /api/director-next/commands` | 提交命令，立即返回 `{ runId, controlVersion }` |
| `GET /api/director-next/novels/:novelId/current` | 返回当前 Run 的 `DashboardView`（`summary` 档） |
| `GET /api/director-next/runs/:runId` | 返回 `DashboardView`（`detail` 档）与事件时间线 |
| `GET /api/director-next/runs` | 跨书历史列表，支持 `needsAttention=true` 筛选；只读 |

任何响应和路由中**不得出现任务编号作为页面地址参数**；`sourceRoute` 只含小说编号。

## Tasks（任务级）

| Task | 内容 | 验收 |
| --- | --- | --- |
| 1 | `factsLoader`、`projectionService` | **已通过**：读取接口对同一 Run 连续调用后，控制行与产物表的所有列不变（纯读） |
| 2 | `commandService` 五种命令 | **已通过**：幂等、版本冲突 409、活跃冲突 409、`resume` 是唯一解除人工暂停的命令；真实 SQLite 验证命令记录与 Run 写入同一事务 |
| 3 | `runExecutor` 与 `stepRegistry`，使用假步骤 | **已通过**：全部假步骤按依赖执行；产物落账后步骤边界崩溃可恢复且每个步骤恰好执行一次；守卫拒绝非法动作并累计拒绝次数，耗尽后暂停 |
| 4 | `worker`：租约、心跳、过期重领 | **已通过**：两个 Worker 竞争同一 Run 只有一个运行，租约过期后另一个 Worker 接手；策略允许的重试耗尽后写停止信号并进入人工暂停 |
| 5 | `http/routes` 与 `mountDirectorNext`，开关接入 `app.ts` | **已通过**：四个接口、结构化校验、命令 `202` 返回、小说来源路由和开关保护均已接入 |
| 6 | 边界测试扩展：`application/` 不得 import `infrastructure/` 的具体实现（只经 `ports.ts`）；`http/` 不得 import `infrastructure/` | **已通过**：边界测试覆盖应用、HTTP 与基础设施组合入口 |

## 停止条件

继承计划 00 的 G1～G6，另加：

| 编号 | 情况 |
| --- | --- |
| A1 | 需要修改 `app.ts` 中追加内容之外的任何已有行 |
| A2 | 需要读取、领取或修改旧任务、旧命令、旧表 |
| A3 | 路由中需要 `await` 步骤执行才能满足测试 |

## 验收者检查项

1. 开关关闭状态下启动服务，确认没有新路由、没有新 Worker 日志。
2. 对 `app.ts` 做 `git diff`，确认只有追加。
3. 在假步骤中故意抛错，确认 Run 按预算自动恢复后转人工暂停，且之后只有 `resume` 能继续。
4. 并发两次 `open_run` 同一本书，确认只有一个成功。
5. 读接口调用前后对比数据库快照，确认无写入。
