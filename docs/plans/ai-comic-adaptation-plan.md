# AI 漫画（条漫 + 漫剧）改编方案

> 状态：规划中（2026-06-12，含市场调研修正）
> 前置：`feat/drama-module` 分支短剧产线（P0-P7 已落地）
> 定位：与短剧共享「小说 IP → 视觉内容」产线的第二个输出头，
> 同一批漫画关键帧产出**条漫（静态长图）+ 漫剧（动态漫视频）**双格式

---

## 0a. 市场调研结论（2026-06-12）

### 三种形态与行业现状

1. **静态条漫/页漫**：ai-comic-factory（1.3k★，LLM+SDXL，文字用格下 caption 而非气泡）、
   Dashtoon / Anifusion 等画布编辑器型产品；学术线 DiffSensei（CVPR 2025）/ StoryDiffusion
   均为 SD 系自部署方案，2024 后基本停更，**不采用**。
2. **漫剧/动态漫**（2025-2026 真正爆发的形态）：漫画关键帧 + 程序化运镜 + TTS + BGM，
   按集发布到短剧平台（抖音/红果漫剧专区），付费解锁模型与短剧完全同构。
   代表：deep-printfilm「AI 漫剧工场」（1.8k★，活跃），四阶段 Script→Asset→Keyframe→Video。
3. 互动漫画：小众，不做。

### 行业流程范式（mandrama-production-pipeline 七段式，与各产品高度一致）

```
形式/画风规划 → 资产拆解(角色/场景/道具圣经+规范化提示词) → 分镜规划
→ 模型适配层(per-provider prompt 适配) → 一致性检查 → 质检+组装 → 重生成路由
```

对照本项目基建：七段里已有五段（SourceBundle≈资产拆解、Storyboard≈分镜、
QualityGate≈质检、RepairService≈重生成路由、CharacterImageService≈角色资产）。
原方案缺的两段：**资产圣经（场景/道具 canonical prompt）** 与 **模型适配层**，已并入 P1。

### 关键技术结论

- 角色一致性主流解法已换代：LoRA/StoryDiffusion 路线淘汰，
  标准做法是**原生多参考图模型**（即梦/Seedream、Nano Banana 系、gpt-image-1 类）。
  drama 模块已走此路线，不碰 SD/ComfyUI 自部署。
- 没人在图里生成文字：行业统一「干净画面 + 后期叠字」，与本方案 sharp+SVG 一致。
- 变现路径：漫剧走短剧平台（你已有的目标渠道）；静态条漫上漫画平台对个人门槛更高。
  **因此漫剧为主产物，条漫为同源副产物。**

---

## 0. 定位与原则

1. **双格式输出，漫剧为主**：同一批漫画关键帧 →
   ① 条漫：竖屏单列长图（webtoon 形态）；
   ② 漫剧：关键帧 + 程序化运镜（Ken Burns 推拉摇移）+ 复用 drama 的 TTS/字幕/分集导出。
   不做传统页漫的复杂分格排版。与现有竖屏短剧的市场、付费模型、节奏法则完全同构。
2. **复用优先于新建**：漫画格 ≈ 短剧关键帧 + 气泡文字。新代码集中在
   「分格脚本、气泡排版、长图导出」三处，其余全部复用 drama 已验证的模式。
3. **先抽共享层再开新模块**：避免 comic 复制 drama 一份后各自漂移。
4. **数据治理内建**（吸取 NovelSnapshot 1GB 教训）：
   图片一律落盘（`resolveGeneratedImagesRoot()` 现有模式），DB 只存路径与元数据；
   所有版本历史带上限；导出产物不进 DB。

---

## 1. 架构决策

### 1.0 边界与可拆分性约束（最高优先级，沿用 drama 既有规则）

drama 与 comic 都是独立 bounded context，**与小说生成主逻辑保持低耦合，保证后期可整体拆分**：

1. **import 禁令**：`services/comic`（及提升后的 `services/adaptation`）禁止 import 任何
   novel 领域模块（`services/novel`、`modules/novel`）。与 novel 的唯一接触点是
   `NovelSourceAdapter`，仅经 prisma（基础设施）**只读**访问小说表。
2. **CI 守卫**：复刻 `dramaDecoupling.test.js` 为 `comicDecoupling.test.js` 与
   `adaptationDecoupling.test.js`，P1 第一天先建守卫再写代码；
   同时在 novel 侧边界测试中加反向断言：novel 领域禁止 import drama/comic/adaptation。
3. **数据软引用**：comic 全部表对 Novel 零外键，`sourceRef String?` 软引用
   （沿用 `DramaProject.sourceRef` 的既有注释规范「不建外键，保证可拆分」）。
4. **拆分单元**：`adaptation（共享层）+ drama + comic` 构成一个可整体迁出的集群
   （独立服务或独立仓库时，只需带走自己的表 + 一个实现 `SourceContentPort` 的远程适配器）。
5. **drama ↔ comic 互联规则**：两模块可以互相引用**共享层（adaptation）的契约与资产**
   （角色设计稿、SourceBundle、rhythmEngine），但禁止互相 import 对方的服务实现；
   跨模块复用一律下沉到 adaptation 层。

### 1.1 共享改编基建层（Phase 0，先行）

从 drama 模块提升以下三块为来源无关的共享层（目标位置 `server/src/services/adaptation/`）：

| 现有资产 | 提升后 | 说明 |
|------|------|------|
| `drama/contracts/sourceBundle.ts` | `adaptation/contracts/sourceBundle.ts` | 文件本身已零依赖 novel 类型，纯移动 + drama 侧 re-export |
| `drama/source/*`（SourceContentPort + 3 个 Adapter） | `adaptation/source/*` | NovelSourceAdapter / OriginalSourceAdapter / TextImportSourceAdapter 直接复用 |
| `DramaCharacterImageService` 的设计稿生成核心（面部特写+三视图合图、参考图、版本历史） | `adaptation/visual/CharacterSheetService` | drama 与 comic 共用同一角色视觉资产；`DramaCharacterLibrary` 跨项目角色库同步提升 |

`services/image/provider.ts` 已是通用层，不动。
`rhythmEngine` / `paywallPlanPolicy` 是纯领域知识零依赖，comic 直接 import，暂不移动（避免一次改动面过大）。

### 1.2 comic 模块结构（对照 drama 镜像）

```
server/src/services/comic/
  ComicProjectService.ts        # 项目 CRUD + 源绑定（复用 source adapters）
  ComicEpisodePlanService.ts    # 分话规划（复用 rhythmEngine + paywallPlanPolicy）
  ComicAssetBibleService.ts     # ★新★ 资产圣经：角色/场景/道具 canonical prompt 统一管理
  ComicPanelScriptService.ts    # ★新★ 分格脚本生成（对应 DramaStoryboardService）
  visual/PromptAdapterPort.ts   # ★新★ 模型适配层：canonical prompt → per-provider 提示词
  visual/ComicPanelImageService.ts  # 单格图生成（复刻 DramaShotKeyframeService 模式）
  lettering/ComicLetteringService.ts # ★新★ 气泡定位 + 文字合成
  export/ComicExportService.ts  # ★新★ 长图拼接 + 平台切片
  motion/ComicMotionService.ts  # ★新★(P5) 漫剧合成：运镜脚本 + ffmpeg 渲染，复用 drama TTS/字幕
  ComicQualityGate.ts           # 质量门（复用 DramaQualityGate 模式）
  ComicRepairService.ts         # 重绘修复（复用 DramaRepairService 模式）
  production/ComicBatchOrchestrator.ts # 批量编排（复用 DramaBatchOrchestrator 模式）
server/src/modules/comic/http/  # 路由注册（对照 modules/drama/http）
```

---

## 2. 内容源与数据设计（与 drama 同构，深化版）

### 2.1 内容源：三个现有 + 一个新增

| 源类型 | 状态 | 说明 |
|------|------|------|
| `novel_import` | **主推路径**，复用现有 adapter | 本项目小说产出直转漫画，见 §2.2 |
| `original` | 复用 | 一句话灵感起稿 |
| `text_import` | 复用 | 外部文本（如别处写的小说）转漫画 |
| `comic_import` | ★新增★ | **上传已有漫画**，见 §2.4 |

### 2.2 主推路径：小说 → 漫画的「导入即快照」原则

drama 的既有模式：`DramaSourceBundle` 把 SourceBundle **快照落库**，运行期不回读 novel 表。
comic 沿用并强化这一原则，它同时服务两个目标：
- **可拆分性**：拆分后即使 novel 模块不在同进程/同库，已导入项目照常工作
- **稳定性**：小说后续续写/修改不会意外漂移已生成的漫画

但现有 `NovelSourceAdapter` 把章节压成 200 字摘要（`truncate(content, 200)`），
对短剧策略规划够用，**对漫画分格不够**——漫画对白需要原文级细节。解法：

```
导入时（一次性）：SourceBundle 快照（梗概/节拍/角色/硬事实）→ ComicSourceBundle
分话规划时（按需快照）：本话覆盖的章节区间（beat.sourceChapterStart/End）
  → 经 adapter 只读取出章节正文 → 快照进 ComicEpisode.sourceText
分格脚本生成时：只读 ComicEpisode.sourceText，原文对白直接提取/改写成气泡对白
```

即 `SourceContentPort` 增加一个可选方法（仍只经 prisma 只读，不破坏守卫）：

```ts
/** 按章节区间取正文（novel_import 实现；其余源类型返回 rawText 切片或空） */
loadChapterText?(ref: SourceRef, start: number, end: number): Promise<string>;
```

### 2.3 自定义与上传：全产线 origin 双来源设计

每个资产环节都支持 `generated | uploaded`，用户可在任意环节用自己的素材替换 AI 产物：

| 环节 | AI 路径 | 自定义路径 |
|------|------|------|
| 角色设计稿 | CharacterSheetService 生成 | 上传设计稿图（`sheetData.origin: "uploaded"`） |
| 画风 | 预置画风模板 | 上传风格参考图进 `stylePreset.referenceImages` |
| 分话大纲/分格脚本 | LLM 生成 | 可编辑（沿用 drama editable scripts 先例） |
| 单格画面 | 参考图生图 | **上传图替换任意格**（`imageData.origin: "uploaded"`） |
| 气泡 | 自动排版 | 前端拖拽微调 anchor 重合成 |

上传一律走现有 `imageAssetStorage` 基础设施落盘，DB 只存路径。

### 2.4 comic_import：上传已有漫画的两种语义

1. **作为内容源（续作/重制）**：上传整话/整本漫画图 → 多模态 LLM 逐页解析
   （画面描述 + OCR 对白 + 角色识别）→ 产出 SourceBundle（beats/characters/synopsis）
   → 走正常产线生成续作或重制。解析结果同样快照落库。
2. **作为资产**：从上传页中框选角色 → 提取为角色参考图（入角色库）；
   整体画风 → 提取为 stylePreset 风格参考。

MVP 先做语义 2（资产提取，简单且立刻有用），语义 1（整本解析）放 P4 之后。

### 2.5 数据模型（Prisma，与 drama 镜像）

```prisma
model ComicProject {
  id          String   @id @default(cuid())
  title       String
  sourceType  String   // novel_import | original | text_import | comic_import
  sourceRef   String?  // novelId 软引用——不建外键，保证可拆分（drama 既有规范）
  trackId     String?  // 赛道模板（复用 rhythmEngine TrackId）
  stylePreset String?  // 画风锁定 JSON：风格词/负面词/referenceImages 路径/origin
  status      String   @default("draft")
  sourceBundle ComicSourceBundle?
  episodes    ComicEpisode[]
  characters  ComicCharacter[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model ComicSourceBundle {
  // 对照 DramaSourceBundle：SourceBundle JSON 快照，导入即落库，运行期不回读 novel
  id         String   @id @default(cuid())
  projectId  String   @unique
  bundleJson String   // SourceBundle 序列化
  importedAt DateTime @default(now())
  project    ComicProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model ComicCharacter {
  // 对照 DramaCharacter：name/persona/visualAnchor
  // sheetData JSON 复用 CharacterSheetData（面部特写+三视图合图）+ origin 字段
  // sourceCharacterRef String? 软引用源角色（novel characterId）
}

model ComicEpisode {
  id           String  @id @default(cuid())
  projectId    String
  order        Int     // 第几话
  title        String?
  hookType     String? // 开场钩子（复用 HookTypeId）
  cliffhanger  String? // 收尾卡点
  isPaywalled  Boolean @default(false) // 付费卡点（复用 paywallPlanPolicy）
  outline      String? // 本话情节大纲
  sourceText   String? // ★本话覆盖章节的正文快照（§2.2，分格对白的原文依据）
  status       String  @default("draft")
  panels       ComicPanel[]
  @@unique([projectId, order])
}

model ComicPanel {
  id            String  @id @default(cuid())
  episodeId     String
  order         Int
  panelType     String? // 镜头语言：establishing/close_up/action/reaction/transition
  action        String  // 画面描述
  dialogues     String? // JSON: [{ speaker, text, bubbleType, anchorHint }]
  characterRefs String? // 角色 id 列表
  visualPrompt  String? // 图像生成提示词
  imageData     String? // JSON：status/version/url/origin(generated|uploaded)/history（上限5）
  letteredData  String? // JSON：合成气泡后的成品图路径 + 气泡布局参数
  motionData    String? // JSON（P5 漫剧）：运镜类型/时长/焦点区域
  @@unique([episodeId, order])
}

model ComicFact {
  // 对照 DramaFact：跨话一致性事实账本（服装变更/道具状态/场景状态），
  // 分格脚本生成时注入，防止跨话视觉漂移
}

model ComicUploadAsset {
  // 上传资产登记：kind(character_ref|style_ref|panel_image|imported_page)
  // + 落盘路径 + 元数据；上传内容不进 DB
}

model ComicExportJob {
  // 对照 DramaBatchJob：episodeId / 格式(strip|video) / 平台规格 / 产物路径列表 / 状态
}
```

要点：
- `imageData` 沿用 drama `keyframeData` JSON 结构（status/version/history），
  版本历史**硬上限 5 份**，裁剪时同步删盘上文件；`origin: "uploaded"` 的版本不参与自动重抽
- 所有图片走 `generated-images/comic-panels/{panelId}/` 落盘，DB 不存 base64
- 对 Novel 全部软引用零外键；角色库与 drama 共享（提升到 adaptation 层的 CharacterLibrary）

---

## 3. 实施阶段

### P0 — 打样验证（0.5 天，零开发）

用现有 drama 产线直接跑一话内容：
1. 在 drama 模块建项目 → 生成角色设计稿 → 生成一集 storyboard → 逐 shot 生成关键帧
2. 人工把关键帧拼成竖条 + 手工加气泡（任意图片工具）
3. **验收问题**：40+ 格规模下角色一致性是否达发布线？多角色同框是否崩？画风是否统一？

**这是 go/no-go 决策点**：一致性不达标则先攻关图像模型选型（见 §4.2），不进 P1。

### P1 — 共享层提升 + MVP 产线（5-8 天）

0. **边界守卫先行**（§1.0，0.5 天）：`comicDecoupling.test.js` + `adaptationDecoupling.test.js`
   + novel 侧反向断言，守卫红线建好再写业务代码
1. **Phase 0 共享层提升**（§1.1，1-2 天）：纯移动 + re-export，drama 回归测试守护
2. ComicProject / ComicCharacter / ComicEpisode / ComicPanel 模型 + 迁移
3. 项目创建流（复用 source adapters，novel_import 直连现有小说）
4. 分话规划：复用 `rhythmEngine` 钩子库 + `paywallPlanPolicy`，LLM 产出每话大纲 + 钩子 + 卡点
5. **分格脚本生成**（★核心新提示词）：每话大纲 → 40-80 格 panel 脚本
   （panelType 镜头语言 / action / dialogues 含 speaker + bubbleType / characterRefs / visualPrompt）
6. 单格图生成：复刻 `DramaShotKeyframeService`（带角色设计稿参考图 + stylePreset 风格锁定注入）

**P1 出口**：能从一本小说生成一话的全部格子图（无气泡），前端可逐格查看/重抽。

### P2 — 成稿引擎（4-6 天）

1. **气泡排版引擎**（★全新模块）：
   - LLM 在分格脚本阶段已输出 `anchorHint`（气泡大致位置：top-left/bottom-right 等九宫格 + 避开主体）
   - 合成用 `sharp` + SVG overlay：气泡形状库（对白圆泡/喊叫刺泡/思考云泡/旁白矩形条）、
     思源黑体、自动换行、按 order 从上到下保证读序
   - 规则兜底：anchorHint 缺失或冲突时按九宫格优先级顺序放置
2. **长图拼接 + 导出**：`sharp` 垂直拼接 → 按平台规格切片
   （切片高度上限可配，预置 800×{N} 通用规格），产物落盘 + ComicExportJob 记录
3. 前端：话级成稿预览（竖滚长图）+ 单格气泡微调（拖拽 anchor 重合成）

**P2 出口**：一话从大纲到可发布长图全流程跑通。

### P3 — 一致性与质量闭环（4-6 天）

1. **风格锁定**：项目级 stylePreset（统一风格词 + 负面词 + 可选风格参考图），
   注入所有 panel 的 visualPrompt；提供 3-5 个预置画风模板（黑白少年漫/彩色韩漫/水墨国风等）
2. **质量门**（复用 DramaQualityGate 模式）：多模态 LLM 抽检
   —— 角色一致性（与设计稿比对）、画风一致性、画面与 action 吻合度、肢体崩坏检测
3. **修复流**（复用 DramaRepairService 模式）：质量门标记 → 重抽（带失败原因强化提示词）→ history 版本回退
4. 合规检查：复用 `DramaComplianceService` 模式做分级内容检查

### P4 — 批量生产与运营（3-5 天）

1. 批量编排：复刻 `DramaBatchOrchestrator`（话级排队、断点续跑、失败重试）
2. 成本估算：对照 drama batch production costs 模式（每话格数 × 单图成本 + 重抽率预估）
3. 平台导出规格扩展：尺寸/格式/水印可配
4. （可选）与 drama 共享的「IP 改编工作台」入口：同一本小说并行管理短剧 + 漫画两条产线

### P5 — 漫剧合成（4-6 天，调研新增，主变现形态）

1. **运镜脚本生成**：LLM 按格内容产出每格的镜头运动
   （push_in/pull_out/pan/hold + 时长 + 焦点区域），存 `ComicPanel.motionData`
2. **ffmpeg 程序化渲染**：单格图 + zoompan 滤镜 → 片段；按对白长度对齐 TTS 音轨时长
3. **复用 drama 现成能力**：TTS 配音（`TTSProviderPort`）、字幕（srt 导出）、
   分集结构、付费卡点——漫剧的「集」直接映射 ComicEpisode
4. 集级导出：竖屏 9:16 MP4，规格对齐短剧平台（抖音/红果漫剧专区）

**P5 出口**：同一话内容一键产出「条漫长图 + 漫剧视频」双格式。

---

## 4. 关键技术点

### 4.1 气泡合成技术选型
- `sharp`（已在 Node 生态成熟）+ 手写 SVG 气泡模板，**不引入** headless 浏览器
- 字体随仓库内置（思源黑体 OFL 协议），避免跨机器渲染差异
- 文字量超气泡容量时：LLM 阶段约束单泡 ≤30 字，超长自动拆双泡

### 4.2 图像模型与一致性策略
- 现有 provider 层是 OpenAI 兼容协议（角色设计稿已用 `1536x1024` 跑通），comic 不改协议层
- 一致性三板斧（按优先级）：
  1. 角色设计稿作参考图输入（drama 已验证的路径）
  2. 多角色同框：参考图合图（沿用「面部特写+三视图合一张」的现成合图模式）
  3. stylePreset 全局风格词锁定 + 质量门抽检兜底
- P0 打样若不达标，评估支持多参考图的模型（通过现有 provider settings 配置接入，不改架构）

### 4.3 数据治理红线
- panel 图片、气泡成品、导出切片全部落盘；DB 字段只存相对路径 + 元数据 JSON
- `imageData.history` 上限 5 版，裁剪时同步删盘上文件
- ComicExportJob 产物按保留策略清理（保最近 3 次导出）

---

## 5. 工作量与里程碑

| 阶段 | 内容 | 估算 |
|------|------|------|
| P0 | 现有产线打样验证（go/no-go） | 0.5 天 |
| P1 | 共享层提升 + MVP 格子产线 | 5-8 天 |
| P2 | 气泡排版 + 长图导出 | 4-6 天 |
| P3 | 风格锁定 + 质量闭环 | 4-6 天 |
| P4 | 批量生产 + 运营配套 | 3-5 天 |
| P5 | 漫剧合成（运镜 + TTS + 集级导出） | 4-6 天 |
| 合计 | | **21-32 天** |

每阶段末跑一次 drama 模块回归（共享层提升只发生在 P1，但守护持续）。

---

## 6. 风险与对策

| 风险 | 等级 | 对策 |
|------|------|------|
| 80 格规模下角色一致性崩 | 高 | P0 先验证再立项；设计稿参考图 + 合图 + 质量门三层兜底；关键格允许人工重抽 |
| 气泡排版质量不稳定 | 中 | LLM anchorHint + 九宫格规则兜底 + 前端拖拽微调，三层退化路径 |
| 画风跨话漂移 | 中 | 项目级 stylePreset 锁定，质量门画风抽检 |
| 共享层提升破坏 drama | 中 | 纯移动 + re-export 策略，drama 测试全量回归后才合入 |
| 图片资产膨胀重蹈 1GB 覆辙 | 中 | §4.3 红线在 P1 落地，不留到「以后再治理」 |
| drama 分支未合主线导致基线漂移 | 低 | comic 基于 feat/drama-module 续建，或先推动 drama 合入主线再开工（推荐后者） |

---

## 7. 明确不做（本期范围外）

- 传统页漫复杂分格排版（多格嵌套、跨页大图）
- 动态漫画 / 漫画转视频（那是 drama 产线的事）
- AI 自动精修上色 / 线稿分层
- 多语言植字（结构上 dialogues 与图分离已预留，但本期只做中文）
