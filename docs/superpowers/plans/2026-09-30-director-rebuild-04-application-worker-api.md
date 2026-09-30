# 自动导演重构 · 计划 04：应用层、Worker、接口与开关（任务级，待细化）

状态：**待开发，任务级计划**。代码级步骤在计划 01、03 验收通过后细化。

**目标：** 实现五种命令、单一执行循环、以 Run 为单位的 Worker 租约，以及独立接口 `/api/director-next/*`，全部由环境开关控制，不影响任何现有入口。

**依赖：** 计划 01、03。

**设计文档：** 第 5.3、6、8.1 节。

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
| 1 | `factsLoader`、`projectionService` | 读取接口对同一 Run 连续调用后，控制行与产物表的所有列不变（纯读） |
| 2 | `commandService` 五种命令 | 幂等、版本冲突 409、活跃冲突 409、`resume` 是唯一解除人工暂停的命令（尝试其他路径均失败） |
| 3 | `runExecutor` 与 `stepRegistry`，使用假步骤 | 全部假步骤按依赖执行；在每个步骤边界模拟崩溃后恢复，每个步骤恰好执行一次；守卫拒绝非法动作并累计拒绝次数，耗尽后暂停 |
| 4 | `worker`：租约、心跳、过期重领 | 两个 Worker 竞争同一 Run 只有一个运行；租约过期后另一个 Worker 接手并继续；重启后按问题策略快照的重试预算自动恢复一次，耗尽转人工暂停 |
| 5 | `http/routes` 与 `mountDirectorNext`，开关接入 `app.ts` | 开关关闭时 `app.ts` 行为与改动前完全一致（路由不存在、Worker 不启动）；开关开启时四个接口可用 |
| 6 | 边界测试扩展：`application/` 不得 import `infrastructure/` 的具体实现（只经 `ports.ts`）；`http/` 不得 import `infrastructure/` | 边界测试通过 |

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
