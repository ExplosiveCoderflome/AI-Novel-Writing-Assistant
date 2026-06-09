# 短剧创作平台详细实施计划

更新日期：2026-06-09

关联草案：

- `.claude/plan/novel-to-shortdrama-adaptation.md`
- `.claude/plan/novel-to-shortdrama-adaptation-1.md`

## 1. 背景与目标

短剧模块不应只是小说模块的下游改编按钮，而应成为一个以「竖屏付费短剧」为核心产物的独立创作平台。内容来源可以是本系统小说、原创灵感或任意导入文本；平台自带角色资源、节奏引擎、台本产线、质量闸与后续视听生产链。

本计划的目标是把草案中的 DramaForge 方向落成可执行蓝图：

- 保持 `drama` 为独立 bounded context，业务层不依赖 `novel` 内部服务。
- 以 `SourceBundle` 作为内容源防腐层，统一小说导入、原创和文本导入。
- 优先跑通 MVP：小说导入 -> 标准内容包 -> 策略 -> 分集大纲 -> 逐集台本 -> 质量闸 -> 导出。
- 为后续原创短剧、角色库、分镜、视频生成和独立部署保留清晰边界。

## 2. 当前执行状态

截至 2026-06-09，本计划已推进到 Phase 6 纵向骨架：短剧项目、三类内容源、防腐层、策略、分集、台本、质量闸、修复、导出、角色库、分镜、视频提示词、mock VideoProvider 和通用 HTTP VideoProvider 已具备 API 与类型验证。前端工作台已能覆盖主路径入口、下一步引导、质量问题汇总和视频任务状态；服务级主链路契约已覆盖“台本 -> 质量可修复 -> 修复 -> 分镜 -> 视频提示词 -> provider 任务”，具体供应商深度适配与浏览器端完整验收仍未完成。

| 范围 | 当前状态 | 证据与缺口 |
| --- | --- | --- |
| 独立路由 | 已有骨架 | `server/src/app.ts` 已挂载 `/api/drama`，`server/src/modules/drama/http/dramaRoutes.ts` 提供项目、内容包装配、赛道、钩子、策略、分集大纲接口。 |
| 独立服务目录 | 已有骨架 | `server/src/services/drama/` 下已有 `contracts/`、`source/`、`engine/`、策略服务和分集大纲服务。 |
| 防腐层 | 已有纵向骨架 | 已有 `SourceContentPort`、`SourceBundle`、`NovelSourceAdapter`、`OriginalSourceAdapter` 和 `TextImportSourceAdapter`。 |
| 低耦合守卫 | 已有测试 | `server/tests/dramaDecoupling.test.js` 检查 `services/drama` 不 import novel 领域路径。 |
| Prisma schema | 已补齐到视频提示词 | `schema.prisma` 与 `schema.sqlite.prisma` 中已有 `DramaProject`、`DramaSourceBundle`、`DramaCharacter`、`DramaEpisode`、`DramaFact`、`DramaCharacterLibrary`、`DramaStoryboard`、`DramaShot`、`DramaVideoPrompt`，并补齐双数据库 migrations。 |
| 节奏引擎 | 部分完成 | 已有赛道模板、钩子库、默认付费卡点策略和情绪曲线目标。规则仍是代码常量，尚未支持可编辑规则库或种子数据管理。 |
| 策略/分集大纲 | 已收口 Prompt 注册 | 短剧 PromptAsset 已迁入 `server/src/prompting/prompts/drama/` 并注册。 |
| 台本产线 | 已有后端骨架 | 已新增上下文装配、逐集台本生成、单集修复和 Markdown/JSON 导出 API。 |
| 质量闸 | 已有后端骨架 | 已新增短剧质量闸 PromptAsset 与 `qualityFlags` 写入；`repairable` 与 `blocked` 会进入 `needs_repair`，避免可修复台本直接进入分镜和视频阶段。 |
| 多内容源 | 已有后端骨架 | `original` / `text_import` 已接入 AI 结构化 SourceBundle adapter。 |
| 角色资源 | 已有后端骨架 | 可导入 SourceBundle 角色、编辑项目角色、保存到角色库、从角色库导入。完整角色工作台仍待做。 |
| 前端工作台 | 主路径已可用，仍需浏览器验收 | `/drama` 与 `/drama/projects/:id` 已覆盖创建向导、小说选择、AI 赛道推荐、素材补充建议、下一步任务卡、分集台本、质量问题、角色、分镜视频和导出入口；仍缺完整浏览器端验收。 |
| 分镜/视频/剧本保真 | 分镜与视频链路已到通用 provider adapter | 已新增分镜、镜头、视频提示词、mock VideoProvider、通用 HTTP VideoProvider 和 provider 选择/状态汇总，并用服务级契约测试锁定修复优先于视频生产。具体供应商深度适配与剧本保真层仍未实现。 |

## 3. 产品边界

### 3.1 用户目标

目标用户仍然是缺少影视剧作经验的创作新手。短剧模块必须降低认知负担，而不是要求用户理解爽点曲线、付费卡点、分镜语言或视频提示词工程。

核心体验应是：

```text
选择内容来源
  -> 系统整理可拍短剧素材
  -> 选择或接受推荐赛道
  -> AI 给出短剧策略
  -> AI 分集规划
  -> AI 逐集写出台本
  -> 系统检查钩子、卡点、时长和事实一致
  -> 用户可编辑、重生成、导出
```

高级能力如角色库、分镜、视频生成应服务于这个主路径，不能把短剧模块扩展成泛用聊天或泛用视频工具。

### 3.2 内容源

短剧核心只消费标准化 `SourceBundle`，不直接消费小说、外部文本或用户灵感。

```text
novel_import
  -> NovelSourceAdapter
original
  -> OriginalSourceAdapter
text_import
  -> TextImportSourceAdapter
       |
       v
SourceBundle
       |
       v
Drama core pipeline
```

三类来源的差异只存在于 adapter 和 Bundle 质量闸。策略、分集、台本、质量闸、导出、分镜和视频提示词都应复用同一条核心产线。

## 4. 架构边界

### 4.1 目录结构目标

```text
server/src/modules/drama/
  http/
    dramaRoutes.ts

server/src/services/drama/
  contracts/
    sourceBundle.ts
    dramaDtos.ts
  source/
    SourceContentPort.ts
    NovelSourceAdapter.ts
    OriginalSourceAdapter.ts
    TextImportSourceAdapter.ts
  character/
    DramaCharacterService.ts
    DramaCharacterLibraryService.ts
  engine/
    rhythmEngine.ts
    rhythmRuleCatalog.ts
  pipeline/
    DramaStrategyService.ts
    DramaEpisodeOutlineService.ts
    DramaScriptService.ts
    DramaExportService.ts
    DramaContextAssembler.ts
  quality/
    DramaQualityGate.ts
    DramaRepairService.ts
  visual/
    DramaStoryboardService.ts
    DramaVideoPromptService.ts
    VideoProviderPort.ts
```

新增文件时应优先进入上面的责任目录，避免继续在 `services/drama` 根目录堆同前缀文件。

### 4.2 依赖规则

- `server/src/services/drama/**` 不得 import `server/src/services/novel/**`、`server/src/modules/novel/**` 或 novel 业务内部类型。
- `NovelSourceAdapter` 是唯一允许理解小说数据形状的 drama 文件，但也只能通过 Prisma 只读读取小说表，不调用 novel service。
- `drama` 可以复用平台基础设施：Prisma、LLM provider、`runStructuredPrompt`、任务队列、ImageAsset、文件导出工具。
- `drama` 自己拥有事实账本、角色资源、质量闸和上下文装配，不复用小说模块业务服务。
- 前端 `/drama` 不挂在小说详情页内部；小说页可以提供“转短剧”入口，但创建后进入独立短剧工作台。

### 4.3 Prompt Governance

短剧产品级 prompt 必须遵守项目 Prompt Governance：

- 新增或迁移到 `server/src/prompting/prompts/drama/`。
- 在 `server/src/prompting/registry.ts` 注册，包含明确 `id`、`version`、`taskType`、`mode`、`contextPolicy` 和 `outputSchema`。
- 服务层通过已注册 PromptAsset 调用结构化输出。
- 不在业务服务内新增未注册的 `systemPrompt` / `userPrompt` 字符串。
- 结构化失败应修 prompt、schema、JSON repair 或上下文装配，不得加关键词 fallback 隐藏失败。

当前短剧 `strategy` 和 `episodeOutline` prompt 已是 PromptAsset 形态，但位置和注册方式需要收口。

## 5. 数据模型计划

### 5.1 MVP 必需模型

MVP 需要先补齐并迁移以下模型：

```prisma
model DramaProject
model DramaSourceBundle
model DramaCharacter
model DramaEpisode
model DramaFact
```

要求：

- SQLite 与 PostgreSQL schema 保持一致。
- migrations 与 migrations.sqlite 都必须有对应建表 SQL。
- `DramaProject.sourceRef` 只能是软引用，不与 `Novel` 建外键。
- `DramaFact` 初始化自 `SourceBundle.hardFacts`，后续台本生成与质量闸也写入短剧自有事实。
- `DramaEpisode` 需要支持 `planned -> scripting -> scripted -> reviewed -> needs_repair -> approved` 状态流。

### 5.2 P4-P7 扩展模型

角色库和视听产线进入后再新增：

```prisma
model DramaCharacterLibrary
model DramaStoryboard
model DramaShot
model DramaVideoPrompt
model DramaScreenplay
model DramaScene
```

这些模型不得在 MVP 早期阻塞台本产线，但字段设计必须保留角色视觉锚点和源映射：

- `DramaShot.characterRefs` 指向 `DramaCharacter` 软引用。
- `DramaVideoPrompt` 读取角色 `visualAnchor`，不重新推断外貌。
- `DramaScreenplay` 和 `DramaScene` 是可选保真层，不应成为短剧 MVP 的前置依赖。

## 6. 核心 Pipeline

### 6.1 标准流程

```text
CreateProject
  -> AssembleSourceBundle
  -> ImportCharactersAndFacts
  -> GenerateStrategy
  -> GenerateEpisodeOutline
  -> GenerateEpisodeScript
  -> QualityGate
  -> RepairOrApprove
  -> Export
```

### 6.2 SourceBundle 装配

`assembleSourceBundle(projectId)` 必须完成：

1. 读取 project source。
2. 通过 registry resolve adapter。
3. 产出 `SourceBundle`。
4. 写入 `DramaSourceBundle`。
5. 初始化或同步 `DramaCharacter`。
6. 初始化 `DramaFact`。
7. 写入 bundle 质量状态。

Bundle 质量闸至少检查：

- `synopsis` 不为空。
- `beats` 足以支撑目标集数，或明确需要 AI 扩展。
- `characters` 包含主角和主要阻力角色。
- `hardFacts` 不出现明显冲突。
- `text_import` 的 raw text 不超过模型上下文预算，超长文本需要先摘要/切块。

### 6.3 策略规划

策略输出必须包含：

- `positioning`：这部短剧卖给谁、卖什么爽点。
- `mainPleasureLine`：贯穿全剧的主爽点线。
- `paywallPlan`：免费集区间、首付费点、关键付费反转集。
- `emotionCurveTarget`：蓄势与释放分布。
- `trackFit`：赛道匹配理由和赛道禁忌。
- `deviationDeclaration`：相对来源故事允许的改编偏离边界。

确定性引擎负责约束付费卡点和赛道规则，LLM 负责把来源故事转成可执行策略。

### 6.4 分集大纲

每集大纲必须包含：

- `order`
- `title`
- `hookOpening`
- `hookType`
- `conflict`
- `cliffhanger`
- `emotionNet`
- `sourceBeatRefs`
- `expectedDurationSec`
- `paywallRole`

`isPaywall` 不信任 LLM 输出，由 `RhythmEngine` 根据项目付费策略确定。

### 6.5 逐集台本

新增 `DramaScriptService`，按单集 JIT 生成台本。输入包括：

- 项目策略。
- 本集大纲。
- 角色资源与说话风格。
- `DramaFact` 当前事实。
- 前 1-3 集摘要。
- 相关 `SourceBeat` 和 `sourceMap`。
- 目标时长、竖屏场景限制和对白密度要求。

输出至少包含：

```ts
{
  content: string;
  durationSec: number;
  sceneCount: number;
  opening3s: string;
  endingCliffhanger: string;
  newlyIntroducedFacts: Array<{
    text: string;
    category: "completed" | "revealed" | "state_changed";
  }>;
  episodeSummary: string;
}
```

保存时更新 `DramaEpisode.content`、`durationSec`、`status`，并把新事实写入 `DramaFact`。

### 6.6 质量闸与修复

新增 `DramaQualityGate`，默认每集台本生成后执行。质量闸不应自动阻断整部短剧流程，除非没有可用台本或出现数据完整性风险。

检查维度：

| 维度 | 判断 |
| --- | --- |
| 黄金 3 秒 | 开场是否存在冲突、悬念或反差。 |
| 黄金 30 秒 | 30 秒内是否说清谁、目标、阻力。 |
| 信息密度 | 是否存在大段环境说明、低价值铺垫或无冲突对白。 |
| 付费卡点 | `isPaywall` 集是否有足够强的反转或未完成问题。 |
| 情绪曲线 | 是否长期低位憋屈无释放，或过早泄掉大爽点。 |
| 时长 | 是否落在配置时长区间。 |
| 事实一致 | 是否与 `DramaFact` 冲突。 |
| 角色一致 | 角色说话风格、动机和关系是否漂移。 |

输出：

```ts
{
  status: "approved" | "repairable" | "continue_with_warning" | "blocked";
  score: {
    hook: number;
    density: number;
    paywall: number;
    emotion: number;
    duration: number;
    consistency: number;
    overall: number;
  };
  flags: Array<{
    severity: "low" | "medium" | "high" | "critical";
    code: string;
    evidence: string;
    suggestion: string;
  }>;
  repairPlan?: {
    mode: "patch" | "regenerate";
    instruction: string;
  };
}
```

修复规则：

- 默认最多自动修复一次。
- 修复后仍可用但有问题时，记录 `qualityFlags`，状态可为 `reviewed` 或 `needs_repair`，不阻塞后续集。
- 只有无可用台本、事实严重冲突无法自动处理、或用户选择严格模式时才停止。

## 7. 前端计划

### 7.1 路由与入口

- 新增独立 `/drama` 工作台。
- 小说详情页只提供“创建短剧项目”入口，创建后跳转 `/drama/projects/:id`。
- 顶层导航可加入“短剧”入口，体现这是独立模块。

### 7.2 页面结构

```text
/drama
  项目列表
  新建项目

/drama/projects/:id
  概览
  来源与策略
  分集
  角色
  质量问题
  导出
  后续：分镜 / 视频
```

### 7.3 新建项目向导

新手默认流程：

1. 选择内容来源：导入小说、原创短剧、粘贴文本。
2. 输入标题或选择小说。
3. 选择赛道；系统可根据来源推荐。
4. 设置目标集数，默认 80 集。
5. 点击“生成短剧策略”。

UI copy 必须从用户视角说明下一步能得到什么，不写实现迁移、模块拆分或“已升级”类描述。

### 7.4 工作台能力

- 策略卡：定位、主爽点线、付费卡点、情绪曲线。
- 分集列表：集号、标题、钩子、卡点、情绪净值、质量状态。
- 单集编辑器：台本正文、重生成、质量检查、质量问题提示。
- 源映射：显示该集对应的来源节拍或小说章节。
- 角色页：角色卡、说话风格、视觉锚点、声音档案。
- 导出：Markdown / JSON，后续可扩展 screenplay 格式。

## 8. 分阶段实施

### Phase 0：文档、迁移与 P0 收口

目标：让现有后端骨架成为可部署、可验证的 P0。

任务：

- 将本计划作为 docs 下的正式实施蓝图。
- 为现有 `Drama*` 模型补齐 PostgreSQL 和 SQLite migrations。
- 确认 Prisma Client 生成后 `dramaProject`、`dramaEpisode` 等模型可用。
- 把已有短剧 prompt 迁入 `server/src/prompting/prompts/drama/` 并注册。
- 保留并扩展低耦合守卫测试。
- 新增 source registry 行为测试：未注册 source 必须返回可解释错误。

完成标准：

- `pnpm --filter @ai-novel/server typecheck` 通过。
- `node --test server/tests/dramaDecoupling.test.js` 通过。
- migrations 能创建 `Drama*` 表。
- Prompt Workbench 能列出短剧策略和分集大纲 prompt。

### Phase 1：MVP 后端主链路

目标：以 `novel_import` 跑通短剧台本 MVP。

任务：

- 完成 `NovelSourceAdapter` 的内容质量补强，纳入世界设定和章节摘要边界。
- 新增 `DramaContextAssembler`。
- 新增 `DramaScriptService` 和台本 PromptAsset。
- 新增 `DramaQualityGate` 和质量 PromptAsset。
- 新增 `DramaRepairService`，支持单集 patch 或重生成。
- 新增 `DramaExportService`，导出分集 Markdown / JSON。
- API 增加：
  - `POST /api/drama/projects/:id/episodes/:order/script`
  - `POST /api/drama/projects/:id/episodes/:order/review`
  - `POST /api/drama/projects/:id/episodes/:order/repair`
  - `GET /api/drama/projects/:id/export`

完成标准：

- 选择一部小说可以生成 SourceBundle。
- 可以生成策略和 1-12 集分集大纲。
- 任一 planned episode 可以生成台本并保存。
- 质量闸能写入 `qualityFlags`。
- 单集可重生成。
- 可导出已生成分集文档。

### Phase 2：前端 MVP 工作台

目标：用户不通过接口也能完成短剧 MVP 主路径。

任务：

- 新增 client drama API。
- 新增 `/drama` 项目列表和新建项目向导。
- 新增项目工作台，覆盖策略、分集、单集编辑和导出。
- 分集列表显示钩子、付费卡点、情绪净值和质量状态。
- 单集页支持生成、重生成、质量检查和编辑保存。

完成标准：

- 用户能从 UI 创建小说导入短剧项目。
- 用户能在 UI 中完成内容包装配、策略生成、分集大纲、单集台本生成和导出。
- 页面文案符合 UI Copy Rules。

### Phase 3：多内容源

目标：证明短剧模块不是小说附属功能。

任务：

- 新增 `OriginalSourceAdapter`，从灵感、题材、赛道生成 SourceBundle。
- 新增 `TextImportSourceAdapter`，从粘贴文本解析 SourceBundle。
- 新增 Bundle 质量闸，不合格时给出补充问题或自动摘要修复。
- UI 新建项目向导支持三种来源。

完成标准：

- 原创输入可以生成 SourceBundle 并进入同一条短剧产线。
- 文本导入可以生成 SourceBundle 并进入同一条短剧产线。
- 三种 source 在策略、分集、台本阶段复用同一套服务。

### Phase 4：角色资源与角色库

目标：支撑短剧角色复用和视频一致性。

任务：

- 新增 `DramaCharacterLibrary` 模型和迁移。
- 新增角色 CRUD、角色库导入、项目角色保存到库。
- 角色字段补齐 archetype、speechStyle、visualAnchor、voiceProfile。
- 台本生成注入角色说话风格，质量闸检查角色漂移。

完成标准：

- 用户可以编辑项目角色。
- 用户可以从角色库复用短剧人设。
- 台本和后续分镜读取同一份角色视觉锚点。

### Phase 5：分镜层

目标：把台本转为可拍摄或可视频生成的镜头序列。

任务：

- 新增 `DramaStoryboard`、`DramaShot` 模型和服务。
- 台本 -> 镜头序列 PromptAsset。
- 每个 shot 包含景别、角色、动作、对白摘要、时长、视觉锚点引用。
- UI 新增分镜视图。

完成标准：

- 已生成台本的 episode 可以生成 storyboard。
- 每个 shot 能回溯到角色视觉锚点和台本文段。

### Phase 6：视频提示词与 Provider

目标：为 AI 视频生成接入做抽象，不锁死单一供应商。

任务：

- 新增 `DramaVideoPrompt` 模型。
- 新增 `VideoProviderPort`。
- 新增首个 provider adapter。
- 镜头 -> 视频提示词 PromptAsset。
- 任务状态接入任务中心或 drama 自有任务投影。

完成标准：

- 单个 shot 可以生成视频提示词。
- provider 任务状态可查询。
- provider 替换不影响 drama 核心 pipeline。

### Phase 7：剧本保真层

目标：支持通用剧本和更专业导出，但不阻塞 MVP。

任务：

- 新增 `DramaScreenplay`、`DramaScene`。
- 支持台本 -> 场景化剧本转换。
- 支持 screenplay Markdown / JSON / 后续行业格式导出。

完成标准：

- 用户可以选择分集台本导出或剧本保真导出。
- 剧本层不会破坏现有短剧分集台本链路。

## 9. 测试与验证

### 9.1 后端测试

必须覆盖：

- `services/drama` 低耦合守卫。
- `台本 -> 质量闸 -> 修复 -> 分镜 -> 视频提示词 -> provider 任务` 的服务级主链路契约，特别是 `repairable` 质量结果必须先进入修复队列。
- `SourceContentRegistry` 注册、resolve、未注册错误。
- `NovelSourceAdapter` 能从小说数据生成 SourceBundle。
- `RhythmEngine` 卡点计算和赛道钩子推荐。
- 策略和分集大纲 prompt schema 验证。
- `DramaScriptService` 保存台本并写入 facts。
- `DramaQualityGate` 对无钩子、弱卡点、超时长、事实冲突给出结构化 flags。
- 单集 repair 只影响目标 episode。
- 导出包含标题、集号、台本、钩子、卡点和质量标记。

### 9.2 前端测试

必须覆盖：

- `/drama` 项目列表可加载空态和已有项目。
- 新建项目三种 source 表单校验。
- 项目工作台能展示策略、分集和角色。
- 单集生成中、成功、失败、需要修复状态。
- 导出按钮状态与错误提示。

### 9.3 手工验收脚本

MVP 验收至少执行一次：

1. 选择一部已有小说。
2. 创建短剧项目。
3. 装配 SourceBundle。
4. 生成策略。
5. 生成 12 集大纲。
6. 生成第 1 集台本。
7. 执行质量闸。
8. 对第 1 集重生成或修复一次。
9. 导出 Markdown。
10. 确认 drama 数据不需要 novel 外键即可保存。

## 10. 风险与收口规则

| 风险 | 收口规则 |
| --- | --- |
| 短剧模块重新耦合小说业务 | 保留 CI 守卫；新增依赖前先判断是平台基础设施还是 novel 业务。 |
| prompt 散落在服务里 | 所有短剧 PromptAsset 迁入 prompting registry。 |
| 多内容源只做 API 字段不做 adapter | Phase 3 前不得把 `original` / `text_import` 宣称完成。 |
| 质量闸阻塞整部生产 | 本地质量债默认记录并继续，只有无可用内容或数据完整性风险才停。 |
| 前端变成专家工具 | 默认推荐赛道、默认集数、默认卡点策略；高级配置折叠。 |
| 视频 provider 锁死 | 只通过 `VideoProviderPort` 接入，provider 字段不写进核心策略。 |
| 规则库硬编码难迭代 | MVP 可先常量化；进入 P3/P4 后迁为可编辑规则库或种子数据。 |

## 11. MVP 验收清单

- [ ] `services/drama` 不直接 import novel 业务模块，低耦合守卫通过。
- [ ] `Drama*` schema 和 migrations 在 SQLite / PostgreSQL 下同步存在。
- [ ] 短剧 PromptAsset 位于 `server/src/prompting/prompts/drama/` 并注册。
- [ ] 小说导入可以产出标准 `SourceBundle`。
- [ ] SourceBundle 初始化 `DramaCharacter` 和 `DramaFact`。
- [ ] 节奏引擎能按赛道和付费策略产出确定性卡点。
- [ ] 策略生成成功写入 `DramaProject.strategy`。
- [ ] 分集大纲成功写入 `DramaEpisode`，包含钩子、卡点、情绪净值和源映射。
- [ ] 单集台本可 JIT 生成、保存、重生成。
- [ ] 质量闸能识别无钩子、弱卡点、情绪曲线问题、时长问题和事实冲突。
- [ ] 修复失败时记录质量债，不默认阻断后续集。
- [ ] 短剧台本可导出 Markdown / JSON。
- [ ] `/drama` 前端工作台能完成 MVP 主流程。
- [ ] UI 文案面向用户任务，不描述实现迁移。

## 12. 推荐下一步

下一阶段优先执行顺序：

1. 补齐 `Drama*` migrations，确保当前 P0 schema 可部署。
2. 迁移并注册现有短剧 prompt，消除 Prompt Governance 偏差。
3. 把 `DramaStrategyService`、`DramaEpisodeOutlineService` 移入 `pipeline/`，减少根目录堆叠。
4. 新增 `DramaScriptService`、台本 PromptAsset 和单集生成路由。
5. 新增 `DramaQualityGate` 与单集质量 flags。
6. 新增最小前端 `/drama` 工作台。

在完成第 1-5 项前，不应宣称短剧 MVP 已跑通；在完成第 6 项前，不应宣称用户可用。
