# 自动导演重构 · 计划 05：步骤适配（任务级，待细化）

状态：**待开发，任务级计划**。本计划的 Task 清单由计划 02 的步骤依赖图直接生成，因此代码级步骤要等计划 02 验收后才能写出。

**目标：** 把旧链路里真正生成规划产物和正文的能力，包装成新内核的步骤实现，不重写任何生成逻辑、提示词或质量算法。

**依赖：** 计划 02（步骤清单）、计划 04（`stepRegistry`、`runExecutor`）。

**设计文档：** 第 5.1、6.4 节，第 10 节"规划与产品"。

## Global Constraints

- 继承计划 00 第 3、6 节的全部约束。
- **步骤实现只能调用底层业务服务**（生成、保存、同步的服务函数），**不得**调用旧导演的流水线、编排器、步骤模块或运行时（`NovelDirectorPipelineRuntime`、`DirectorCommandExecutor`、`directorPlanningStepModules` 等）。复用什么由计划 02 的"复用的底层服务"一列决定。
- 若某步骤的生成逻辑目前只存在于旧导演的阶段文件中，无法直接调用：**停止并报告**，由我决定是否把它下沉为独立函数。不要自行复制粘贴旧代码。
- **不改提示词、不改章节生成 / 审校 / 修复内部实现。**
- 步骤执行结果必须通过 `ArtifactLedger.record` 落账；内容本体仍写入小说业务表，台账只保存 `contentRef` 与 `contentHash`。
- 步骤不得自行决定"继续 / 暂停 / 重规划"。需要表达停止时，返回 `StopSignal`（`replan`、`safety`、`data_integrity`、`no_usable_content`），由编排器决定。
- 质量问题只返回质量债记录，不返回停止信号。
- 任何创作语义判断交给 AI 结构化输出，不得用关键词、正则或固定文本判断。

## 步骤实现契约

```ts
interface StepContext {
  runId: string;
  novelId: string;
  contract: RunContract;
  facts: FactsSnapshot;
  now: () => Date;
}

type StepResult =
  | { kind: "produced"; artifact: { type: string; scope: string; contentRef: string; contentHash: string; protectedUserContent: boolean }; debts: Array<{ chapterOrder: number; code: string }> }
  | { kind: "stop"; signal: StopSignal };

type StepImplementation = (context: StepContext) => Promise<StepResult>;
```

## 文件布局

| 路径 | 职责 |
| --- | --- |
| `server/src/modules/director/steps/planning/<stepId>.ts` | 每个规划步骤一个文件，只做适配 |
| `server/src/modules/director/steps/production/chapterBatch.ts` | 章节批次步骤，内部只调用 `startPipelineJob` / `resumePipelineJob` |
| `server/src/modules/director/steps/planDefinition.ts` | 由计划 02 的步骤表生成的 `definePlan(...)` 声明 |
| `server/src/modules/director/steps/registry.ts` | 把全部步骤实现登记到 `stepRegistry` |
| `server/tests/directorNext/steps/*.test.js` | 每个步骤一个测试，外部服务用桩 |

## Tasks（任务级）

| Task | 内容 | 验收 |
| --- | --- | --- |
| 1 | `planDefinition.ts`：逐行对照计划 02 的步骤表，无删改 | `definePlan` 通过（无环、无重复 `produces`）；一条测试逐行断言与步骤表一致 |
| 2…N | **每个规划步骤一个 Task**：适配文件 + 测试。测试必须断言：调用了哪个底层服务、产出的产物类型与 `produces` 一致、没有 import 旧导演运行时 | 该步骤测试通过；边界测试通过 |
| N+1 | `chapterBatch`：按授权范围调用 `startPipelineJob`；等待作业结束并保持心跳；把章节结果转为产物与质量债 | 桩测试：质量问题只产生质量债而不返回停止信号；`replan_required` 才返回 `replan` 停止信号；无可用正文返回 `no_usable_content`；用量熔断返回 `safety` |
| N+2 | 滚动规划：路线窗口与章节执行合同是两个步骤；路线同步阶段不做执行期完整性校验 | 测试：下一章缺少执行合同时路线步骤仍然成功 |
| N+3 | `registry.ts` 与端到端假数据测试：用桩服务跑完整计划 | 全自动 Run 从 `novel_seed` 跑到 `complete`，崩溃恢复幂等 |

## 停止条件

继承计划 00 的 G1～G6，另加：

| 编号 | 情况 |
| --- | --- |
| T1 | 某步骤的生成逻辑无法在不 import 旧导演运行时的前提下调用 |
| T2 | 计划 02 的步骤表中存在 `UNKNOWN`，且影响到该步骤的 `requires` / `produces` |
| T3 | 需要修改提示词、章节生成 / 审校 / 修复的内部实现 |

## 验收者检查项

1. 全仓搜索 `steps/` 下不得出现对 `services/novel/director/` 的 import。
2. 步骤表与 `planDefinition.ts` 逐行一致。
3. 章节批次测试覆盖"质量债不停止""只有明确信号才停止"四种情形。
4. 抽查三个步骤，核对它们调用的底层服务与计划 02 记录的一致。
