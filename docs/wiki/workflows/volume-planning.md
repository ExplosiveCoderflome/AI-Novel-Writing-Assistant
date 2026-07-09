# 卷规划工作流

## Background

卷规划位于故事宏观规划和章节执行之间，负责把整本书的承诺拆成卷级阶段。它不能只回答“分几卷”，还必须回答每卷为什么值得单独存在、承担什么阶段回报、如何保护前期推进秩序，以及后续卷保留多少可调度空间。

目标用户多是写作新手。卷战略如果和卷骨架、节奏板、章节任务脱节，用户很容易把旧骨架误认为已经同步，或者在高风险策略下继续拆章，最终让后续章节反复失焦。因此卷规划需要同时维护数量决策、作者控制权、质量门禁和下游资产一致性。

## Decision

当前卷规划采用 **动态结构区间 + AI 策略判断 + 骨架生成** 的两段式工作流：

```text
故事宏观规划 / 书级合约
-> 卷数与 hard/soft 指导
-> 卷战略 strategy
-> 卷战略审查 critique
-> 卷骨架 skeleton
-> 节奏板 / 拆章 / 章节执行
```

卷数决策不再以固定每卷章节数除法为核心。章节预算只用于给出结构区间，最终卷数由模型结合阶段承诺、卖点切换、局面升级、阶段兑现和卷末牵引来决定。

## Current Rule

动态卷数区间由 `VolumeCountGuidance` 提供：

- `< 60 章`：允许 `1-2` 卷，适合短结构。
- `60-119 章`：推荐 `3-4` 卷，保护三段式或四段式结构。
- `120-249 章`：推荐 `4-6` 卷。
- `250-499 章`：推荐 `6-9` 卷。
- `500-899 章`：推荐 `9-14` 卷。
- `900-1499 章`：推荐 `14-20` 卷。
- `1500+ 章`：推荐 `18-24` 卷。

`allowedVolumeCountRange` 是技术和手动固定范围，当前上限为 `24`。`decisionVolumeCountRange` 是 AI 自动分卷时应遵守的结构决策区间。静态 Prompt Registry、Prompt Workbench 和真实运行路径必须共享同一个上限，不允许一个路径仍停留在旧的 `16` 卷上限。

## Author Control

已有卷草稿和用户固定卷数都属于作者控制权：

- `userPreferredVolumeCount` 优先级最高，schema 必须硬锁 `recommendedVolumeCount`。
- 当用户选择沿用草稿，`respectedExistingVolumeCount` 也必须进入 fixed count，而不是只作为上下文软提示。
- 当用户明确恢复系统建议，才回到 `decisionVolumeCountRange` 内自动判断。

这条规则保护旧项目和用户手动结构。AI 可以解释风险，但不能在“沿用草稿”的路径中擅自改卷数。

## Strategy And Skeleton Consistency

`strategy` 和 `skeleton` 是不同层级的资产：

- strategy 负责卷数、hard/soft 范围、卷级职责和不确定性。
- skeleton 负责具体卷骨架字段、章节范围和可编辑卷工作区。

重跑 strategy 后，旧 skeleton 不再可信。系统必须清空旧 `volumes`、节奏板和相邻卷再平衡结果，让用户明确重新生成卷骨架。不能让“新战略 + 旧骨架”短暂并存，否则新手会误以为骨架已经按新战略同步。

## Critique Boundary

卷战略审查不是纯展示信息。它的边界是：

- `low` / `medium` 风险：允许继续生成 skeleton，但 UI 应展示风险和建议。
- `high` 风险：阻断 skeleton 生成，要求用户重新生成或修订 strategy。
- 自动导演路径在 strategy 后执行 critique，再进入 skeleton；如果 critique 返回高风险，服务端 readiness 和 scope 检查会阻止继续推进。

第一版不引入自动修订 strategy 的新 prompt。后续如果增加自动修订，应保持顺序为：

```text
strategy -> critique(high) -> revise strategy -> critique -> skeleton
```

不要把 critique 做成“能看不能用”的半成品，也不要让高风险策略直接进入卷骨架。

## Story Macro Dependency

卷战略最应该消费的上游是故事宏观规划：主线卖点、长期对立、推进回路、成长路径、关键兑现点和不可破坏约束。

当前 Prompt Context Policy 中 `macro_constraints` 仍是 preferred block，因为历史项目可能缺少故事宏观规划。规则是：

- 有 Story Macro 时，每卷 `roleLabel` 必须能映射到主线卖点、冲突升级、成长路径或结尾风味。
- 无 Story Macro 时，策略必须降级为更保守的结构，并在 `uncertainties` 中说明缺少主线骨架带来的风险。
- 不允许在缺少 Story Macro 时臆造精细主线阶段。

如果未来产品流程强制所有新项目先生成 Story Macro，可以再把 `macro_constraints` 升级为 required。

## Hard / Soft Planning

hard 和 soft 是卷级规划深度，不是质量高低：

- `<= 3 卷`：全部 hard，保证短中篇结构完整。
- `4-6 卷`：前 `3-4` 卷 hard。
- `7+ 卷`：前 `3-6` 卷 hard，后续 soft。

hard 卷锁定前期承诺、卖点、推进秩序和节奏稳定性；soft 卷保留后续卷的方向和阶段职责，但不提前写死所有细节。

## Downstream Gap

卷规划的价值最终要进入章节执行。当前已存在 `VolumeWindowContext.keyMilestoneGuards` 字段，但卷规划服务尚未完整填充它。这个缺口会导致章节生成仍可能提前兑现后续里程碑或重复卷级高潮。

后续修复应让 skeleton 或 beat sheet 生成关键里程碑守卫，并在 `volume_window` 上下文中注入目标章节范围、事件、禁止提前兑现点和节奏说明。

## Related Modules

- `shared/types/volumePlanning.ts`：动态卷数区间、hard/soft 范围和作者控制权计算。
- `server/src/services/novel/volume/volumeGenerationOrchestrator.ts`：strategy、critique、skeleton 的运行顺序和 fixed count 传递。
- `server/src/services/novel/volume/volumeGenerationHelpers.ts`：scope readiness 与 strategy/skeleton 合并规则。
- `server/src/services/novel/volume/volumeWorkspaceDocument.ts`：工作区 readiness。
- `server/src/prompting/prompts/novel/volume/strategy.prompts.ts`：卷战略 PromptAsset。
- `server/src/prompting/prompts/novel/volume/skeleton.prompts.ts`：卷骨架 PromptAsset。
- `docs/wiki/prompts/novel-generation-quality-guards.md`：卷级关键节点守卫缺口。

