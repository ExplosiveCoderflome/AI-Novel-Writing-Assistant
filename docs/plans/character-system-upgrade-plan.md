# 角色系统升级长期方案

## 1. 定位

角色系统不应只被设计成“人物资料卡 + 当前状态记录”。在 AI 长篇成书系统里，角色系统的正确定位是：

> 角色系统负责把角色从静态设定，转化为可持续驱动剧情、关系、爽点、审稿和章节生成的叙事资产。

角色库同步解决的是“角色资产能否复用、是否污染其他小说”的问题；角色系统升级要解决的是“角色进入一本小说后，能否持续帮系统写出可读、可追、可推进的长篇故事”。

长期核心原则：

- 角色库负责可复用人格资产；
- 小说角色负责本书叙事岗位；
- 动态状态负责当前剧情事实；
- 关系张力负责持续冲突与情感牵引；
- 章节写作只消费小说内角色上下文包，不直接消费角色库。

## 2. 长期目标

面向完全不会写作的新手用户，角色系统要帮助用户解决这些问题：

- 不知道一本小说需要什么角色；
- 不知道角色为什么能推动剧情；
- 不知道角色之间该怎么产生张力；
- 写着写着角色变成工具人或名单；
- 角色出场没有作用，或者重要角色长期消失；
- 台词和行为不像这个角色；
- 关系变化缺少铺垫；
- AI 生成章节时忘记角色当前目标、情绪、信息差和红线。

系统目标不是让用户手动维护更多字段，而是让 AI 自动推荐、自动提炼、自动进入写作链，只让用户确认高风险判断。

## 3. 目标架构分层

### 3.1 角色库资产层

对应全局 `BaseCharacter` 和角色库同步系统。

负责：

- 可复用姓名、外貌、基础人格、长期背景；
- 可复用说话方式、行为习惯、角色卖点；
- 角色原型版本、分叉、引用小说列表；
- 从小说实例中沉淀稳定设定。

不负责：

- 某本小说的当前状态；
- 某本小说里的关系进度；
- 某本小说里的死亡、受伤、黑化、和解、资源持有等剧情事实。

### 3.2 小说角色实例层

对应单本小说内的 `Character`。

负责：

- 这个角色在本书里的身份和叙事功能；
- 与主角、反派、核心角色的本书关系；
- 当前目标、当前状态、成长阶段；
- 本书专属设定和角色弧线。

### 3.3 叙事岗位层

建议新增为角色系统升级的第一优先级。

负责回答：

- 这个角色在本书里为什么必须存在；
- 他负责制造什么冲突、爽点、情感牵引或世界入口；
- 他在当前卷承担什么任务；
- 他下一次应该推动什么；
- 他不能抢走谁的叙事职责。

建议岗位类型包括：

- `protagonist_driver`：主角推动者；
- `pressure_source`：压力源；
- `emotional_anchor`：情感牵引；
- `value_mirror`：价值镜像；
- `reader_reward_amplifier`：爽点放大器；
- `foreshadow_holder`：伏笔持有人；
- `world_entry`：世界观入口；
- `antagonist_proxy`：反派代理人；
- `turning_point_trigger`：关系转折触发器；
- `cost_bearer`：代价承担者。

这些岗位应由 AI 结构化判断，不通过关键词或硬编码路由兜底。

### 3.4 关系张力层

单个角色再完整，也不如角色关系能持续制造长篇推进。关系系统应从“关系描述”升级为“关系张力账本”。

负责：

- 表层关系；
- 隐性矛盾；
- 信息不对称；
- 情感债；
- 利益绑定；
- 下一次关系转折；
- 读者期待的关系兑现；
- 禁止突然变化的关系红线。

关系张力账本必须进入章节规划、章节写作、审稿和修复链。

### 3.5 动态状态层

对应当前已有的角色动态、状态快照、章节后状态同步。

负责：

- 当前目标；
- 当前情绪；
- 当前压力；
- 当前信息知道范围；
- 当前资源能力；
- 当前伤害、位置、处境；
- 章节后状态变化。

动态状态禁止同步到角色库。

### 3.6 写作消费层

这是角色系统最终要服务的层。

每次写章节前，系统应生成角色上下文包：

- 本章可出场角色；
- 每个角色当前目标；
- 每个角色当前情绪和压力；
- 每个角色本章必须推进什么；
- 每个角色本章不能做什么；
- 哪些关系必须保持一致；
- 哪些信息角色知道，哪些只有读者知道；
- 本章结束后期望发生什么状态变化；
- 角色表达合同：台词、行为、情绪外露方式、语言禁区。

章节生成、章节审稿、章节修复都消费这份上下文包。

## 4. 细化优化清单

### 4.1 角色库与小说实例

- [ ] 角色库详情页展示被哪些小说引用、引用状态、最新版本差异。
- [ ] 小说角色页展示角色库来源、当前引用版本、同步状态。
- [ ] 支持角色库变体：原型、平行变体、改名变体、只借用人格、只借用外貌、只借用表达风格。
- [ ] 支持小说角色一键分叉，保留来源但停止同步。
- [ ] 支持从小说角色沉淀到角色库时的 AI 清洗：可同步、仅本书、高风险。
- [ ] 角色库更新只生成可选提案，不自动影响任何小说。

### 4.2 角色叙事岗位

- [ ] 为每个小说角色生成“本书存在理由”。
- [ ] 为每个小说角色生成“当前卷职责”。
- [ ] 为每个小说角色标注读者收益：爽点、虐点、暧昧、悬念、反差、压迫感、陪伴感。
- [ ] 标注角色负责推动的剧情类型：行动推进、关系推进、信息揭示、压力升级、世界观展开。
- [ ] 标注角色不能承担的职责，避免主角被配角替代推动。
- [ ] 在卷规划和章节规划阶段检查当前角色阵容是否缺岗位。

### 4.3 角色关系张力

- [ ] 把 `CharacterRelation` 扩展为可消费的关系张力视图。
- [ ] 为核心关系生成“表层关系 + 隐性矛盾 + 信息不对称 + 情感债”。
- [ ] 为核心关系生成下一次转折点。
- [ ] 为核心关系生成关系红线，防止突然和解、突然翻脸、突然亲密。
- [ ] 在章节写作前输出本章关系推进要求。
- [ ] 在审稿阶段检查关系变化是否缺少铺垫。

### 4.4 角色状态与章节消费

- [ ] 生成章节前构建 `CharacterChapterContextBundle`。
- [ ] 上下文包合并小说角色实例、角色动态、关系张力、资源账本、伏笔账本。
- [ ] 上下文包只包含本章直接相关内容，避免把全量角色资料塞进 prompt。
- [ ] 章节生成后自动提取角色状态变化。
- [ ] 高风险状态变化进入用户确认，低风险状态变化可进入状态账本。
- [ ] 修复章节时必须带上角色红线和当前状态。

### 4.5 角色表达合同

- [ ] 为核心角色生成台词风格、句长、情绪外露程度、常见回避方式。
- [ ] 为亲密、冲突、受压、失控等场景生成表达差异。
- [ ] 标注角色禁用表达，避免所有人一股模型腔。
- [ ] 章节审稿检查角色台词是否串味。
- [ ] 局部修复时支持“只修这个角色的表达”。

### 4.6 角色成长曲线

- [ ] 把 `development` 拆成阶段曲线：起点误区、第一卷挫败、中段错误选择、关键代价、高光转折、最终变化。
- [ ] 将成长阶段绑定到卷和章节窗口。
- [ ] 审稿检查角色成长是否过快、过慢、缺铺垫。
- [ ] 章节规划阶段提醒本章是否需要推进角色成长。

### 4.7 角色出场经济

- [ ] 统计核心角色多久没有出场。
- [ ] 统计角色连续出场但没有叙事贡献的风险。
- [ ] 检查多个角色是否承担重复功能。
- [ ] 检查当前卷是否缺少压力源、情感牵引、反派代理或世界入口。
- [ ] 提醒某角色是否到了高光、退场、转折或暂缓出场的时机。

### 4.8 AI 推荐与新手流程

- [ ] 在开书和角色准备阶段，不要求用户先填完整角色卡。
- [ ] AI 根据题材、卖点、故事承诺推荐角色岗位缺口。
- [ ] 用户只需要确认推荐角色阵容，系统自动补齐叙事职责。
- [ ] 对新手显示“下一步推荐角色操作”，不显示复杂字段矩阵。
- [ ] 高级用户可以展开详细字段，但默认路径应保持低认知负担。

### 4.9 审稿与重规划

- [ ] 审稿检查角色是否 OOC。
- [ ] 审稿检查本章是否用了错误角色推动剧情。
- [ ] 审稿检查关系变化是否缺少铺垫。
- [ ] 审稿检查角色目标是否和当前状态冲突。
- [ ] 审稿检查主角是否被配角抢走推动权。
- [ ] 审稿检查反派是否降智。
- [ ] 重规划时把角色缺口、关系断裂、角色高光滞后作为触发原因。

## 5. 第一期开发方案

### 5.1 一期目标

第一期不做完整角色大系统，先做最能影响生成质量的闭环：

> 角色叙事岗位 MVP + 关系张力摘要 MVP + 章节角色上下文包 MVP。

一期完成后，章节生成前不再只拿“角色资料列表”，而是拿到一份面向写作的角色任务包。

### 5.2 一期范围

一期做：

- 小说角色叙事岗位结构化生成；
- 核心关系张力结构化摘要；
- 章节生成前的角色上下文包；
- 章节审稿时读取角色上下文包；
- 前端展示“本章角色任务”轻量面板；
- 针对角色岗位和上下文包的回归测试。

一期不做：

- 复杂角色库变体 UI；
- 全量关系图谱可视化；
- 长期角色出场经济仪表盘；
- 完整角色声音修复器；
- 多轮自动重规划。

### 5.3 数据合同建议

新增共享类型 `shared/types/characterNarrative.ts`。

核心结构：

```ts
interface CharacterNarrativeProfile {
  id: string;
  novelId: string;
  characterId: string;
  narrativeRole: string;
  existenceReason: string;
  readerReward: string;
  plotEngine: string;
  pressureTrigger?: string | null;
  relationshipDebt?: string | null;
  currentVolumeDuty?: string | null;
  nextTurnHint?: string | null;
  redLines: string[];
  voiceBrief?: CharacterVoiceBrief | null;
  confidence?: number | null;
}

interface CharacterRelationTensionBrief {
  relationId?: string | null;
  sourceCharacterId: string;
  targetCharacterId: string;
  surfaceRelation: string;
  hiddenTension: string;
  informationAsymmetry: string;
  emotionalDebt: string;
  nextTurnPoint: string;
  redLines: string[];
}

interface CharacterChapterContextBundle {
  novelId: string;
  chapterId: string;
  summary: string;
  activeCharacters: CharacterChapterRoleBrief[];
  relationTensions: CharacterRelationTensionBrief[];
  mustAdvance: string[];
  mustAvoid: string[];
  stateWarnings: string[];
}
```

### 5.4 Prisma 建议

一期建议新增两张表：

- `CharacterNarrativeProfile`
  - `novelId`
  - `characterId` unique
  - `narrativeRole`
  - `existenceReason`
  - `readerReward`
  - `plotEngine`
  - `pressureTrigger`
  - `relationshipDebt`
  - `currentVolumeDuty`
  - `nextTurnHint`
  - `redLinesJson`
  - `voiceBriefJson`
  - `confidence`

- `CharacterChapterContextBundle`
  - `novelId`
  - `chapterId` unique
  - `summary`
  - `activeCharactersJson`
  - `relationTensionsJson`
  - `mustAdvanceJson`
  - `mustAvoidJson`
  - `stateWarningsJson`
  - `sourceSnapshotId`
  - `confidence`

关系张力一期可以先复用 `CharacterRelation` 与 `CharacterRelationStage`，不用立刻新增第三张表。先由上下文包保存章节当下需要消费的关系张力摘要。

### 5.5 Prompt 资产

按 Prompt Governance 放入 `server/src/prompting/prompts/novel/`。

新增：

- `novel.character.narrativeProfile.generate@v1`
  - 输入：小说 framing、story macro、book contract、角色列表、当前卷信息。
  - 输出：每个角色的叙事岗位、存在理由、读者收益、剧情发动方式、红线。

- `novel.character.chapterContext.build@v1`
  - 输入：章节计划、角色叙事岗位、动态状态、关系、角色资源、伏笔账本。
  - 输出：本章角色上下文包。

可选：

- `novel.character.narrativeProfile.repair@v1`
  - 用于角色岗位缺失、重复、冲突时修复。

### 5.6 服务端模块

建议新增：

- `server/src/services/novel/characterNarrative/CharacterNarrativeProfileService.ts`
  - 生成/刷新角色叙事岗位；
  - 查询角色叙事岗位；
  - 检测岗位缺口和岗位重复。

- `server/src/services/novel/characterNarrative/CharacterChapterContextService.ts`
  - 构建章节角色上下文包；
  - 读取最近上下文包；
  - 为章节生成、审稿、修复提供压缩后的角色块。

- `server/src/routes/novelCharacterNarrativeRoutes.ts`
  - `GET /api/novels/:id/character-narrative-profiles`
  - `POST /api/novels/:id/character-narrative-profiles/refresh`
  - `GET /api/novels/:id/chapters/:chapterId/character-context`
  - `POST /api/novels/:id/chapters/:chapterId/character-context/build`

### 5.7 写作链路接入

一期必须接入三个位置：

1. 章节细化阶段
   - 章节目的、边界、任务摘要中加入角色任务；
   - 避免章节计划只推进事件，不推进角色关系和状态。

2. 章节执行阶段
   - writer prompt 消费 `CharacterChapterContextBundle`；
   - 明确本章角色必须推进和禁止写崩的点。

3. 审稿/修复阶段
   - 审稿检查角色 OOC、关系跳变、目标状态冲突；
   - 修复时优先局部修正角色表达、行为动机和关系铺垫。

### 5.8 前端一期入口

保持低认知负担，不做大型角色后台。

新增轻量入口：

- 小说角色页：增加“本书职责”区块；
- 章节工作台：增加“本章角色任务”面板；
- 审稿结果：增加“角色一致性”问题分类；
- 创作中枢：当角色阵容缺岗位时给出建议动作。

用户可见文案应写成任务视角：

- “这个角色在本书负责制造什么推进”
- “本章需要让这些角色完成什么变化”
- “这些关系变化需要铺垫”
- “当前角色目标和本章行动不一致”

避免使用“字段已迁移”“系统已更新”“状态同步模块”等实现口吻。

### 5.9 一期验收标准

- 给定一本已有角色的小说，AI 能生成每个核心角色的叙事岗位。
- 给定一个章节，系统能构建本章角色上下文包。
- 章节生成 prompt 能消费角色上下文包，而不是只消费角色列表。
- 审稿能识别至少三类角色问题：OOC、关系跳变、目标状态冲突。
- 新增逻辑不依赖关键词硬编码判断角色岗位。
- 没有把小说运行状态同步到角色库。
- 路由和服务有针对性回归测试。

### 5.10 推荐开发顺序

1. 新增 shared types 与 Prisma 模型。
2. 新增叙事岗位 prompt 和 profile service。
3. 新增章节角色上下文 prompt 和 context service。
4. 接入章节生成上下文组装。
5. 接入审稿/修复的角色一致性检查。
6. 增加小说角色页与章节工作台的轻量 UI。
7. 补测试：schema、service、route、章节上下文消费。

## 6. 风险与约束

- 不要把一期做成“更多角色表单”。用户默认不填字段，AI 先推荐。
- 不要通过关键词判断角色职责，必须走结构化 AI 输出。
- 不要让角色库直接进入章节写作，章节写作只消费小说内角色实例和上下文包。
- 不要让上下文包无限膨胀，要按当前章节裁剪。
- 不要让关系张力变成纯展示信息，它必须进入章节生成和审稿。

## 7. 与现有角色资源账本的关系

`character-resource-ledger-plan.md` 负责角色拥有什么、能用什么、不能突然拿出什么。

本方案负责角色为什么存在、如何制造剧情、当前章节该推动什么。

两者在章节上下文包中汇合：

- 角色叙事岗位决定“这个角色本章应该做什么”；
- 角色资源账本决定“这个角色本章能不能做这件事”；
- 关系张力决定“这件事会如何影响其他角色”；
- 审稿和修复根据三者一起判断章节是否写崩。
