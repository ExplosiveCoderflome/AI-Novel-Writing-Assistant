# 拆书模块扩展长期方案

## 1. 定位

当前拆书模块的设计假设是"用户对源数据是消极接收者，拆书是一次性全自动产出"。所有产出都围绕 8 个固定小节、结构化关键结论和 Markdown 正文，目标是为后续小说生成、续写参考、知识库召回提供可复用素材。

本方案要把拆书从"全自动产出工具"演进为"用户协同的研究工作台"，覆盖三类使用场景：

- **学习场景**（主线）：新手作者通过精读 + 用户介入 + 对话式提问，把别人作品里的写法变成自己能复用的认知；
- **续写场景**（副线）：维持现有 `NovelReferenceService` 链路对拆书结果的消费能力，新增维度不破坏已有契约；
- **素材库场景**（远期）：从拆书沉淀出可跨小说复用的角色原型、场景模板等结构化资产，本期不主投但要为升格通道预留接口。

明确不在本期范围的方向：

- 拆书自动重跑 / 增量更新（章节实体落地之后再启动）；
- 多本对比矩阵 / 跨书聚类（依赖足够规模的拆书库后再做）；
- 智能匹配评分系统（依赖前面所有方向）。

## 2. 已完成阶段

| 阶段 | 主要改动 | 状态 |
|---|---|---|
| PR-1 evidence 字段绑定 + publish 清理 | evidence 增加 `fieldKey/fieldIndex`、publish 重复发布只保留最新绑定 | ✅ 已合并 |
| PR-2 结构化数组截断告警 | 引入 `BOOK_ANALYSIS_STRUCTURED_ARRAY_LIMIT`、警告字段、UI 提示 | ✅ 已合并 |
| PR-3 timeline 字段结构升级 | 新增 `timelineNodeArray` 类型、节点含 `label/timeHint/phase/sourceRefs` | ✅ 已合并 |
| PR-4 timeline 共享 utils 重构 | 节点归一化抽到 shared、`NovelReferenceService` 改用结构化访问 | ✅ 已合并 |
| PR-5 overview → others 两阶段 | overview 先生成、其他小节并发时接收 `BookAnalysisOverviewContext` | ✅ 已合并 |
| PR-5.1 收尾小修 | 删除 `runFullAnalysis` 第二阶段残留的 overview summary 分支死代码、`runSingleSection` 注入 overview context | 🟡 待启动 |

## 3. 范式转移

新阶段的所有扩展都围绕三个根本性变化：

- **源数据可访问** — 用户能查阅、索引、回溯原素材，不只是消费产出；
- **用户介入** — 拆书有意图层、可定向、可对话；
- **多维拆解** — 角色、场景作为一等实体，结构化能力从"小节字段"升级到"实体 + 子实体 + 交叉维度"。

这三个变化共同把拆书从"产出固定模板"升级为"按需深挖的研究工作台"。

## 4. 扩展方向矩阵

### 4.1 方向 A：源数据可访问性

| 子方向 | 内容 | 是否本期 |
|---|---|---|
| A1 章节实体 | 把 `DocumentVersion.content` 切分为 `Chapter`，附章节摘要、字数、出场角色 | 本期 |
| A2 证据回溯 | evidence 字段补 `chapterIndex/offsetRange`，UI 点击跳原文高亮 | 本期 |
| A3 章节标注 / 笔记 | 用户在原文上划线写批注，可主动喂给下一次拆书 | 远期 |

A1 是 A2/A3 + 方向 D（场景识别）+ 方向 E（增量拆书 / 章节追读）的共同前置。本方案把 A1 列为最高优先级。

### 4.2 方向 B：用户介入

| 子方向 | 内容 | 是否本期 |
|---|---|---|
| B1 全局指令层 | 拆书启动时输入"这次着重学群像戏轮转"，注入所有 section prompt 前置 | 本期 |
| B2 小节级聚焦 | 每个小节单独的"特别关注"指令，适合二次精拆 | 本期 |
| B3 对话式精读 | 选中原文 / evidence 点击 → 提问 AI | 远期（依赖 A2） |

### 4.3 方向 C：角色深度

详见第 5 节，本期主体工作。

### 4.4 方向 D：场景识别

| 子方向 | 内容 | 是否本期 |
|---|---|---|
| D1 场景自动识别 | 章节内继续切分为"地点+时间+在场人物稳定"的场景 | 远期（依赖 A1） |
| D2 场景类型与技法 | 每场打标签（动作 / 对话 / 心理 / 转折），附技法分析 | 远期 |
| D3 场景模板库 | 高价值场景抽象为可复用模板 | 远期 |

本期只为方向 D 预留扩展点：方向 C 的 `BookAnalysisCharacterScene` 设计上不强制依赖正式的"场景"实体，先用文本描述承载，后续 D1 落地后再升级关联。

### 4.5 方向 E：非线性方向

| 子方向 | 内容 | 是否本期 |
|---|---|---|
| E1 拆自己稿子 | 同一套机制跑用户自己的稿子，定位为"诊断模式" | 验证项（轻投入） |
| E2 对比拆书 | 多本同类作品的字段级交叉对比 | 远期 |
| E3 写作目标匹配评分 | 根据用户写作意图推荐拆书库里最值得读的 N 本 | 远期 |
| E4 增量章节追读 | 文档版本变化后只重跑变化章节相关的小节 | 远期（依赖 A1） |

E1 是"零工程改动 / 可能打开新场景"的旁路验证，建议作为独立验证项穿插实施。

## 5. 角色模块独立扩展（方案 A：保留并存）

### 5.1 选型结论

**不复用 `Character`，不复用 `CharacterCandidate`，新建独立的 `BookAnalysisCharacter` 实体**，理由如下：

| 备选 | 主要问题 |
|---|---|
| 全量复用 `Character` | 必须造占位 Novel；55+ 字段大量为"写作执行"设计，分析场景空置；14 个子表 cascade 牵连过重 |
| 改造 `CharacterCandidate` | 其 status 状态机围绕"升格为 Character"设计，拆书没这个目的；`novelId` 必填，schema 也要改 |
| 完全独立、零共享 | 错过 `BaseCharacter` 角色库沉淀价值；字段定义发散、用户感知不一致 |
| **独立 + 共享字段 schema + 显式升格通道** ✓ | 拆书侧干净、角色库受益、字段一致性可控 |

短剧模块对 `DramaCharacter` 已经采用了"独立实体"路径，拆书没有理由比短剧更侵入主创作链路。

### 5.2 实体设计

新增三个 Prisma 模型，全部挂在 `BookAnalysis` 下：

| 模型 | 关系 | 主要字段 | 说明 |
|---|---|---|---|
| `BookAnalysisCharacter` | BookAnalysis 1—N | name、role、generationDepth、selectedDimensionsJson、profileJson、evidence | 拆书角色档案，详细度可选 quick/standard/deep |
| `BookAnalysisCharacterArc` | Character 1—N | chapterRef、stageLabel、stateSnapshotJson | 角色 × 章节弧线节点，对应想法 3 的"成长追踪" |
| `BookAnalysisCharacterScene` | Character 1—N | sceneLabel、sceneType、performanceJson、evidence | 角色 × 场景表现，对应想法 4，本期 sceneLabel 是字符串，D1 落地后升级为关联 |

所有子表 `onDelete: Cascade`。Character 不挂 Novel，删除 BookAnalysis 时整树清理。

### 5.3 共享字段 schema

新建 `shared/types/characterProfile.ts`，定义"通用人物维度"，作为三方对齐的口径：

- **基础信息**：name、aliases、age、gender、role
- **外形维度**：appearance、physique、attireStyle、signatureDetail
- **性格维度**：personality、values、speakingStyle
- **动机维度**：outerGoal、innerNeed、fear、wound、misbelief
- **弧线维度**：arcStages（数组）、growthTrajectory
- **关系维度**：keyRelations（含目标角色、关系类型）
- **场景表现维度**：highlightScenes（含场景描述、表现分析）

三个角色实体的对齐策略：

- `BaseCharacter`：字段最贴合 schema，新加字段时优先对齐；
- `BookAnalysisCharacter`：使用 schema 子集 + 拆书专用字段（authorTechnique、readerFeedback、designReferences）；
- `Character`：历史包袱重，已有字段保持现状，**仅在新加字段时对齐 schema**，不强制回溯改造。

字段中文标签、顺序、长度上限统一定义在 `shared/types/characterProfile.ts`，避免"性格 vs 性情"那类发散。

### 5.4 升格通道

用户在拆书结果中可主动把某个 `BookAnalysisCharacter` 升格为 `BaseCharacter`：

- 由用户显式触发（UI 按钮"加入角色库"），**不自动同步**；
- 升格时拷贝共享 schema 字段，拆书专用字段（如 evidence、sceneRefs）保留在原 `BookAnalysisCharacter` 中不携带；
- 在 `BaseCharacter` 上通过 `sourceType` + `sourceRefId`（复用现有 `CharacterSyncProposal` 的字段模式）记录来源；
- 升格后两者独立演化，不建立双向链 — 避免拆书数据反向污染角色库。

### 5.5 角色图生成（复用现有图像模块）

拆书角色档案应允许用户为每个角色生成参考形象图，帮助新手作者把"文字描述"转换为"视觉印象"，加深对角色塑造的理解。本期不重建图像链路，**完整复用现有 image 模块**。

#### 现有可复用资产

| 资产 | 位置 | 复用价值 |
|---|---|---|
| `ImageGenerationTask` / `ImageAsset` 模型 | `server/src/prisma/schema.prisma` | polymorphic 设计（`baseCharacterId?` / `novelId?` 并列可选），天然支持新增可选关联字段 |
| `ImageSceneType` 枚举 | 同上 | 已预留 `chapter_illustration` 槽位，证明该枚举本就是扩展点 |
| `ImageGenerationService` | `server/src/services/image/` | 已支持 character + novel_cover 双 sceneType，新 sceneType 按现有 switch 分支扩展 |
| `ImagePromptOptimizationService` | 同上 | prompt 优化能力可复用 |
| `buildCharacterImagePrompt` | `shared/imagePrompt` | 接收字段对象不绑定实体，可直接喂 `BookAnalysisCharacter.profileJson` |
| `imageAssetStorage` | `server/src/services/image/` | 文件存储、URL 构建、清理逻辑 |
| `ImageGenerationConfirmDialog` + `useImageGenerationFlow` | `client/src/components/image/` | 生成确认弹窗、进度追踪流程 |

#### 选型结论：扩展 sceneType + 新增可选关联

三种候选路径的对比：

| 路径 | 实现方式 | 优势 | 劣势 | 评估 |
|---|---|---|---|---|
| 扩展 sceneType + 加可选关联字段 | `ImageSceneType` 加 `book_analysis_character`，task/asset 加 `bookAnalysisCharacterId String?` | 完全复用 provider / 存储 / UI / prompt；轻量侵入 | 修改 image 模型 schema | ✅ 推荐 |
| 升格后再配图 | 拆书角色不直接配图，升格为 `BaseCharacter` 后走现有 character 配图流程 | 零侵入 image 模型 | 违背"先看图判断要不要升格"的直觉；阻断学习场景闭环 | 不推荐 |
| 完全独立配图实体 | 新建 `BookAnalysisCharacterImageAsset` | 完全解耦 | 重复实现存储、provider、UI、prompt 优化，违背复用原则 | 不推荐 |

推荐**路径 1**，理由：

- `ImageSceneType` 设计本就是扩展点（`chapter_illustration` 已预留）；
- 新增 `bookAnalysisCharacterId` 与现有 `baseCharacterId` / `novelId` 同构，复用 `resolveTaskOwnerKey` / `buildAssetOwnerWhere` 等现有模式；
- 单点新增枚举 + 字段，影响面可控；
- 升格时可选拷贝已生成图资产（详见下文）。

#### 与升格通道的协作

- 用户在拆书阶段为 `BookAnalysisCharacter` 生成的图保留在拆书侧（`sceneType = book_analysis_character`）；
- 用户升格该角色为 `BaseCharacter` 时，**默认携带已选定的主图（`isPrimary = true`）**：克隆 `ImageAsset` 副本，新副本以 `baseCharacterId` 为 owner，`sceneType = character`；
- 拆书侧原资产保留，BookAnalysis 删除时随之 cascade；
- 升格弹窗提供 checkbox "同时把主图加入角色库"，默认勾选，用户可取消；
- 不建立双向同步：升格后两侧图资产独立演化。

#### 按文件层级改动清单（仅角色图部分）

- `server/src/prisma/schema.prisma` — `ImageSceneType` 增加 `book_analysis_character`；`ImageGenerationTask` / `ImageAsset` 增加 `bookAnalysisCharacterId String?` 字段 + 反向关系；`BookAnalysisCharacter` 增加 `imageTasks` / `imageAssets` 反向关系
- `server/src/prisma/schema.sqlite.prisma` — 对称同步
- `server/src/prisma/migrations/` — 新增迁移，纯加列、加枚举值
- `shared/types/image.ts` — `ImageSceneType` 联合类型扩展
- `shared/imagePrompt/` — `buildCharacterImagePrompt` 评估是否需要 BookAnalysisCharacter 适配器；若 profile 字段命名一致则无需新文件
- `server/src/services/image/ImageGenerationService.ts` — `SupportedImageSceneType` 增加新值；`resolveTaskOwnerKey` / `buildAssetOwnerWhere` 扩展三元分支；character 分支共享 prompt 构建
- `server/src/services/image/imageGenerationMappers.ts` — `toImageTask` / `toImageAsset` 增加 `bookAnalysisCharacterId` 字段映射
- `server/src/services/image/types.ts` — `CharacterImageGenerationRequest` 类型评估是否需要 split 或加 owner 维度
- `server/src/services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterImageService.ts` — 新增薄包装层，封装"为某 BookAnalysisCharacter 生成图"的入口，内部调用 `ImageGenerationService`
- `server/src/services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterPromoteService.ts` — 升格逻辑增加"携带主图"分支：克隆 `ImageAsset` 副本到 `baseCharacterId` owner
- `server/src/routes/bookAnalysis.ts` — 新增子路由：
  - `POST /:id/characters/:characterId/images/generate` — 触发生成
  - `GET /:id/characters/:characterId/images` — 列表
  - `PATCH /:id/characters/:characterId/images/:assetId` — 设主图 / 排序
  - `DELETE /:id/characters/:characterId/images/:assetId` — 删除
- `client/src/pages/bookAnalysis/components/BookAnalysisCharacterImagePanel.tsx` — 新增，角色图列表、生成入口、设主图、删除
- `client/src/pages/bookAnalysis/components/BookAnalysisCharacterPromoteDialog.tsx` — 增加"同时把主图加入角色库"checkbox
- `client/src/pages/bookAnalysis/hooks/useBookAnalysisCharacterImages.ts` — 新增，复用 `useImageGenerationFlow` 的轮询逻辑
- `client/src/api/bookAnalysis.ts` — 增加 character image 相关接口
- `server/tests/bookAnalysisCharacterImage.test.js` — 新增：生成、设主图、删除、升格携带图

### 5.6 与现有 `character_system` 小节的共存（方案 A 决策）

- `character_system` 保留为**快速概览层**，输出现有 structuredData（protagonistPositioning、supportingFunctions 等）和 Markdown，行为完全不变；
- `BookAnalysisCharacter` 是**深度档案层**，作为可选启用项（类似拆书 preset 的轻 / 标准 / 完整模式）；
- 两者数据共存，UI 上 `character_system` 摘要可点击展开到 `BookAnalysisCharacter` 详细档案；
- 用户启用深度档案时，`BookAnalysisCharacter` 的生成可以选择"基于 character_system 已生成的角色清单"或"独立从原文识别"，前者成本低、后者覆盖全。

这样做的代价是两套数据可能不一致，缓解策略：

- 深度档案生成时把 `character_system` structuredData 作为"已识别角色清单"传入，减少识别分歧；
- UI 显示时如发现两侧角色名不匹配，给"刷新概览"按钮让用户决定；
- 不强制双向同步，避免维护成本爆炸。

### 5.7 按文件层级的改动清单（角色档案主体）

> 角色图相关改动详见 5.5 节，本节聚焦角色档案与弧线、场景子实体。

#### shared 层

- `shared/types/characterProfile.ts` — 新增，定义 `CharacterProfileSchema`、字段中文标签、长度上限
- `shared/types/bookAnalysisCharacter.ts` — 新增，定义 `BookAnalysisCharacter` / `BookAnalysisCharacterArc` / `BookAnalysisCharacterScene` 接口、生成深度枚举、维度选择枚举

#### Prisma schema

- `server/src/prisma/schema.prisma` — 新增三个模型 + 三个关系；`BookAnalysis` 增加反向关系字段
- `server/src/prisma/schema.sqlite.prisma` — 对称同步
- `server/src/prisma/migrations/` — 新增迁移，纯加表，零数据迁移

#### server 服务层

- `server/src/services/bookAnalysis/bookAnalysisCharacter/` — 新建子目录，包含：
  - `BookAnalysisCharacterService.ts` — CRUD、列表查询、删除
  - `BookAnalysisCharacterGenerationService.ts` — 调用 LLM 生成角色档案、增量补维度
  - `BookAnalysisCharacterPromoteService.ts` — 升格到 `BaseCharacter`
  - `bookAnalysisCharacter.types.ts` — 内部类型
  - `bookAnalysisCharacter.utils.ts` — 归一化、字段筛选、共享 schema 校验
  - `bookAnalysisCharacterSchemas.ts` — zod schema
- `server/src/prompting/prompts/bookAnalysis/bookAnalysisCharacter.prompts.ts` — 新增角色档案、弧线节点、场景表现三类 prompt asset
- `server/src/services/bookAnalysis/BookAnalysisService.ts` — 增加 `getCharacters` / `generateCharacters` 等方法转发
- `server/src/services/bookAnalysis/bookAnalysis.publish.ts` — 发布到知识库时，可选携带角色档案进 publish payload（保持向后兼容，默认不开）
- `server/src/services/bookAnalysis/bookAnalysis.export.ts` — 导出 Markdown 时增加角色档案章节
- `server/src/services/character/CharacterLibrarySyncService.ts` — 增加"接受拆书来源升格"的入口（非必须，可放后续 PR）

#### server 路由

- `server/src/routes/bookAnalysis.ts` — 新增子路由：
  - `GET /:id/characters` — 列表
  - `POST /:id/characters/generate` — 生成 / 增量补维度
  - `PATCH /:id/characters/:characterId` — 编辑
  - `DELETE /:id/characters/:characterId` — 删除
  - `POST /:id/characters/:characterId/promote` — 升格到角色库
  - `GET /:id/characters/:characterId/arcs` — 弧线列表
  - `GET /:id/characters/:characterId/scenes` — 场景表现列表

#### client 层

- `client/src/pages/bookAnalysis/components/BookAnalysisCharacterPanel.tsx` — 新增，角色档案主面板
- `client/src/pages/bookAnalysis/components/BookAnalysisCharacterCard.tsx` — 新增，单个角色卡片
- `client/src/pages/bookAnalysis/components/BookAnalysisCharacterArcList.tsx` — 新增，弧线节点列表
- `client/src/pages/bookAnalysis/components/BookAnalysisCharacterSceneList.tsx` — 新增，场景表现列表
- `client/src/pages/bookAnalysis/components/BookAnalysisCharacterPromoteDialog.tsx` — 新增，升格到角色库确认弹窗
- `client/src/pages/bookAnalysis/hooks/useBookAnalysisCharacters.ts` — 新增，数据获取与变更
- `client/src/pages/bookAnalysis/hooks/useBookAnalysisWorkspace.ts` — 增加角色档案的入口跳转、与 character_system 概览的联动
- `client/src/api/bookAnalysis.ts` — 增加 character 相关接口调用

#### 测试

- `server/tests/bookAnalysisCharacter.test.js` — 新增：CRUD、生成、归一化、升格、与 character_system 数据联动
- `server/tests/bookAnalysis.publish.test.js`（如已存在则扩展，否则新建）— 验证发布携带角色档案时的内容
- `server/tests/bookAnalysis.test.js` — 增加联动场景：character_system 生成后启动深度档案的清单复用

#### 文档

- `docs/wiki/workflows/book-analysis-workflow.md` — 增加"深度角色档案"章节，引用本 plan
- `docs/wiki/workflows/book-analysis-character-deep-dive.md` — 新增（可选），独立沉淀深度角色档案的稳定决策
- `docs/releases/release-notes.md` — 各阶段 PR 落地时同步

#### 估算

整个角色扩展约 1500-2000 行新增代码（含测试），单一 PR 不可承担，需拆分为至少 3 个 PR（见第 6 节）。

## 6. 阶段化交付路线

### 6.1 总体策略

从"零碎 PR 单元"切换为"用户价值阶段"：每个阶段交付一个用户可感知的完整能力，单阶段 1-2 PR，按依赖串行推进，每阶段结束后留 1-2 周观察期再启动下一个。

### 6.2 阶段总览

| 阶段 | 交付的用户价值 | 范围估算 | PR 数 | 预估周期 |
|---|---|---|---|---|
| 阶段一 | 可以告诉拆书"这次重点看什么"（用户介入 + 上轮收尾） | ~300 行 | 1 | 1 周 |
| 阶段二 | 可以查阅原文章节，从结论一键回到出处 | ~800 行 | 2 | 3 周 |
| 阶段三 | 可以深入研究每个角色（多维度档案 + 弧线 + 场景表现） | ~1300 行 | 2 | 4 周 |
| 阶段四 | 可以为角色配图，并把学到的角色升格到自己的角色库 | ~700 行 | 2 | 3 周 |
| 阶段五 | 可以用同一套工具诊断自己的稿子（旁路） | ~150 行 | 1 | 1 周 |

总跨度约 3250 行 / 8 个 PR / 12 周。阶段一是其他阶段的前置；阶段三和四强串行；其余可并行。

### 6.3 阶段依赖

```
阶段一 (用户介入 + 收尾) ─┐
                          ├─→ 阶段二 (章节 + evidence 回溯)
                          │
                          ├─→ 阶段三 (角色档案) ─→ 阶段四 (配图 + 升格)
                          │
                          └─→ 阶段五 (拆自己稿子)
```

### 6.4 阶段一：拆书引导能力 + 上轮收尾

**交付价值**：用户在拆书启动时可以告诉系统"这次重点学群像戏的轮转"，也可以在某个小节单独要求"特别关注主角的语言风格"。同时清理 PR-5 遗留的两个小问题。

**范围**：
- 收尾：删除 `runFullAnalysis` 第二阶段循环里 overview summary 赋值的死代码；`runSingleSection` 重跑非 overview 小节时自动加载已生成的 overview section 并注入 context
- B1 全局指令层：拆书启动 UI 加"本次拆书重点关注"文本框，存储到 `BookAnalysis.userFocusInstruction`，注入所有 section prompt 前置段
- B2 小节级聚焦：每个 section 卡片头部加"该节特别关注"输入框，存储到 `BookAnalysisSection.focusInstruction`，单节重跑时注入

**文件层级**：
- `server/src/prisma/schema.prisma` / `schema.sqlite.prisma` — `BookAnalysis` 加 `userFocusInstruction String?`；`BookAnalysisSection` 加 `focusInstruction String?`
- `server/src/prisma/migrations/` — 纯加列
- `shared/types/bookAnalysis.ts` — 接口扩展
- `server/src/services/bookAnalysis/bookAnalysis.generation.ts` — runSingleSection 加载 overview context、死代码清理
- `server/src/services/bookAnalysis/bookAnalysis.sectionWriter.ts` — `generateSection` 增加指令参数
- `server/src/services/bookAnalysis/BookAnalysisCommandService.ts` — 启动 / 重跑接收并存储指令
- `server/src/prompting/prompts/bookAnalysis/bookAnalysis.prompts.ts` — Prompt 注入用户指令段
- `server/src/routes/bookAnalysis.ts` — 启动 / 重跑接口增加指令参数
- `client/src/pages/bookAnalysis/components/BookAnalysisStartDialog.tsx` — 全局指令文本框
- `client/src/pages/bookAnalysis/components/BookAnalysisSectionCard.tsx` — 小节聚焦输入框
- `client/src/pages/bookAnalysis/hooks/useBookAnalysisWorkspace.ts` — 指令状态管理
- `server/tests/bookAnalysis.test.js` — 指令存储、注入、重跑携带

**验收要点**：
- 全局指令进入所有 section system prompt；小节聚焦指令只进入该节
- runSingleSection 重跑 plot_structure 时能拿到 overview context
- 旧拆书（指令字段为空）行为不变

### 6.5 阶段二：章节实体与证据回溯

**交付价值**：用户能在拆书界面看到原文按章节切分的列表，可以单独阅读某一章；拆书结论的 evidence 显示"出自第 N 章"，点击可跳到原文该章对应位置。

**拆分**：先 A1 章节实体（PR），后 A2 证据回溯（PR）。

**A1 范围**：
- 新增 `Chapter` 实体挂 `DocumentVersion` 下（一对多），含 `chapterIndex / title / startOffset / endOffset / summary / wordCount`
- 章节切分服务支持三种模式：规则切分（标题正则）/ LLM 切分 / 用户手动校对
- 切分时机：用户进入"拆书结果"页面首次查看"原文章节"时按需切分，结果缓存到 `Chapter` 表
- UI 章节列表：左侧面板列出章节，点击查看该章节内容（只读）

**A1 文件层级**：
- `server/src/prisma/schema.prisma` / sqlite — 新增 `Chapter` 模型 + 反向关系；迁移
- `shared/types/documentChapter.ts`（新增）— `Chapter` 接口
- `server/src/services/bookAnalysis/documentChapter/` —
  - `DocumentChapterService.ts`：CRUD、查询
  - `DocumentChapterSplitService.ts`：切分（规则 + LLM）
- `server/src/prompting/prompts/bookAnalysis/documentChapter.prompts.ts` — LLM 切分 prompt
- `server/src/routes/bookAnalysis.ts` — 章节列表 / 切分 / 校对接口
- `client/src/pages/bookAnalysis/components/BookAnalysisChapterList.tsx`
- `client/src/pages/bookAnalysis/components/BookAnalysisChapterReader.tsx`
- `client/src/pages/bookAnalysis/hooks/useDocumentChapters.ts`
- `server/tests/documentChapter.test.js`

**A2 范围**：
- `BookAnalysisEvidenceItem` 增加可选 `chapterIndex?: number` + `excerptOffsetRange?: [number, number]`
- 生成 evidence 时让 Prompt 输出 chapterIndex（基于 notes 的 sourceLabel 反查）
- 后端归一化阶段补齐 chapterIndex（若 LLM 没给但 sourceLabel 能匹配到章节）
- UI：evidence 卡片显示"第 N 章"标签；点击 → 跳章节阅读器并高亮 excerpt 位置

**A2 文件层级**：
- `shared/types/bookAnalysis.ts` — `BookAnalysisEvidenceItem` 扩展
- `server/src/services/bookAnalysis/bookAnalysis.utils.ts` — `normalizeBookAnalysisEvidence` 增加章节定位归一
- `server/src/prompting/prompts/bookAnalysis/bookAnalysis.prompts.ts` — evidence 规则补 chapterIndex 要求
- `server/src/services/bookAnalysis/bookAnalysis.sectionWriter.ts` — 把可用章节信息传给归一化
- `client/src/pages/bookAnalysis/components/BookAnalysisEvidenceList.tsx` — 章节标签 + 跳转按钮
- `client/src/pages/bookAnalysis/hooks/useBookAnalysisChapterJump.ts`
- `server/tests/bookAnalysis.test.js` — 章节定位归一测试

**验收要点**：
- 旧文档无 Chapter 时按需切分，不强制对所有历史文档回填
- LLM 切分失败有 fallback 退回规则切分
- 新生成 evidence 至少 70% 带合法 chapterIndex；历史 evidence 无该字段时 UI 优雅降级
- 跳转后章节阅读器自动滚动到 excerpt 大致位置

### 6.6 阶段三：角色深度档案

**交付价值**：用户可以为拆书结果中的每个角色生成深度档案，选择想分析的维度（外形 / 性格 / 动机 / 弧线 / 关系 / 场景表现）和深度（quick / standard / deep）；档案包含角色在不同章节的状态变化和在关键场景的具体表现。

**拆分**：先 C1 主体，后 C2+C3 子实体。

**C1 范围**：新增 `BookAnalysisCharacter` 实体、shared `CharacterProfileSchema`、生成服务（输入是源 notes + 用户选维度 + 深度 + character_system 已识别角色清单）、UI 主面板（"深度角色档案"Tab）、与 character_system 联动（清单复用、UI 跳转）。

**C2+C3 范围**：新增 `BookAnalysisCharacterArc`（角色 × 章节弧线节点）和 `BookAnalysisCharacterScene`（角色 × 场景表现）；弧线节点 chapterRef 依赖阶段二的 Chapter 实体；场景 sceneLabel 本期字符串承载，方向 D 落地后升级关联。

**文件层级**：见 5.7 节"角色档案主体改动清单"，含 Prisma 三模型、shared 两文件、server 服务目录、prompt、路由、client 5 个组件、测试。

**验收要点**：
- 用户可选维度 + 深度生成档案；历史 BookAnalysis 默认不生成，需主动触发
- 与 character_system 共存，角色清单复用
- 弧线节点能引用真实 chapterIndex（依赖阶段二 A1）
- 主档案 deep 模式自动生成弧线 + 场景，但用户可禁用
- 成本提示：生成前显示预估 token

### 6.7 阶段四：角色图生成 + 升格通道

**交付价值**：用户可以为深度档案的每个角色生成 AI 配图；可以把喜欢的角色"加入角色库"成为 `BaseCharacter`，升格时可携带已生成的主图。

**拆分**：先角色图生成，后升格通道（依赖图）。

**角色图范围**：扩展现有 image 模块 — `ImageSceneType` 加 `book_analysis_character`、`ImageGenerationTask` / `ImageAsset` 加 `bookAnalysisCharacterId String?`、复用 `ImageGenerationService` / `buildCharacterImagePrompt` / `useImageGenerationFlow` / `ImageGenerationConfirmDialog`、新建薄包装 `BookAnalysisCharacterImageService`、UI 在角色卡新增配图区。

**升格范围**：新建 `BookAnalysisCharacterPromoteService` 从 BookAnalysisCharacter 创建 BaseCharacter 副本（仅携带 shared schema 字段）、升格弹窗（字段映射 + 携带主图 checkbox 默认勾选）、主图克隆做拷贝不是引用、BaseCharacter 上用 `sourceType / sourceRefId` 记录来源、两侧独立演化不建双向链。

**文件层级**：见 5.5 节"角色图改动清单"和 5.4 节"升格通道"。

**验收要点**：
- 生成图触发走现有 ImageGenerationService 链路；现有 character / novel_cover 路径无回归
- 设主图、删除、排序行为与现有 character 配图一致
- 升格创建 BaseCharacter，source 字段正确；删除拆书后升格出的 BaseCharacter 不受影响
- 升格弹窗显示 schema 字段差异让用户确认映射

### 6.8 阶段五：拆自己稿子（旁路验证）

**交付价值**：用户可以把自己写到一半的稿子走完整拆书流程，得到节奏诊断 / 人物模糊点 / 主题清晰度 / 伏笔回收等结论。

**范围**：不新增任何架构能力（现有拆书已支持任意 DocumentVersion 输入），主要工作是入口和文案 — 新增"诊断模式"入口（与"参考别人作品"并列）、诊断模式下结果展示文案微调、增加从现有 Novel 一键导出全文为 Document 的功能。

**文件层级**：
- `server/src/services/novel/NovelExportService.ts` — Novel → Document 转换
- `server/src/routes/novel.ts` 或 `bookAnalysis.ts` — `POST /novels/:id/export-as-document`
- `client/src/pages/bookAnalysis/components/BookAnalysisStartDialog.tsx` — 模式切换 Tab
- `client/src/pages/bookAnalysis/components/BookAnalysisDiagnosisTipBanner.tsx`（新增）— 诊断模式顶部提示
- `client/src/pages/bookAnalysis/components/BookAnalysisStructuredSummary.tsx` — 诊断模式文案微调
- `server/tests/bookAnalysis.diagnosis.test.js` — 诊断模式拆书全流程

**验收要点**：
- 从 Novel 一键导出 Document 后可立即拆书
- 诊断模式与参考模式有明显文案区分
- 不破坏现有"参考别人作品"路径

### 6.9 阶段性退出条件

每阶段合并后留 1-2 周观察期，关注指标：

- 阶段一：全局指令填写比例（>30% 视为有效，<10% 调整入口）；overview context 注入后单节重跑质量人工抽检
- 阶段二：章节列表查看比例、按部分章节二次拆书使用率；evidence 跳转点击率
- 阶段三：深度档案生成完成率、用户人工编辑率、弧线 + 场景的填充密度
- 阶段四：生图触发率（<15% 回看入口位置和成本提示）、单角色平均生图次数、主图设定率、升格次数、升格携带主图勾选率、升格后 BaseCharacter 在新小说创建中的复用率
- 阶段五：诊断模式拆书启动率、用户在诊断模式产生的人工编辑量

### 6.10 通用约束

- 每阶段开始前更新本 plan 文档对应章节状态
- 每阶段合并前更新 `docs/releases/release-notes.md`
- 涉及稳定决策的内容（已稳定的字段、流程、约束）从 plan 迁移到 `docs/wiki/workflows/book-analysis-workflow.md`
- 单 PR 测试套件必须全通过，不能 break 已有
- Schema 改动一律纯加列 / 加表，禁止改类型或删字段
- Prompt 改动通过 `BOOK_ANALYSIS_*` 等共享常量驱动，禁止硬编码 JSON 字段表

## 7. 决策记录

### 7.1 已决定

- **方案 A 共存策略**：`character_system` 小节作为快速概览保留，`BookAnalysisCharacter` 作为深度档案并存，不替换；
- **角色实体独立**：不复用 `Character` / `CharacterCandidate`；
- **升格通道由用户显式触发**：不自动同步、不双向追踪；
- **主线场景是"学习场景"**：扩展方向优先级以学习场景为锚点；
- **方向 A1 + 方向 C 是本期主投入**：方向 D 仅做扩展点预留；
- **角色图生成复用现有 image 模块**：扩展 `ImageSceneType` 枚举 + 新增可选关联字段，不重建图像链路；
- **升格默认携带主图**：升格时默认勾选"同时把主图加入角色库"，用户可取消，避免学习场景接受的图丢失。

### 7.2 待决定

- **章节切分策略**：是基于规则（如标题正则）、还是 LLM 切分、还是混合，PR-7 启动前需做小型 POC；
- **深度档案的默认生成时机**：是与全量拆书一起跑（增加成本），还是用户在拆书结果页主动触发（默认不跑），建议初版选后者；
- **升格携带哪些字段**：是只携带 schema 共同字段、还是允许用户在升格弹窗中按字段勾选；
- **角色 × 场景表现的"场景"如何承载**：本期用字符串描述，方向 D 落地后是否回填关联，影响 PR-9 数据模型扩展性；
- **现有 `CharacterCandidate` 是否参与"识别"过程**：如果 A1 章节实体落地，是否复用 CharacterCandidate 的章节级角色识别能力来辅助 `BookAnalysisCharacter` 初始化，需在 PR-8 启动前评估;
- **角色图生成入口位置**：是放在角色卡片头部固定按钮、还是折叠到"更多操作"，影响生图触发率；
- **角色图生成的 prompt 输入**：是只用 `BookAnalysisCharacter.profileJson` 的外形维度、还是把性格 / 高光场景也拼入以增加画面氛围，需小型 A/B 验证；
- **升格携带图的批量策略**：单次升格是只携带主图、还是允许选择多张携带，前者实现简单、后者更灵活。

## 8. 失败模式预判

- **深度档案与 character_system 严重不一致**：检查是否传入了 character_system 的角色清单作为生成基线，UI 是否提供"刷新概览"通路；
- **升格后角色库膨胀**：检查升格是否被默认触发（应为显式），是否有"撤销升格"路径；
- **方向 D 预留接口被低估**：方向 C 的场景字段用文本承载，未来 D1 落地时如果没有关联字段（如 sceneEntityId 可选），数据回填代价高，PR-8 时必须留好扩展位；
- **拆书成本暴涨**：深度档案生成是新增 LLM 调用，UI 入口必须提示估算成本，与现有拆书预设的"成本可见"原则一致；
- **章节实体导致历史数据兼容问题**：A1 落地时旧 `DocumentVersion` 无章节，需要"按需切分、不强制回填"的策略；
- **角色图生成成本失控**：单角色多次生图、批量角色一键生图，都会显著推高图像 API 成本，UI 必须显示单次成本估算 + 当日累计；如发现用户连点生成按钮的频率高，应加最小间隔限制；
- **升格携带图后角色库脏数据**：升格时若拆书原图被删除，BaseCharacter 端的克隆副本仍应保留（克隆 = 独立资产），不要做引用而非拷贝；
- **图像 sceneType 扩展破坏旧逻辑**：现有 `ImageGenerationService.resolveSceneType` 抛错链路必须覆盖新枚举值，否则会在历史路径上误抛 400。

## 9. 相关模块

- `server/src/services/bookAnalysis/`
- `server/src/services/character/`
- `server/src/services/image/`
- `server/src/prisma/schema.prisma`
- `server/src/prompting/prompts/bookAnalysis/`
- `shared/types/bookAnalysis.ts`
- `shared/types/image.ts`
- `shared/imagePrompt/`
- `shared/types/characterProfile.ts`（新增）
- `shared/types/bookAnalysisCharacter.ts`（新增）
- `client/src/pages/bookAnalysis/`
- `client/src/components/image/`

## 10. 来源文档

- [拆书工作流](../wiki/workflows/book-analysis-workflow.md)
- [角色系统升级长期方案](./character-system-upgrade-plan.md)
- [Prompt Registry 与结构化输出](../wiki/prompts/prompt-registry-and-structured-output.md)
- [新手优先与整本小说完成原则](../wiki/product/beginner-first-novel-completion.md)
