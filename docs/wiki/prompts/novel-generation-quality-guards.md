# 小说生成质量守卫机制

## 背景

在小说自动生成过程中，存在四类系统性质量问题，会导致生成内容连续性断裂或大量重复：

1. **世界来源污染**：绑定世界的历史时代/地域与当前故事背景不匹配，世界切片中的专有名词污染章节写作上下文。
2. **里程碑状态缺失**：过程性事件（办执照、签合同、盖章）完成后没有不可逆状态记录，导致后续章节反复"追求"已完成目标。
3. **场景模式重复**：相同时间+地点+动作组合（如"凌晨四点蹲旅馆"）在多章中反复出现，因上下文中没有显式黑名单机制。
4. **卷节奏失控**：卷计划中的高潮节点（谣言爆发、固定摊位签约）因无守卫约束，被 LLM 提前写出，导致后续章节无目标可推进。

## 决策

在提示词上下文、共享类型和 Agent 工具三个层面分别添加守卫机制，而非在前端做展示层修补。

## 当前规则与实现

### 一、写手级四轮过闸

**目标**：让自动导演和章节生产先按优秀写手的判断顺序处理章节，再处理语言润色。它不能保证模型等同真人作家，但能把“好写手会先检查什么”固化到默认路径里。

**四轮顺序**：

1. **场景功能**：每个主要场景至少改变信息、关系、风险、资源或决策中的一项。
2. **现场落地**：设定和情绪必须落到动作、对白、物件、身体反应、误会或后果中，不写说明书。
3. **人物口吻**：重要角色要有不同的说话节奏、避讳、试探、嘴硬或小动作。
4. **收束回灌**：章末留下可延续的压力、选择、代价或新义务，并让新硬事实可被后续记录。

**作用范围**：

- 首页和自动导演入口把“你判断方向，AI 负责规划/写章/审校/回灌”的路径作为推荐用法。
- 默认写法资产 `我的默认网文去 AI 味写法` 绑定场景功能、状态变化、对白潜台词和场景代价规则。
- `directorPlanning.prompts.ts` 要求候选、蓝图和 Book Contract 能支撑自然人味正文，不靠宏大说明或抽象主题撑质感。
- `chapterWriter.prompts.ts` 在正文输出前执行内部四轮判断。
- `review.prompts.ts` 和 `chapterAcceptance.prompts.ts` 会把“语言顺滑但场景没动”视为质量风险，而不是普通润色问题。

### 二、世界切片污染防止（`storyWorldSlice.prompts.ts`）

**规则**：切片自由文本字段（`coreWorldFrame`、`pressureSources` 等）禁止直接使用世界资产的专有名称，必须使用通用叙事语言（如"地方权贵"而非"曹国栋家族"）。专有名称只允许出现在 `appliedRules/activeForces/activeLocations` 的 `id` 引用字段中。

**重建工具**：`rebuild_story_world_slice` Agent 工具，强制触发 `NovelWorldSliceService.refreshWorldSlice()`，修复已污染的切片。

**失效模式**：如果世界设定本身内部没有结构化 id（即 `structuredDataJson` 为空，走 legacy 路径），则切片可能仍使用旧名词。需要先为世界生成结构化数据。

### 三、已完成里程碑（`ChapterWriteContext.completedMilestones`）

**字段**：在 `chapterWriteContextSchema` 中新增 `completedMilestones: z.array(z.string()).default([])`。

**渲染位置**：`buildChapterWriterContextBlocks()` 的 `chapter_mission` block 中，在 `mustAdvance` 列表**之前**渲染 `Already completed — do NOT re-pursue` 列表。

**写入规则**：此字段由上游章节规划/状态同步服务在构建 `ChapterWriteContext` 时填入，反映当前章节写作前已明确完成的过程性事件。如为空，则不渲染此块，不影响现有生成逻辑。

**关联提示词约束**：`chapterWriter.prompts.ts` 系统提示词增加：禁止重复追求 `completedMilestones` 中已完成的目标。

### 四、场景模式黑名单（`ChapterWriteContext.recentScenePatterns`）

**字段**：在 `chapterWriteContextSchema` 中新增 `recentScenePatterns: z.array(z.string()).default([])`。

**渲染位置**：`buildChapterWriterContextBlocks()` 的 `opening_constraints` block 中，追加 `Scene pattern blacklist` 列表。

**写入规则**：此字段由章节摘要服务提取近期已出现的高频场景模式（时间+地点+动作三要素）后填入。如为空，不渲染，不影响现有逻辑。

**关联提示词约束**：`chapterWriter.prompts.ts` 系统提示词增加：禁止重复使用黑名单中的场景模式。

### 五、卷级关键节点守卫（`VolumeWindowContext.keyMilestoneGuards`）

**字段**：在 `volumeWindowContextSchema` 中新增：
```typescript
keyMilestoneGuards: z.array(volumeKeyMilestoneGuardSchema).default([])
// 每项包含 targetChapterRange / event / status / note
```

**渲染位置**：`buildChapterWriterContextBlocks()` 的 `volume_window` block 中，过滤掉 `status=done` 的守卫，剩余守卫以列表渲染为 `Volume key milestone guards — pacing constraints`。

**写入规则**：此字段由卷规划服务在构建 `VolumeWindowContext` 时填入，标注哪些关键事件应在哪个章节范围才允许发生。如为空，不渲染。

### 六、叙事进度与角色缺席信号

**叙事进度字段**：`ChapterWriteContext.narrativeProgressHint` 是可选写作提示，由运行时根据 `chapter.order / novel.estimatedChapterCount` 计算。总章数为空或小于等于 0 时不生成该字段。

**渲染位置**：`buildChapterWriterContextBlocks()` 中以 `narrative_progress_hint` block 注入，`priority=98`，`required=false`。它只提示当前处于开局、发展、收敛或尾声阶段，不能替代章节任务、义务契约、时间线约束或角色硬事实。

**角色缺席信号**：`requiredCharacterAppearances` 仍只由角色选择逻辑决定是否纳入。若已纳入的角色 `absenceRisk=high` 且 `absenceSpan>0`，可在角色名后追加自然带出的提示，提醒 writer 该角色长期缺席，但不强制改写选角结果。

**角色信息边界**：章节后置统一抽取 prompt `chapterArtifactDeltaPrompt` 输出 `characterKnowledgeStates`，只在本章存在显著信息差时记录角色已知事实与仍未知事实。该字段用于更新角色当前状态中的信息边界，`characterDynamicsExtractionPrompt` 的同名字段只作为 artifact delta 未成功时的兜底口径。

**维护边界**：不要用固定章节号硬编码“第几章必须收束”。如果节奏判断需要变化，应调整 `buildNarrativeProgressHint()` 的阶段规则或上游预计总章数，而不是在 prompt 模板中堆特殊分支。

### 七、上下文预算观测

**预算目标**：writer 阶段当前上下文预算以 `tokenBudgetPolicy.stageTokenCap.writer` 为准，默认值为 2600。高优先必选块应保持克制，避免必选约束本身吞掉过多预算。

**观测方式**：`buildCompressionLog()` 只按 block priority 估算在预算内会保留哪些 block，并用 `summarizeContextBlock()` 模拟超预算 block 能否被截断摘要；摘要可放入时记录到 `summarized`，否则可选 block 记录到 `dropped`。它不改变 `selectContextBlocks()`、不触发真实生成路径的摘要、不影响生成结果。

**诊断规则**：如果日志显示 `priority >= 99 && required=true` 的必选块长期超过 writer 预算的 25%，应单独评估是否把部分约束降为 `priority=95` 且 `required=false`。不能为了日志好看直接删掉时间线、上一章承接、角色硬事实或本章义务契约。

### 八、章节连续性诊断工具（`audit_chapter_continuity`）

**Agent 工具**：`inspect` 类，`riskLevel=low`，不需要 LLM，基于关键词组匹配实现确定性检测。

**检测内容**：
- 场景模式重复：预定义的关键词组（如 `["凌晨", "旅馆", "蹲"]`）在哪些章节中同时出现
- 开头段落重复：提取前 30 字作为前缀，前缀相同的章节出现 3 次以上则标记

**输出**：`repetitionClusters`、`openingPatternClusters`、`hasCriticalIssues` 和修复建议。

## 失效模式

- `completedMilestones` 和 `recentScenePatterns` 依赖上游服务在构建上下文时正确填入，若上游不填，这两个守卫就不生效。本次修改只建立了接口契约，数据填充需要在章节运行时协调器中实现。
- `keyMilestoneGuards` 目前初始化为空数组，需要卷规划服务在生成卷结构时填充守卫数据，否则 `volume_window` block 中不会出现守卫内容。
- `narrativeProgressHint` 依赖小说预计总章数。没有 `estimatedChapterCount` 时应自然跳过，不应为了显示进度而猜测总章数。
- `requiredCharacterAppearances` 的缺席提示只附加在已经进入义务契约的角色上；如果角色根本没有进入该列表，应先检查角色动态概览和选角规则，而不是在提示词里硬塞角色名。
- `characterKnowledgeStates` 只记录明显信息差。若所有角色都自然知晓同一事实，应省略该字段，避免把普通剧情进展误写成长期信息边界。

- `buildCompressionLog()` 是观测工具。若日志显示 dropped，不代表实际生成已经丢弃同名 block，真实裁剪仍以 prompt runner 的 context selection 为准。
- `rebuild_story_world_slice` 重建切片后，如果后续又触发了 `ensureStoryWorldSlice` 且 stale 检测显示为最新状态，则已重建的切片会被复用而非再次生成，这是预期行为。

## 相关模块

- `server/src/prompting/prompts/storyWorldSlice/storyWorldSlice.prompts.ts`
- `server/src/agents/tools/worldTools.ts`（`rebuild_story_world_slice`）
- `server/src/agents/tools/bookAnalysisTools.ts`（`audit_chapter_continuity`）
- `server/src/prompting/prompts/novel/chapterLayeredContext.ts`
- `server/src/prompting/prompts/novel/chapterWriter.prompts.ts`
- `shared/types/chapterRuntime.ts`（`ChapterWriteContext`、`VolumeWindowContext`）

## 源文档

- 2026-06-08 小说生成质量问题分析与优化方案（内部设计评审）
