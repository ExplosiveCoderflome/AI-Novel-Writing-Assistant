# 漫画角色视觉资产管线

## Background

漫画分格图生成需要在“角色一致性”和“情绪表达”之间同时保持稳定。单一三视图只能锁定发型、服装和体型，无法覆盖漫画格子里高频出现的开心、愤怒、悲伤、惊讶、冷漠等表情；多人同框时整张三视图还会稀释面部信息，降低参考图对模型的约束强度。

## Decision

漫画角色模块采用分层资产策略：

- `visualAnchor` 保存结构化视觉锚点，`description` 控制在短句内，用于每格提示词注入。
- `character-sheet` 是角色三视图资产，服务单角色格和基础外貌一致性。
- `character-expression` 是六表情横排资产，服务情绪准确性。
- `character-face` 是从三视图左侧面部区域裁切出的派生资产，服务多人同框格。

这些资产继续挂在 `ComicCharacter.sheetData` 中，表情稿状态放在 `sheetData.assets.expression`，避免为了早期资产扩展引入数据库迁移。

## Current Rule

分格脚本的 `characterRefs` 应输出对象数组，而不是仅输出角色名：

```json
[
  {
    "name": "沈剑心",
    "costume": "default",
    "expression": "cold",
    "lighting": "side_lit"
  }
]
```

`expression` 由结构化 LLM 分格输出决定，可选值为 `neutral`、`happy`、`angry`、`sad`、`surprised`、`cold`。不要用固定关键词或正则从对白文本后处理推断表情；如果表情选择不准，应调整 Prompt Schema、提示词或结构化输出约束。

## Reference Injection

单角色格优先注入完整三视图。多人同框格优先注入每个角色的面部裁切图，降低参考图噪声。若对应表情稿已生成，再追加该角色当前 `expression` 的表情裁切图。

参考图裁切是派生缓存：源图更新后，裁切文件按修改时间自动刷新。派生文件不进入数据库正文，只通过角色图片服务解析磁盘路径并交给图片 provider 以 multipart 方式上传。

## Character Sheet Tuning

角色三视图允许在已生成资产上继续微调。微调时优先使用上一版 `sheetData.prompt` 作为可编辑提示词；如果旧资产没有保存提示词，前端应填入包含角色外貌锚点的推荐提示词，避免用户从空白文本框开始猜提示词结构。

用户修改提示词后重新生成时，默认启用样貌锁定。服务端会把 `visualAnchor.description` / `visualAnchor.hint` 追加为角色身份锁定段，要求图片 provider 保持同一张脸、发型、体型、服装配色和标志特征。若存量角色没有外貌锚点，前端可通过 `appearanceOverride` 传入用户临时填写的样貌锁定词；只有用户明确关闭 `lockAppearance` 时，微调提示词才允许完全脱离原外貌锚点。

如果用户选择“使用当前三视图作为参考图”，服务端会把当前本地三视图作为 `refImagePaths[0]` 传给图片 provider。

微调生成成功后仍遵守版本归档规则：旧三视图进入 history，新图成为当前三视图。不要新增本地上传链路来替代这个默认路径；本阶段的“原角色图参考”指当前已生成三视图。

## Character Workspace UI

角色资产页采用“左侧角色列表 + 右侧当前角色详情”的工作台结构。左侧只承担选择和状态速览，右侧集中展示当前角色的三视图、表情稿、外貌锚点、三视图提示词和微调入口。

这个结构服务角色生产任务，而不是展示卡片墙：用户每次只需要判断一个当前角色是否具备主设计稿、表情稿和可复用提示词。已有三视图的角色应在详情区打开提示词微调；未生成三视图的角色只保留明确的生成主入口，表情稿入口应在主设计稿可用后再开放。

生成分格脚本前，前端应提示缺少三视图的角色。该提示不是硬阻断，因为分格脚本仍可依赖 `visualAnchor` 文本继续生成；但它应明确告诉用户，缺少三视图会降低后续格子图的外貌一致性。这个提示属于制作准备状态，不应替代后端的角色引用和参考图注入规则。

## Character Asset Library

除了系统派生的三视图/表情稿/面部裁切，角色可拥有用户级别的「可选视觉资产」：服装变体、武器、道具、载具、技能视觉、其他。资产独立成 `ComicCharacterAsset` 表（`assetType / name / description / imageData / sortOrder`），可 AI 生成或直接上传图片。

资产的关键边界：

- 命名是引用键。LLM 在分格脚本里通过 `characterRefs[].costume="战斗套装"` 或 `characterRefs[].props=["月光剑"]` 按名字引用，匹配回 `ComicCharacterAsset.name`。`costume` 的 schema 因此从枚举改为 string，`props` 是新增的可选字符串数组（最多 4 个，避免格子图信息过密）。
- 资产图作为参考图，不影响 `visualAnchor`。资产图描述的是物件外形，不是角色脸；不要把"穿着 X 服装"塞进 visualAnchor，会污染所有视图。
- AI 生成资产图时，若角色已有三视图，会把三视图作为参考传给图像模型，让资产的色彩、风格与角色统一。
- 分格脚本 prompt 会带「角色可用资产」清单，明确告知 LLM "服装填资产名（如战斗套装），props 填道具/武器名列表"。

## Sprite Sheet Reference

格子图生图时，**每个出场角色**会按本格 `characterRefs[i]` 把以下素材现场合成一张横向雪碧图：

```
[三视图] | [当前服装] | [道具 1] | [道具 2] | ...
```

由 `ComicSpriteSheetService` 用 sharp 拼接，最多 5 列；每列底部带 SVG 标签（角色名/资产名）。生成临时 PNG 后传给图像 provider 作为 `refImagePaths`，生图完成后立即清理。

雪碧图的设计意图：把"该角色当前应该长什么样、穿什么、拿什么"打包成单一参考图，比给图像模型传 3-4 张独立参考图更稳——模型不需要自己理解"这张是身体、这张是武器"的对应关系。

雪碧图本身不持久化，但其组成的素材元数据会写入 `imageData.referenceImages: PanelReferenceImageMeta[]`（`{ kind, label, url }`），供前端格子图弹窗溯源展示。

## Visual Anchor Editor

`visualAnchor` 是所有生图链路（三视图/表情稿/资产/格子图）的源头。用户在角色页可直接编辑：

- **主外貌描述**（`visualSpec.appearance`）：完整版，含脸型/体格/服饰/标志细节，约 60-2000 字。生图链路优先读这个，而不是早期的 40 字精简 `description`。
- **脸型强覆盖**（`visualSpec.faceShapeOverride`）：可选独立字段。当 `appearance` 含"锐利如刀刻""三角眼"等与期望脸型矛盾的人设描述时（如反派必须保留凶相眼神），用此字段强压脸型。

`faceShapeOverride` 在生图 prompt 里以 `*** FINAL FACE SHAPE OVERRIDE (highest priority, ignore conflicting words in appearance above) ***` 形式出现，并附明确指令「眼神/表情层的锐利保留，骨架按 OVERRIDE 来」。三处生图入口（`buildSheetPrompt` / `buildExpressionPrompt` / `buildAppearanceLockPrompt`）都注入。

`appearance` 的 prompt 位置也已重排：从原来的"画风词之后"提到"画风词之前"，并加骨相级强约束（`THIS SPECIFIC CHARACTER must have the following exact appearance ... do NOT replace facial features with generic idealized beauty template`），让"这个角色长什么样"主导画面，避免不同角色都退回韩漫模板美型脸。

## AI-Assisted Visual Anchor Rewrite

角色页提供「AI 协助优化外貌锚点」按钮，对应 `comicVisualAnchorRewritePrompt`（注册在 prompting 模块）。

- 输入：当前 `appearance` + 当前 `faceShapeOverride`（若有）+ 用户可选 `userInstruction`（"脸更圆但保留反派凶相"等）。
- 输出结构化：`{ appearance, faceShapeOverride?, rationale }`。AI 会消除内部矛盾词、保留人设亮点、用骨相级具体词重写；当矛盾构成人设关键时，选择"保留眼神层的锐利、把脸型/下颌/颧骨改成用户期望"的策略，并在 `faceShapeOverride` 输出额外脸型强压片段。
- **不直接落库**。返回给前端审阅，用户确认后才走标准 `updateCharacterVisualAnchor` 写库。这是有意设计：AI 重写涉及创作判断（如何调和"反派"和"圆脸"），不能由 AI 单方面决定。

## Failure Modes

- 如果角色没有三视图，格子图仍会注入 `visualAnchor` 文本，但一致性弱于图像参考。
- 如果角色没有表情稿，格子图仍可生成，但该格情绪主要依赖文字提示和模型理解。
- 如果三视图微调勾选了参考图但当前图不存在，生成应退回纯提示词模式，不阻断用户继续生成。
- 如果角色没有 `visualAnchor` 且用户没有填写 `appearanceOverride`，三视图微调无法锁定外貌锚点，只能依赖用户提示词和参考图。
- 如果多人同框继续使用整张三视图，模型容易混淆角色面部和服装细节；应使用面部裁切图。
- 如果 `characterRefs` 回退为字符串数组，系统会兼容读取，并按 `default + neutral` 处理，但新脚本应输出对象结构。
- 如果 `appearance` 含大量与期望脸型矛盾的人设词（"锐利如刀刻""三角眼"）且用户只在 `appearance` 末尾追加"圆脸"，模型仍会被前置/数量更多的锐利词主导。应使用 `faceShapeOverride` 字段，或调用 AI 协助重写做矛盾消除。
- 如果 `characterRefs[].props` 引用了不存在的资产名，雪碧图合成会跳过该道具，prompt 中只保留文字"持有 X"，不阻断生图。

## Related Modules

- `server/src/prompting/prompts/comic/comic.prompts.ts`：分镜 schema、AI 重写 prompt
- `server/src/services/comic/ComicCharacterImageService.ts`：三视图/表情稿，外貌锚点抽取
- `server/src/services/comic/ComicCharacterAssetService.ts`：用户资产 CRUD + 生图 + 上传
- `server/src/services/comic/ComicSpriteSheetService.ts`：雪碧图合成
- `server/src/services/comic/ComicPanelImageService.ts`：生格子图参考图组装 + 素材元数据记录
- `server/src/services/comic/ComicProjectService.ts`：`updateCharacterVisualAnchor` / `rewriteCharacterVisualAnchor`
- `server/src/services/comic/comicStylePrompt.ts`：统一画风关键词来源（避免多处硬编码韩漫）
- `server/src/modules/comic/http/comicRoutes.ts`
- `client/src/pages/comic/ComicProjectPage.tsx`、`client/src/pages/comic/project/CharactersPanel.tsx`

角色资产进入分格生图链路后的提示词治理规则见 [漫画分格提示词治理](./comic-panel-production-prompt-governance.md)。场景一致性的对偶设计见 [漫画场景一致性管线](./comic-scene-consistency.md)。
