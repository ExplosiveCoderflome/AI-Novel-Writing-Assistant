# 漫画场景一致性管线

## Background

漫画长篇连载里，同一处场景（如"宗门大殿""路远破屋"）会在跨格、跨话之间反复出现。早期分格脚本只把场景信息埋在每格的自由文本 `visualPrompt` 里，每格独立描述，措辞必然漂移：墙面材质、家具、地标、色调全不可控。`ComicFact` 虽然会把"首次出现地点"提取成 `revealed` 文字事实，但只是文字，无图、无强约束。生格子图时参考图只有角色雪碧图，背景纯靠模型自由发挥。

角色一致性已通过三视图 + 资产库 + 雪碧图参考解决，场景需要做同等强度的强化——但不能照搬：场景是背景而不是主体，每格景别/机位/光照都在变；如果把一张固定场景图当强参考传给模型，模型会把"那个机位的那张图"硬画进每一格，导致镜头僵死、每格都像同一张照片。

## Decision

采用 **L0 场景圣经 + L1 多视角设定图** 双层方案。

- **L0 场景实体化（地基）**：分镜阶段两步化——LLM 先识别本话场景清单（最多 8 个，跨话同名复用），再分格，每格带 `sceneRef`。每个场景结构化保存「场景圣经」JSON：`{ palette, keyElements, materials, ambiance, layout }`。生格子图时把 bible 文字拼成场景描述注入提示词，文字层面就先消除大部分漂移。
- **L1 多视角设定图（视觉锚）**：每个场景生成一张方形十字四宫格设定图——左上全景、右上反打、左下核心区中景、右下材质/色板/光照特写。四象限强约束为同一空间、一致色板材质光照。生格子图时作为**低权重第二参考图**与角色雪碧图并列，prompt 显式分离"空间身份"与"本格镜头"，明确告知模型「场景参考图仅锁定色调/布局/材质，镜头与构图必须严格按本格画面内容自由运镜，不要照搬参考图的机位」，防止机位僵死。

跨话同名场景天然复用同一 `ComicScene` 行，免费获得跨话延续，不需要额外的"场景接续"机制。

## Current Rule

### 数据模型

`ComicScene` 表（独立模型，由 `ComicProject.scenes[]` 关联）：

```prisma
model ComicScene {
  id          String   @id @default(cuid())
  projectId   String
  name        String   // panel.sceneRef 软引用此名（不建外键，保证可拆分）
  sceneType   String   @default("interior")  // interior | exterior | landscape | abstract | other
  bible       String?  // JSON { palette, keyElements, materials, ambiance, layout }
  sheetData   String?  // JSON { status, url, prompt, provider, generatedAt, origin: "generated"|"uploaded" }
  sortOrder   Int      @default(0)
  ...
}
```

`ComicPanel.sceneRef String?`：本格所属场景名（软引用 `ComicScene.name`），按名匹配而非外键，符合 comic 模块"软引用、可拆分"的耦合约束。

### 分镜两步化

`comicPanelScriptOutputSchema` 顶层加 `scenes: Scene[]`（max 8），`panelScriptSchema` 加 `sceneRef?: string`。`render` 函数明确两步指令：

1. 先识别本话场景，给出 `name / sceneType / palette / keyElements / materials? / ambiance? / layout?`
2. 连续空间归为同一场景（如"竹林外围→竹林深处"），避免每格一个场景导致碎片化
3. 提供「项目已有场景」清单时，本话出现同地点必须沿用相同 `name`，不要新建近义名
4. 每格 panel 的 `sceneRef` 必须取自上面 scenes 清单的某个 name

服务层在事务内 upsert：**已存在同名场景的 bible 不会被覆盖**，只对不存在的新场景建草案。这保证跨话沿用同一 bible，且用户在场景库 tab 手动编辑过的 bible 在重新生成分格脚本时不会被 LLM 覆盖。

### 生格子图注入

`ComicPanelImageService` 按 `panel.sceneRef` 找对应 `ComicScene`：

1. **L0 文字注入**：bible 拼成 `场景设定【name】：色调 X，标志元素 Y，材质 Z，氛围 W，空间 V` 注入 `buildPanelPrompt`，位置在角色描述之后、对白之前。
2. **L1 设定图注入**：`scene.sheetData.status === "done"` 时，把场景设定图路径追加进 `finalRefImagePaths`，与角色雪碧图并列（共享 `slice(0, 4)` 上限）。
3. **机位防僵死**：检测到有场景参考图时，prompt 追加固定句「场景参考图仅用于锁定色调、布局与材质身份，镜头角度、景别与构图必须严格按本格画面内容自由运镜，不要照搬参考图的机位」。

参考素材元数据 `{ kind: "scene", label: "场景:宗门大殿", url }` 写入 `imageData.referenceImages`，供前端格子图弹窗溯源展示。

### 场景设定图布局

四宫格生图 prompt 强约束：

```
ONE single square image divided by a cross into a 2x2 grid of four quadrants,
top-left: wide establishing shot of the whole space,
top-right: an alternate angle / reverse view of the same space,
bottom-left: medium shot of the core area with the key landmarks and furniture,
bottom-right: close-up of materials, color swatches and lighting mood,
all four quadrants depict the SAME location with IDENTICAL palette, materials, architecture and lighting,
environment concept art, NO characters or only tiny background figures
```

生图尺寸 `1024x1024`（方形让四宫格均衡），画风从 `comicStylePrompt.resolveComicStyleKeywords()` 注入项目画风（webtoon_color / ink_traditional / shounen_bw 等），不再硬编码韩漫。

## Examples

- 一话提到主角先在「宗门大殿」对峙，再去「后山竹林」练剑：LLM 应输出 2 个场景（不是 8 个），每格按对应场景写 `sceneRef`。
- 第二话主角回到宗门大殿：LLM 看到「项目已有场景」清单含"宗门大殿"，应直接沿用同名，不要新建"宗门正殿""主殿"等近义名。
- 用户在场景库手动编辑"宗门大殿"的 bible（如把氛围改成"夜晚被烧毁后冒烟"），下次生成同话脚本不会覆盖此编辑；下次该场景的格子图会按新 bible 生图。

## Failure Modes

- **场景碎片化**：LLM 把"竹林外围"和"竹林深处"识别成两个场景。规则已在 prompt 明示"连续空间归一"，但仍可能发生。用户可在场景库手动删除或合并。
- **机位僵死**：如果设定图的某个象限构图非常强势，模型可能照搬。"自由运镜"提示是缓解措施；若严重，可降低参考图权重（删除场景设定图，只保留 bible 文字）。
- **场景设定图与单格画面冲突**：场景被改造（如大殿着火），原设定图仍展示完好状态。需用户重新生成设定图，或临时停用该场景图。

## Related Modules

- `server/src/services/comic/ComicSceneService.ts`：场景 CRUD + 设定图生成 + 上传 + 文件服务
- `server/src/services/comic/ComicPanelScriptService.ts`：upsert 场景 + 写 sceneRef
- `server/src/services/comic/ComicPanelImageService.ts`：bible 文字 + 设定图参考图注入
- `server/src/prompting/prompts/comic/comic.prompts.ts`：分镜两步化 schema + render
- `client/src/pages/comic/project/ScenesPanel.tsx`：场景库 tab

## Source Documents

- 漫画工作台 v0.3.20 一致性强化（2026-06-18 release notes）
- `comic-character-asset-pipeline.md`：角色端同构方案，本文是场景端对偶
