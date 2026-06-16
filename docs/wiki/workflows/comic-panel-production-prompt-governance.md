# 漫画分格提示词治理

## Background

漫画分格生产同时包含两类提示词：一类是分格脚本 LLM 使用的结构化 PromptAsset，决定格子数量、镜头、对白、角色引用和画面脚本；另一类是图片 provider 实际收到的最终生图 prompt，由画风、版式、角色外貌锚点、表情参考、对白气泡和单格画面脚本组合而成。

如果把所有控制都暴露成一个自由文本框，用户可以短期改图，但很容易破坏角色一致性、四格结构、对白气泡数量和下游导出契约。因此漫画分格提示词采用“可控槽位 + 可审查最终 prompt”的策略。

## Decision

分格提示词修改分为两个层级：

- 生成前控制：用户选择信息密度，并可填写本次分格补充要求。补充要求只影响表达偏好，不覆盖 schema、角色引用、画风锁定、跨话事实和输出字段。
- 生成后微调：用户可以编辑单格 `visualPrompt` 对应的画面脚本。下一次生图会使用保存后的画面脚本，但角色外貌锚点、表情引用、画风和对白气泡仍由后端统一组装。

图片 provider 的最终 prompt 保存到 `ComicPanel.imageData.prompt`，在界面中作为“上次发送给图像模型的 Prompt”展示。它是审查记录，不是用户直接编辑的主入口。

## Current Rule

分格脚本生成支持三种信息密度：

- `relaxed`：画面更舒展，优先单一动作、情绪反应、少量对白和留白。
- `balanced`：默认节奏，多数格承担一个动作或情绪转折，信息量适中。
- `compact`：剧情推进更密集，但每格仍只能有一个主视觉焦点，避免连续堆满。

确定性代码只负责枚举、长度、数量上限和参数归一化。信息密度的创作判断由结构化 LLM 输出承担，不使用关键词或正则去硬判。

四格漫画项目仍通过项目形态 `4koma` 锁定版式关键词。为了避免把一个项目生成成大量“四格页”，四格模式的默认目标格数低于条漫模式；每张图的四格起承转合结构由 `visualPrompt` 和版式关键词共同约束。

## Persistence Contract

分格提示词控制会把生成时的整话配置和单格结构化结果落库，便于后续审查、重生图和排查提示词效果。

- `ComicEpisode.scriptConfig` 保存本次分格脚本生成配置，包括 `densityMode`、`targetPanelCount`、`comicFormat`、`scriptPromptInstruction`、`promptAssetId`、`promptAssetVersion`、`provider` 和 `generatedAt`。它记录“这次脚本是按什么控制项生成的”，不是新的自由 prompt 入口。
- `ComicPanel.densityLevel` 保存 LLM 对单格信息密度的结构化判断，取值为 `low / medium / high`。`densityMode` 控制整话倾向，`densityLevel` 记录单格结果，二者不能混用。
- `ComicPanel.focus` 保存单格主视觉焦点，用于帮助用户审查画面是否聚焦，也为后续重抽和导出提供稳定摘要。
- `ComicPanel.layoutData` 保存结构化版式信息；四格模式下可记录 `four_koma` 与 `subPanels`，避免只靠一段 `visualPrompt` 承载四格起承转合。
- `ComicPanel.visualPrompt` 仍是用户可编辑的单格画面脚本；`ComicPanel.imageData.prompt` 仍是上次实际发送给图像模型的最终 prompt 审查记录。

## User Editable Boundary

允许用户编辑：

- 本次分格补充要求。
- 单格画面脚本。

不允许用户直接编辑：

- PromptAsset 的系统规则、输出 schema、contextPolicy。
- 角色引用解析、参考图注入、角色外貌锚点拼接规则。
- 图片 provider 的最终 prompt 记录。
- 跨话事实和结构化对白 schema。

如果用户修改画面脚本后重新生图，旧 `imageData.prompt` 仍代表上一次生图记录，直到新图片生成成功后才更新。

## Failure Modes

- 如果把最终 provider prompt 当成可编辑主字段，用户可能无意删除角色锚点和表情参考，导致角色崩坏。
- 如果四格结构只靠高目标格数叠加，会造成成本、格数统计和阅读节奏偏离预期。
- 如果修改单格画面脚本后不重新生图，当前图片仍是旧 prompt 的结果，界面必须用“上次发送”避免误导。
- 如果已有格子脚本被重新生成，旧格子会被替换；前端需要在已有格子时提示覆盖风险。

## Related Modules

- `server/src/prompting/prompts/comic/comic.prompts.ts`
- `server/src/services/comic/ComicPanelScriptService.ts`
- `server/src/services/comic/ComicPanelImageService.ts`
- `server/src/modules/comic/http/comicRoutes.ts`
- `client/src/pages/comic/project/EpisodeListPanel.tsx`
- `client/src/pages/comic/project/PanelsGridPanel.tsx`
