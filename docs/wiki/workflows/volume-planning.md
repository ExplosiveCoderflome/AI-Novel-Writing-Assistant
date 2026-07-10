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

## Beat Sheet Slot Contract

节奏板采用 **固定职能槽位 + 本卷动态短标题**：

- `key` 必须使用系统槽位：`open_hook`、`first_escalation`、`midpoint_turn`、`pressure_lock`、`climax`、`end_hook`；可选扩展位为 `early_complication`、`late_complication`。
- `label` 是稳定职能名，例如「开卷抓手」「首次升级」，供校验、恢复和 UI 分组使用，不允许自由发明。
- `title` 是本卷定制短标题，例如「夜市夺印」，由 AI 按卷骨架动态生成。
- UI 展示优先使用 `职能 · 短标题`；旧数据没有 `title` 时回退为职能名。
- 节奏分段本身仍是卷内 AI 动态规划；hard/soft 只决定卷级规划深度，不直接决定 beat 切分。

这条规则避免两种失败：职能名完全写死导致题材模板感过重，以及职能名完全自由导致后续按 beat 重生、校验和导航失稳。

## Incremental Chapter List By Beat

节奏板仍按整卷生成，拆章默认按单个 beat 增量生成，执行合同继续按单章 JIT 补齐。这样可以让新手先拿到当前节奏段的可写章节，开始细化或开写，而不必等待整卷所有章节标题一次性生成完。

手动工作台的主路径是：如果当前聚焦 beat 尚未完整生成章节，就生成该 beat；否则生成第一个未完整 beat。`full_volume` 仍保留为高级 / 批量操作，用于一次补齐本卷全部章节标题。

`single_beat` 生成成功后只校验目标 beat 的局部覆盖，并把该 beat 合并进 `VolumePlanDocument`，保留其他已生成 beat。未生成 beat 可以继续空缺，卷状态使用 `chapter_list_partial:*` 表示本卷拆章尚未全量完成；这不是执行阻断，已经 sync 的章节仍可细化和开写。

单段生成默认不触发相邻卷 rebalance。只有本卷通过 `full_volume` 完成，或用户 / 导演显式要求校准相邻卷时，才运行相邻卷再平衡，避免每拆一段都扰动后续卷规划。

章节同步必须继续保护已有正文：自动保存走现有 `syncToChapterExecution` 路径，并保持 `preserveContent: true`、`applyDeletes: false`。重生某个 beat 时，已有正文章节默认锁定，系统只能更新无正文的规划字段。

### Auto-Director Readiness Projection

自动导演使用两个投影语义，不把它们混成一个旧的 `chapterListReady` 判断：

- `beatChapterListReady`：当前执行窗口需要的 beat 已经生成并可 sync / 细化 / 开写。
- `volumeChapterListComplete`：本卷 beat 全部生成完成。

全书或卷级自动推进可以在 `beatChapterListReady = true` 且 `volumeChapterListComplete = false` 时进入当前 beat 的章节细化和执行；当前窗口完成后，恢复点应回到 structured outline，继续生成下一个未完成 beat。这样长卷不会因为后半卷标题还没生成，就阻塞第 1 段的正文生产。

`resolveStructuredOutlineRecoveryCursor` 需要识别第一个未完成 beat，并在允许 partial ready 的自动执行路径中只选择已完成 beat 覆盖的章节。checkpoint 修复和继续运行逻辑必须保留 `volumeChapterListComplete = false` 的事实，避免把当前 beat 执行完误判为整卷 / 全书 workflow completed。

### Change Impact Scope

角色注入、局部修订和卖点调整遵守“未写范围最小扰动”：

- 已有正文覆盖的 beat 标记为 `locked_with_draft`，默认不重拆、不改写正文。
- 已生成章节但没有正文的后续 beat 标记为 `stale`，适合重排参与者、补接新角色或刷新规划字段。
- 尚未生成章节的后续 beat 标记为 `pending`，默认动作是把变化接入后续未写段。

UI 和导演事实摘要可以展示 `affectedBeats`、`staleBeatCount`、`lockedBeatCount`、`defaultImpactAction` 和 `advancedImpactActions`，但这些都是投影 / 决策摘要，不需要数据库迁移。只有结构级角色或全局卖点变化明显影响整卷战略时，才提示高级动作，例如重跑节奏板或卷战略。

## Downstream Gap

卷规划的价值最终要进入章节执行。当前已存在 `VolumeWindowContext.keyMilestoneGuards` 字段，但卷规划服务尚未完整填充它。这个缺口会导致章节生成仍可能提前兑现后续里程碑或重复卷级高潮。

后续修复应让 skeleton 或 beat sheet 生成关键里程碑守卫，并在 `volume_window` 上下文中注入目标章节范围、事件、禁止提前兑现点和节奏说明。

## Related Modules

- `shared/types/volumePlanning.ts`：动态卷数区间、hard/soft 范围和作者控制权计算。
- `shared/types/volumeBeatSlots.ts`：节奏板固定职能槽位、别名归一与展示文案。
- `server/src/services/novel/volume/volumeGenerationOrchestrator.ts`：strategy、critique、skeleton 的运行顺序和 fixed count 传递。
- `server/src/services/novel/volume/volumeGenerationHelpers.ts`：scope readiness 与 strategy/skeleton 合并规则。
- `server/src/services/novel/volume/volumeWorkspaceDocument.ts`：工作区 readiness。
- `server/src/services/novel/director/recovery/novelDirectorStructuredOutlineRecovery.ts`：自动导演 structured outline 恢复点、partial beat-ready 投影。
- `server/src/services/novel/volume/volumePlanChangeDetection.ts`：卷级变更和后续 beat 影响范围投影。
- `server/src/services/novel/dynamics/CharacterDynamicsMutationService.ts`：角色动态变更后的后续未写 beat 影响记录。
- `server/src/prompting/prompts/novel/volume/strategy.prompts.ts`：卷战略 PromptAsset。
- `server/src/prompting/prompts/novel/volume/skeleton.prompts.ts`：卷骨架 PromptAsset。
- `server/src/prompting/prompts/novel/volume/beatSheet.prompts.ts`：节奏板 PromptAsset（固定槽位 + 动态短标题）。
- `docs/wiki/prompts/novel-generation-quality-guards.md`：卷级关键节点守卫缺口。
