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
- 分话标题、梗概、结尾悬念和付费卡点。
- 单格画面脚本。
- 跨话事实库中明显不准确的条目。

不允许用户直接编辑：

- PromptAsset 的系统规则、输出 schema、contextPolicy。
- 角色引用解析、参考图注入、角色外貌锚点拼接规则。
- 图片 provider 的最终 prompt 记录。
- 跨话事实和结构化对白 schema。

如果用户修改画面脚本后重新生图，旧 `imageData.prompt` 仍代表上一次生图记录，直到新图片生成成功后才更新。

如果 `ComicPanel.updatedAt` 晚于 `imageData.generatedAt`，说明画面脚本或格子元数据在上次生图后被修改。前端应提示“待重抽”，避免用户误以为当前图片已经使用新脚本。

## Cross-Episode Facts

分格脚本生成后会沉淀跨话事实，服务后续分话的连续性控制。事实类别保持结构化：`completed` 表示已经发生的剧情，`revealed` 表示首次出现或揭示的信息，`state_changed` 表示角色、关系、资源或局势变化。

事实库是用户可审阅的连续性资产，不是自由大纲编辑器。用户可以删除错误事实；新增、分类和上下文注入仍应由结构化分格生成与事实服务负责，避免手工条目破坏后续提示词的可信度。前端展示时应按话序分组，让用户能快速定位事实来源。

## Review Views

分格页同时保留格子视图和条带阅读视图。格子视图用于批量检查单格状态、密度、焦点和重抽入口；条带视图用于按阅读流检查画面连续性、对白覆盖和成图效果。

条带视图是审阅入口，不改变底层格子顺序、提示词记录和生图状态。重抽仍使用同一套 `ComicPanel.visualPrompt`、角色引用、对白气泡和 provider prompt 组装规则。

## Dialogue Bubble Rules

气泡内文字渲染是漫画体验的关键。本项目的强约束：**气泡里只能渲染台词正文，不允许出现说话人名、"说/道"等动词、冒号、引号或任何旁白前缀**——这些都属于剧本叙述层，不属于气泡层。

三层防御保证这条规则：

1. **分镜 prompt 源头预防**：`comicPanelScriptOutputSchema.panels[].dialogues[]` 拆分为 `{ speaker, text, bubbleType, anchorHint }`，render 中加规则 2b 明确告知 LLM「`text` 字段只能包含台词正文，不要加"XX说"、"XX道"、姓名、冒号、引号或叙述前缀」。
2. **生图 prompt 重写**：`buildDialoguePrompt` 把 `speaker` 改为「气泡尾巴指向 XX」的方向信息，气泡内文字框死为「气泡内文字仅为「{text}」」；并在 prompt 顶部强制声明气泡渲染规则。
3. **防御性剥离**：`stripSpeakerPrefix` helper 在生图前剥离 `text` 中已有的「XX说：」「XX：」、首尾引号等模式，兼容历史脏数据 + LLM 偶尔违规。

`speaker` 在 schema 中保留，是因为它决定气泡尾巴方向（指向画面中哪个角色）；但绝对不进气泡内的渲染文字。

## Style Keywords (Single Source)

漫画相关图像生成统一从 `server/src/services/comic/comicStylePrompt.ts` 的 `resolveComicStyleKeywords(stylePresetRaw)` 取画风关键词，**禁止再在角色/资产/场景服务中硬编码"manga/webtoon"**。这点曾经长期是漏洞：项目选了"水墨国风"，但三视图/表情稿/资产图照样生成彩色韩漫，与最终格子图风格冲突。

注意区分 `stylePreset.style`（画风：webtoon_color / ink_traditional / shounen_bw 等）与 `stylePreset.promptKeywords`（漫画形态：竖条漫 / 四格等）。**前者注入到角色/资产/场景；后者只注入到最终格子图**——因为角色/资产/场景 reference sheet 不是某种"漫画版式"，不该带"竖条漫"这类形态词。

## Reference Image Metadata

生格子图时，`finalRefImagePaths` 中实际用到的素材会同步收集为 `PanelReferenceImageMeta[]` 写入 `imageData.referenceImages`：

```ts
{ kind: "character_sheet" | "character_expression" | "character_face" | "asset" | "scene", label: string, url: string }
```

`url` 直接指向已有的 HTTP 端点（如 `/api/comic/character-images/{id}/sheet`、`/api/comic/character-assets/{id}/image`、`/api/comic/scenes/{id}/image`），前端格子图弹窗用缩略图网格展示，点击可在新标签打开大图。

这个机制纯粹是溯源用的元数据，不影响生图行为本身。雪碧图（每角色现场合成的临时 PNG）不持久化，元数据记录的是它的**组成素材**（哪个角色三视图 + 哪几个资产），不是雪碧图本身——这样省盘、且素材本身已经在角色/资产 tab 可见，溯源体验更轻量。

## World Settings Synchronization (WorldNotes)

在小说改编漫画工作流中，维持原小说的世界观设定（势力定位、法则铁律、重要地理等）对分分镜与生成图片至关重要。

1. **源数据提取与格式化**：`NovelSourceAdapter` 会查询小说关联的 `NovelWorld` 数据，并将 `structuredDataJson` 字段中的世界背景、核心设定、氛围基调、世界法则、主要阵营和重要地理地标格式化为清晰的 markdown 文本，写入 `SourceBundle.worldNotes` 字段。
2. **提示词链路传递**：当生成漫画分格脚本时，`ComicPanelScriptService` 会在 `generatePanelScript` 方法中提取内容源的 `worldNotes`，并将其作为 `worldNotes` 参数传给 `comicPanelScriptPrompt` 大模型模版。
3. **大模型约束渲染**：在分格大模型提示词模版中，世界设定会作为独立段落 `## 世界观与背景设定（请严格遵守其地理、法则、阵营等规则）` 注入到 HumanMessage 中。这在分镜和动作设计层面就先消除了场景与设定漂移，保证生成的画面描述与小说设定完全一致。

## Failure Modes

- 如果把最终 provider prompt 当成可编辑主字段，用户可能无意删除角色锚点和表情参考，导致角色崩坏。
- 如果四格结构只靠高目标格数叠加，会造成成本、格数统计和阅读节奏偏离预期。
- 如果修改单格画面脚本后不重新生图，当前图片仍是旧 prompt 的结果，界面必须用"上次发送"避免误导。
- 如果已有格子脚本被重新生成，旧格子会被替换；前端需要在已有格子时提示覆盖风险。
- 如果跨话事实没有来源话序或类别，后续分格提示词无法判断它是剧情事实、揭示信息还是状态变化，容易造成连续性误导。
- 如果 LLM 把"XX说"塞进 `dialogues[].text`，气泡里会出现叙述前缀。stripSpeakerPrefix 是兜底，但根因应通过 prompt 工程改进，不要依赖 regex。
- 如果新加生图入口未走 `comicStylePrompt`，画风会回退到 webtoon 模板，与项目画风冲突。新生图链路必须接入这个单一来源。

## Related Modules

- `server/src/prompting/prompts/comic/comic.prompts.ts`
- `server/src/services/comic/ComicPanelScriptService.ts`
- `server/src/services/comic/ComicPanelImageService.ts`
- `server/src/modules/comic/http/comicRoutes.ts`
- `client/src/pages/comic/project/EpisodeListPanel.tsx`
- `client/src/pages/comic/project/PanelsGridPanel.tsx`
