# 自动导演本书世界准备

## Background

自动导演的主目标是帮助新手从书级方向进入可开写状态。世界观不是所有题材都必需，但在玄幻、科幻、悬疑、克苏鲁等强设定项目中，角色、势力、地点和冲突需要在同一套世界约束下生成。若角色准备早于世界准备，角色会缺少阵营、舞台、规则边界，后续章节再补世界时容易出现设定漂移。

## Decision

自动导演规划链固定为：

`Story Macro -> Book Contract -> 本书世界准备 -> 角色准备 -> 分卷策略 -> 章节任务单`

本书世界准备放在 Book Contract 之后，因为世界应服从整书商业承诺、读者预期和不可违背约束；放在角色准备之前，因为角色阵容需要先读取世界门面中的势力、地点、硬规则和禁用组合。

## Current Rule

- 用户选择参考世界样本时，自动导演沿用该 `worldId`，通过 `WorldContextGateway` 确保本书世界实例和角色用途 `StoryWorldSlice` 可用。
- 用户未选择参考世界样本时，默认根据宏观规划与书级约定自动生成本书 `NovelWorld`，不保存到外部世界库。
- 用户选择“暂不使用世界观”时，`world_setup` 作为 no-op 完成，后续 Gateway 继续允许返回 `null`。
- `worldSetupMode=skip` 必须同时作用于恢复起点判断和 Pipeline 顺序执行。即使任务从 `story_macro` 或 `book_contract` 恢复后继续向后推进，也不得再执行 `book.world.prepare`；否则会把用户明确跳过世界观的选择重新变成强制世界准备。
- 从角色准备或后续阶段恢复时，如果世界准备未完成且未选择跳过，安全起点回退到 `world_setup`。
- 自动导演只依赖 `WorldContextGateway`，不直接调用旧的小说世界生成入口，也不把自动生成结果推入外部世界库。
- `world_setup` 是独立的正式工作流阶段，页面恢复目标为 `world`。流程导航固定显示在“故事宏观规划”和“角色准备”之间；世界观生成、AI 检查、完善、重新生成与保存确认都只读写该阶段的本书世界观资产。
- 逐步查看模式在 `book.world.prepare` 完成后写入 `step_review_required`，当前阶段、当前项和恢复 Tab 都必须为 `world_setup/world`。审查上下文读取世界观资产及其来源数据，不得借用角色准备上下文。
- 自动继续模式不在世界观步骤额外停顿；完成世界准备后直接进入角色准备。选择“暂不使用世界观”时，此阶段作为已完成的空步骤显示，角色准备继续使用轻设定路径。
- 历史任务不做数据迁移。投影与接管按“显式 `world_setup` 阶段或世界观步骤 ID 优先；已绑定本书世界观视为完成；未绑定且尚未完成角色阶段时回到世界观准备”的顺序推断。

## Failure Modes

- 如果恢复逻辑只检查故事宏观规划、Book Contract 和角色数量，可能会从 `character_setup` 跳过世界准备，导致强设定项目的角色生成缺少世界约束。
- 如果自动生成世界默认保存到世界库，会把一次性书内设定污染为通用世界样本，并引入不必要的同步语义。
- 如果角色准备直接读取旧扁平字段，会绕过本书世界 slice，导致导入世界、生成世界和跳过世界三种路径行为不一致。

## Related Modules

- `server/src/services/novel/director/novelDirectorPipelineRuntime.ts`
- `server/src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts`
- `server/src/services/novel/director/recovery/novelDirectorRecovery.ts`
- `server/src/services/novel/worldContext/WorldContextGateway.ts`
- `client/src/pages/novels/components/NovelAutoDirectorSetupPanel.tsx`
