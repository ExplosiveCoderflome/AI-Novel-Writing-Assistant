# Novel Director 子系统

## 架构概览

长篇小说自动导演的后台执行分为三层：

### 1. 任务分发层（TaskDispatcher + DirectorTaskQueue）

- **`TaskDispatcher`** — 进程内事件总线。当新命令入队时发出信号，worker 立即唤醒。
  取代旧架构中 1.5 秒固定轮询，同时保留轮询作为跨进程和 crash recovery 兜底（5 秒间隔）。
- **`DirectorTaskQueue`** — 单活动队列抽象。当前只 lease / renew / complete / fail `DirectorRunCommand`，
  对外暴露 `leaseNext` / `completeTask` / `failTask` 语义。资源限流（ResourceGate）也由此层管理。

### 2. Worker 消费层（DirectorWorker）

Worker 是纯消费者，核心循环：
```
waitForWork() → leaseNext() → acquireResourceGate() → markRunning() → executeCommand() → completeTask()
```
不直接操作任何数据库模型。通过构造函数注入 `DirectorTaskQueue` 和 `DirectorCommandExecutor`，可在测试中替换为 mock。

### 3. 持久化与调度层（Services）

- **`DirectorCommandService`** — HTTP 入口，创建 `DirectorRunCommand`，并发出 `taskDispatcher.notify()` 唤醒信号。
- **`DirectorCommandExecutor`** — 将命令解释为自动导演管线动作，并调用 `NovelDirectorService` 推进候选、接管、恢复、审批和修复流程。
- **`DirectorRuntimeStore` / `DirectorRuntimeService`** — 维护自动导演步骤、事件、artifact 和策略快照；不参与后台命令 lease。

## 门面入口

```typescript
import {
  DirectorCommandService,
  DirectorCommandExecutor,
  DirectorTaskQueue,
  taskDispatcher,
} from "./directorSubsystem";
```

## 数据模型

系统当前只有一套活动后台命令队列：

| 层级 | 模型 | 用途 |
|------|------|------|
| Active Queue | `DirectorRunCommand` | 唯一活动命令队列，与 `NovelWorkflowTask` 直接关联 |
| Runtime Snapshot | `DirectorRun` → `DirectorStepRun` / `DirectorEvent` / `DirectorArtifact` | 自动导演步骤、事件和产物历史 |
| Legacy Runtime Queue | `DirectorRuntimeInstance` → `DirectorRuntimeCommand` → `DirectorRuntimeExecution` | 仅保留历史投影兼容，不再作为新的后台命令队列写入 |

新代码不应新增 `DirectorRuntimeCommand` / `DirectorRuntimeExecution` 写入路径。需要展示旧任务历史时，可以通过 runtime projection 读取这些历史行；需要排队执行时，必须通过 `DirectorCommandService` 创建 `DirectorRunCommand`。
