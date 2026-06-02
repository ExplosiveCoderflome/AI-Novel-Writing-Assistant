# 世界骨架生成流程

## Background

世界库的默认创建流程面向写作新手。旧流程以分层字段和表单式补全为主，用户需要理解 `background`、`geography`、`factions` 等字段职责，才能判断一个世界是否可用于小说创作。这会增加认知负担，也会导致世界设定在势力、地点、关系和开局入口上承载不足。

## Decision

默认世界生成流程以“世界骨架”为主产物，而不是旧式扁平字段草稿。流程为：

`世界意图 -> 世界规模 -> 骨架预览 -> 保存世界`

骨架生成直接产出结构化世界数据，包含核心规则、阵营、具体势力、关键地点、势力关系、地点连接、故事入口和完整度诊断。旧扁平字段只作为兼容展示，由结构化数据派生。

## Current Rule

- 默认入口使用 `world.skeleton.generate@v1`。
- 用户可选择 `轻量舞台`、`标准长篇`、`复杂群像` 三个规模预设。
- 用户可微调核心规则、阵营方向、具体势力、关键地点、关系/冲突、故事入口数量。
- 生成结果必须满足数量约束，特别是势力和地点数量不能少于用户要求。
- 地点必须具备地图可绘制信息，包括相对坐标、方位、风险、控制势力和故事作用。
- 势力关系和地点连接必须进入结构化关系，不依赖后续可视化临时猜测。
- 分层生成仍保留为世界手册中的补洞和局部重写能力，不作为默认创建主流程。
- 对已有可信骨架的世界，六层整理必须从结构化骨架派生中文写作摘要，不能重新调用旧分层 Prompt 生成第二套世界内容。
- `metadata.seededFrom=legacy-text` 的结构只表示旧字段反推结果，不能作为覆盖六层摘要的可信主源，避免旧字段中的 JSON 文本或脏数据反向污染世界骨架。

## Failure Modes

- 如果 Prompt 只返回旧字段或百科式段落，说明调用错了旧 `world.draft.generate@v1`。
- 如果势力数量、地点数量不符合用户设置，应修 Prompt schema 或 postValidate，而不是在前端隐藏缺口。
- 如果地图只能环形排布，优先检查 `locations` 是否缺少 `x/y/directionHint`，以及 `relations.locationConnections` 是否为空。
- 如果 RAG 混入无关知识库内容，应检查世界生成调用是否只传入用户明确选择的参考上下文。
- 如果点击“重新整理六层摘要”后出现 JSON、括号残片、异常势力名或地点数骤降，优先检查 `structureJson.metadata.seededFrom` 是否被旧分层流程改成 `legacy-text`；应从可信快照或骨架源恢复，而不是继续基于污染结构生成。

## Related Modules

- `shared/types/worldWizard.ts`
- `shared/types/world.ts`
- `server/src/prompting/prompts/world/worldDraft.prompts.ts`
- `server/src/services/world/worldSkeletonGeneration.ts`
- `client/src/pages/worlds/WorldGenerator.tsx`
