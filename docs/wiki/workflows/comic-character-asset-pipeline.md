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

角色三视图允许在已生成资产上继续微调。微调时默认使用上一版 `sheetData.prompt` 作为可编辑提示词，用户修改后重新生成；如果用户选择“使用当前三视图作为参考图”，服务端会把当前本地三视图作为 `refImagePaths[0]` 传给图片 provider。

微调生成成功后仍遵守版本归档规则：旧三视图进入 history，新图成为当前三视图。不要新增本地上传链路来替代这个默认路径；本阶段的“原角色图参考”指当前已生成三视图。

## Failure Modes

- 如果角色没有三视图，格子图仍会注入 `visualAnchor` 文本，但一致性弱于图像参考。
- 如果角色没有表情稿，格子图仍可生成，但该格情绪主要依赖文字提示和模型理解。
- 如果三视图微调勾选了参考图但当前图不存在，生成应退回纯提示词模式，不阻断用户继续生成。
- 如果多人同框继续使用整张三视图，模型容易混淆角色面部和服装细节；应使用面部裁切图。
- 如果 `characterRefs` 回退为字符串数组，系统会兼容读取，并按 `default + neutral` 处理，但新脚本应输出对象结构。

## Related Modules

- `server/src/prompting/prompts/comic/comic.prompts.ts`
- `server/src/services/comic/ComicCharacterImageService.ts`
- `server/src/services/comic/ComicPanelImageService.ts`
- `server/src/modules/comic/http/comicRoutes.ts`
- `client/src/pages/comic/ComicProjectPage.tsx`
