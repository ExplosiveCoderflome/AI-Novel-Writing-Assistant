# 自动导演重构 · 计划 05：步骤适配（任务级，待细化）

状态：**进行中，Task 1 已完成，7/10 个步骤处理器已实现**。生产计划包含 P0 盘点中的 10 个资产生产步骤，逐行对照测试已通过。故事宏观、书级创作约定、世界准备、分卷策略、目标卷节奏板、卷拆章列表与章节细化处理器完成桩测试，并通过实际业务服务类型兼容检查；尚未装配 Worker，不能据此宣称小说生成链路已接通。

`story_macro` 通过当前 Run 输入读取器传递故事想法及模型选项。`world_setup` 通过世界网关生成或复用世界，保护已有设定并验证保存的上下文。`volume_strategy` 调用策略 → 审查 → 骨架并保存，不触发章节执行合同校验。

`volume_beat_sheet` 调用底层分卷服务生成所选卷节奏板并保存。小说归属、目标卷及对应非空节奏板均需验证；保存不触发章节执行合同或伏笔同步。内容哈希仅覆盖保存的目标卷节奏板，产物引用包含卷 ID。此次新增 6 项检查覆盖定向调用、空结果、跨书/错误卷输入、保存后结果丢失、生成和保存错误；缺少章节细化与执行合同仍可完成路线规划。

用户已明确授权提取书级创作约定生成逻辑。`BookContractGenerationService` 位于 `services/novel/bookContract/application/`，旧阶段调用同一服务，旧标准化函数转为兼容导出；Prompt、温度和输出整理保持原行为。新 `book_contract` 处理器调用生成及保存服务，保存校验后才返回产物引用。

本轮服务端构建、实际分卷服务的编译期接口兼容检查，以及定向测试 **121/121**（新导演 107 项，生成服务与旧 Schema/兼容 14 项）通过。此前扩展运行旧目录边界检查时为 118/119：唯一失败是既有 `NovelDirectorIdeaInspirationService.ts` 不在根目录文件预期清单中；本轮这两个文件未改，不重复执行同一已知失败。未运行真实 AI、业务数据库迁移、完整历史集成测试或浏览器验收。此轮是内部适配，未启用新生产能力，因此不增加用户发布说明。

`volume_chapter_list` 显式按目标卷调用 `chapter_list/full_volume`，保存后哈希目标卷章节规划。输入缺少对应节奏板、生成或保存结果跨书/缺失目标列表、服务标为部分完成时不登记产物；保存关闭章节执行同步。服务端构建和实际 `NovelVolumeService` 编译期兼容检查通过；本阶段定向测试 **21/21**（新适配 5、边界 3、既有节奏拆章与续接 13）。未修改生成算法或 Prompt、未调用真实 AI 或业务数据库。本阶段是内部适配，未启用生产注册，跳过发布说明。

用户已授权调整既有生成结果与新执行器结果协议，保持 Prompt、生成和质量算法。可选质量回调保留门禁结果及原结构化 AI 评估；旧默认返回、拒绝及复用行为保持兼容。`chapter_detail_bundle` 通过 `task_sheet` 细化授权目标、串联草稿并保存后落账；使用结构化问题决策端口返回多条质量债或明确停止信号。该决策端口的真实 AI 装配仍未完成，桩决策不能视为生产 AI 能力。

执行器兼容单条质量债并支持多条质量债与停止信号。停止事实经守卫验证，先于产物台账保存；即使产物保存后崩溃，恢复仍会暂停而不推进下游。质量优先且明确人工暂停决定可进入手动恢复，完成优先只记录局部债。服务端构建、实际分卷服务编译期兼容检查、新导演及旧任务单质量测试 **135/135**（新导演 123、任务单质量 12）通过。未运行真实 AI、开发库迁移或完整历史集成测试；本次未启用生产入口，跳过发布说明。

后续仍需：角色准备、执行合同同步、正文批次共 3 个处理器，以及启动输入持久化、世界跳过合同、结构化问题决策与服务装配、完整计划运行测试。角色候选保存及应用存在覆盖旧候选/关系的路径，需要在接通前明确保护和确认边界。

## 已确认的适配边界

- `planDefinition.ts` 使用独立版本 `director-next-production-v1`，暂不替换 P3 的装配入口；只有全部处理器与输入初始化接通后才能启用该计划。
- 开书候选和项目创建保持现有入口；资产盘点属于 `open_run` 初始化，不加入步骤图。
- 正文批次只产出 `chapter_batch_closed`。`chapter_draft` 是章节生产链维护的外部资产类型，用于保护既有正文，不能新增第二个导演正文生产步骤。
- 世界、角色、分卷和结构化规划使用已存在的底层服务。书级创作约定生成已按用户授权提取独立服务，新旧导演共用，禁止复制生成逻辑。
- 全书自动的路线窗口与当前章执行合同分开处理；本阶段不能退回全书全量细化。

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
| 1 | `planDefinition.ts`：逐行对照计划 02 的步骤表，无删改 | **已通过**：10 个生产步骤逐行匹配盘点表；计划无环、单一产物写者且冻结；2 个新测试与 3 个边界测试通过 |
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
