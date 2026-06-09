# 改编模块规划：小说 →（可选）剧本 → 竖屏付费短剧 → 分镜 → AI 视频

> 状态：规划草案 v1
> 日期：2026-06-09
> 关键决策（已确认）：
> 1. 短剧形态 = **竖屏付费短剧**（80-100 集、每集 1-2 分钟、黄金 3 秒、每集钩子、付费卡点）
> 2. 产物链路 = **延伸到 AI 视频生成**（文字台本 → 分镜 → 视频提示词 → 外部视频能力）
> 3. 剧本中间层 = **可选**，允许小说直达短剧

---

## 0. 一句话定位

新增 **改编（Adaptation）模块**：以「小说」为唯一内容源（source of truth），向下游派生「剧本（可选保真层）」「竖屏付费短剧分集台本」「分镜」「视频提示词」四类改编产物，全程复用现有的世界观 / 角色 / 事实账本 / 写法引擎 / Director 工作流 / JIT / 质量闸基建。

---

## 1. 核心设计判断

### 1.1 这不是「三段格式转换」，而是「两类不同操作」

| 环节 | 性质 | 难度 | 复用现有资产 |
|------|------|------|------------|
| 小说 → 剧本 | **保真媒介转换**：正文 → 场景(时/地/内外景)+动作+对白+潜台词 | 中 | 高：Fact Ledger / 角色 / 世界观直接保证不走样 |
| 小说/剧本 → 短剧 | **节奏重构再创作**：竖屏付费短剧有独立叙事法则，需重组而非压缩 | 高 | 复用底层事实，但节奏引擎全新做 |
| 短剧 → 分镜 | **视听拆解**：台本 → 镜头序列(景别/运镜/时长) | 中 | 复用角色视觉锚点 |
| 分镜 → 视频提示词 | **媒介再编码**：镜头 → 视频生成提示词 | 中 | 依赖外部视频能力，定抽象接口 |

**结论**：改编 pipeline 本质是 Director 分阶段工作流的平移 + 一个全新的「竖屏付费短剧节奏引擎」。

### 1.2 小说是唯一内容源，改编产物各自独立建模

- 小说 = source of truth，改编产物只「引用」不「篡改」原著硬事实。
- 一部小说 → 多个改编产物（1:N）：可以同时有「保真剧本」「短剧 A（甜宠向）」「短剧 B（逆袭向）」。
- 不要把改编产物塞进 `Chapter`：剧本场景 / 短剧分集 / 镜头的结构与章节差异巨大，独立建模更清晰。

### 1.3 一致性靠「改编映射表 + 事实账本复用」

短剧会重组节奏（合并/拆分/重排章节），重组后仍要能对回原著：
- **AdaptationMap**：记录「短剧第 N 集 ← 源自小说第 X–Y 章」，支撑一致性回溯、增量重改、视频角色锚点继承。
- **复用 NovelFactService**：改编生成时注入源小说 Fact Ledger，约束「硬事实不走样」；同时允许「爽点强化」式的受控偏离（在策略层显式声明）。

---

## 2. 数据建模（Prisma 新增）

> 全部通过 `sourceNovelId` 关联到 `Novel`，遵循现有 cuid + onDelete:Cascade 约定。

```
// ── 可选保真层：通用剧本 ──
model Screenplay        // 一部小说的一个剧本改编产物
  id, sourceNovelId, title, format(标准/fountain), status, createdAt
model Scene             // 剧本场景
  id, screenplayId, order, slugline(时/地/内外景), action, sourceChapterRange

// ── 核心：竖屏付费短剧 ──
model ShortDrama        // 短剧改编项目
  id, sourceNovelId, title, orientation(竖屏付费), targetEpisodes,
  adaptationStrategy(JSON: 定位/主爽点线/付费卡点分布/改编偏离声明), status
model Episode           // 分集
  id, shortDramaId, order, title, content(台本), 
  hookOpening(黄金3秒钩子), cliffhanger(集尾卡点), isPaywall(是否付费卡点集),
  beatSheet(JSON: 集内节拍), durationSec, status, qualityFlags
model AdaptationMap     // 改编映射（集 ← 源章节区间）
  id, shortDramaId, episodeId, sourceChapterStart, sourceChapterEnd, note

// ── 视听层 ──
model Storyboard        // 一集的分镜
  id, episodeId, status
model Shot              // 镜头
  id, storyboardId, order, shotSize(景别), cameraMove(运镜), durationSec,
  dialogue, visualDescription, characterRefs(JSON 角色视觉锚点)
model VideoPrompt       // 视频生成提示词
  id, shotId, prompt, negativePrompt, refImageAssetId, providerParams(JSON),
  generationStatus, resultAssetId

// ── 一致性（复用事实账本思路，按改编维度）──
// 方案：直接复用 NovelFactEntry（按 sourceNovelId 读取）；
//      短剧侧只读不写，新增改编偏离声明存在 ShortDrama.adaptationStrategy
```

枚举新增：`AdaptationProductType(screenplay|short_drama)`、`EpisodeStatus`、`ShotSize`、`VideoGenStatus`。

---

## 3. 生成 Pipeline（仿 Director 分阶段）

### 3.1 主链路 A：小说 → 短剧（直达，最高价值，先做）

```
阶段1  改编策略规划 AdaptationStrategyPlanning
       输入：源小说 framing/storyMacro/角色/世界观（走分层上下文装配）
       输出：短剧定位、目标集数、主爽点线、付费卡点分布、改编偏离声明
            （声明「为节奏可对原著做哪些受控改动」）

阶段2  分集大纲 EpisodeOutlinePlanning
       输出：每集 = {黄金3秒钩子 + 核心冲突 + 集尾cliffhanger + 源章节映射}
            写入 AdaptationMap；标注付费卡点集

阶段3  逐集台本生成 EpisodeScripting（JIT，仿 ChapterPlanJITService）
       每集执行前即时生成；注入：源小说 Fact Ledger + 角色 + 世界观 
            + 前序集摘要 + 本集大纲；输出竖屏台本（强对白/强动作/快节奏）

阶段4  短剧专用质量闸 EpisodeQualityGate
       校验：黄金3秒钩子是否成立、集尾卡点强度、单集时长(对白量估算)、
            爽点密度、与源小说硬事实是否冲突（复用 fact 校验）
       不合格 → 走 patch 风格的单集修复（仿 ChapterPatchRepairService）
```

### 3.2 视听链路 B：短剧 → 分镜 → 视频

```
阶段5  分镜拆解 StoryboardSegmentation
       每集台本 → 镜头序列（景别/运镜/时长/台词/画面描述 + 角色视觉锚点）

阶段6  视频提示词 VideoPromptGeneration
       每镜头 → 视频生成提示词（画面/运镜/时长/角色一致性锚点/negative）

阶段7  视频生成对接 VideoGenerationAdapter（抽象接口，留扩展）
       定义 VideoProvider 接口；先接 1 家（如可灵/即梦/Runway 任一），
       其余按 provider 注册；复用现有 ImageGenerationTask 的任务/轮询模式
```

### 3.3 可选保真层 C：小说 → 剧本

```
阶段  场景切分 → 场景转写（剧本格式）→ 一致性校验
      独立 pipeline，复用同一套上下文装配与质量闸；导出 fountain/PDF
```

---

## 4. 复用 vs 新建清单

### 直接复用（不改或薄改）
- `runStructuredPrompt` + `PromptAsset` 模式
- `NovelFactService`（改编一致性，按 sourceNovelId 只读）
- `GenerationContextAssembler` 的分层上下文 + `BatchContextCache`
- Director workflow 框架（分阶段 / 检查点恢复 / 门控）
- JIT 即时生成模式（→ 逐集台本）
- Quality Gate + Patch Repair 框架（→ 单集质量闸 + 单集修复）
- `ImageGenerationTask` 任务/轮询模式（→ 视频生成任务）
- `modules/export`（→ 剧本/短剧/分镜导出 mapper）

### 新建
- `modules/adaptation/{http,...}` + `services/adaptation/`
- 竖屏付费短剧**节奏引擎**（钩子/卡点/爽点密度规则）— 核心新增
- `AdaptationContextAssembler`（在小说分层上下文上叠加改编策略层）
- `EpisodePlanJITService`、`EpisodeQualityGateService`
- 提示词资产：`adaptation.strategy / episodeOutline / episodeScript / storyboard / videoPrompt`
- `VideoProvider` 抽象接口 + 首个 provider 适配
- 前端「改编工作台」

---

## 5. 分期实施路线

| Phase | 目标 | 关键交付 | 价值/风险 |
|-------|------|---------|----------|
| **P0 骨架** | 数据建模 + 模块骨架 | Prisma 新模型迁移、`modules/adaptation` 空骨架、`services/adaptation` 接口 | 低风险，地基 |
| **P1 短剧 MVP** | 小说→短剧直达 | 策略规划 + 分集大纲 + 逐集台本（竖屏付费节奏引擎）+ AdaptationMap | **最高价值，先做** |
| **P2 一致性闭环** | 改编不走样 + 增量重改 | Fact 复用校验、单集质量闸（钩子/卡点）、单集修复、按集重生成 | 决定可用性 |
| **P3 分镜层** | 台本→分镜 | Storyboard/Shot 生成 + 分镜视图 | 视听化第一步 |
| **P4 视频层** | 分镜→视频 | VideoPrompt 生成 + VideoProvider 接口 + 首个 provider | 依赖外部能力 |
| **P5 剧本保真层（可选）** | 小说→通用剧本 | Screenplay/Scene + fountain/PDF 导出 | 补全，非阻塞 |

> 建议 MVP 收敛在 **P0+P1+P2**：跑通「小说 → 可生成、可校验、可重改的竖屏付费短剧分集台本」，先验证改编质量，再向视听层延伸。

---

## 6. 前端规划

- **入口**：novel 工作台下游新增「改编」入口（与章节执行平级），或独立 `/adaptations` 模块。
- **短剧项目页**：分集列表（钩子/卡点徽标）+ 单集台本编辑 + 改编映射回溯（点集看源章节）+ 单集重生成。
- **分镜视图**：镜头序列卡片（景别/运镜/时长/画面）。
- **视频视图**：提示词 + 生成任务状态（复用任务中心样式）。
- 复用 `chapterEditor` 的编辑器/候选/快照交互，台本编辑几乎可平移。

---

## 7. 关键风险与对策

| 风险 | 对策 |
|------|------|
| 短剧改编是「再创作」，易偏离原著 | AdaptationMap + Fact Ledger 约束硬事实；策略层显式声明「受控偏离」边界 |
| 钩子/卡点质量难自动评估 | 短剧专用 Quality Gate：钩子3秒成立性、卡点悬念强度、爽点密度打分；阈值不过走单集修复 |
| 角色跨集视觉一致性（视频尤甚） | Shot.characterRefs 锚定角色视觉资产（复用 ImageAsset）；分集继承同一锚点 |
| 单集时长控制（1-2 分钟） | 台本生成按对白/动作量估算时长，质量闸校验；超长触发压缩修复 |
| 视频生成依赖外部能力且多变 | 先定 `VideoProvider` 抽象接口，首期只接 1 家，其余按 provider 注册扩展 |

---

## 8. 待定决策（实施前再确认）

1. **首个视频 provider 选型**（可灵 / 即梦 / Runway / 本地）—— 影响 P4 适配工作量。
2. **短剧节奏引擎是否做成可配置规则集**（爽点类型库 / 卡点模板库），还是先硬编码一套竖屏付费法则。
3. **改编一致性是否需要独立 AdaptationFactEntry**，还是只读复用 NovelFactEntry（当前倾向后者，更轻）。
4. **是否需要「短剧反推大纲」能力**（导入已有爆款短剧 → 拆解节奏模板，喂给改编引擎），可作为 P2+ 的增强。

---

## 9. 验收标准（MVP / P0-P2）

- [ ] 选定一部已生成小说，一键创建竖屏付费短剧改编项目，产出策略 + 分集大纲（含 AdaptationMap）。
- [ ] 逐集生成台本，每集含黄金 3 秒钩子与集尾卡点，付费卡点集被正确标注。
- [ ] 单集质量闸能拦截「无钩子 / 卡点弱 / 时长超标 / 与原著硬事实冲突」并触发修复。
- [ ] 任一集可单独重生成，不破坏其余集；改编映射可回溯到源章节。
- [ ] 短剧台本可导出为分集台本文档。
