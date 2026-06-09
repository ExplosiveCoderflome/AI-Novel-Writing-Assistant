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

### 一、世界切片污染防止（`storyWorldSlice.prompts.ts`）

**规则**：切片自由文本字段（`coreWorldFrame`、`pressureSources` 等）禁止直接使用世界资产的专有名称，必须使用通用叙事语言（如"地方权贵"而非"曹国栋家族"）。专有名称只允许出现在 `appliedRules/activeForces/activeLocations` 的 `id` 引用字段中。

**重建工具**：`rebuild_story_world_slice` Agent 工具，强制触发 `NovelWorldSliceService.refreshWorldSlice()`，修复已污染的切片。

**失效模式**：如果世界设定本身内部没有结构化 id（即 `structuredDataJson` 为空，走 legacy 路径），则切片可能仍使用旧名词。需要先为世界生成结构化数据。

### 二、已完成里程碑（`ChapterWriteContext.completedMilestones`）

**字段**：在 `chapterWriteContextSchema` 中新增 `completedMilestones: z.array(z.string()).default([])`。

**渲染位置**：`buildChapterWriterContextBlocks()` 的 `chapter_mission` block 中，在 `mustAdvance` 列表**之前**渲染 `Already completed — do NOT re-pursue` 列表。

**写入规则**：此字段由上游章节规划/状态同步服务在构建 `ChapterWriteContext` 时填入，反映当前章节写作前已明确完成的过程性事件。如为空，则不渲染此块，不影响现有生成逻辑。

**关联提示词约束**：`chapterWriter.prompts.ts` 系统提示词增加：禁止重复追求 `completedMilestones` 中已完成的目标。

### 三、场景模式黑名单（`ChapterWriteContext.recentScenePatterns`）

**字段**：在 `chapterWriteContextSchema` 中新增 `recentScenePatterns: z.array(z.string()).default([])`。

**渲染位置**：`buildChapterWriterContextBlocks()` 的 `opening_constraints` block 中，追加 `Scene pattern blacklist` 列表。

**写入规则**：此字段由章节摘要服务提取近期已出现的高频场景模式（时间+地点+动作三要素）后填入。如为空，不渲染，不影响现有逻辑。

**关联提示词约束**：`chapterWriter.prompts.ts` 系统提示词增加：禁止重复使用黑名单中的场景模式。

### 四、卷级关键节点守卫（`VolumeWindowContext.keyMilestoneGuards`）

**字段**：在 `volumeWindowContextSchema` 中新增：
```typescript
keyMilestoneGuards: z.array(volumeKeyMilestoneGuardSchema).default([])
// 每项包含 targetChapterRange / event / status / note
```

**渲染位置**：`buildChapterWriterContextBlocks()` 的 `volume_window` block 中，过滤掉 `status=done` 的守卫，剩余守卫以列表渲染为 `Volume key milestone guards — pacing constraints`。

**写入规则**：此字段由卷规划服务在构建 `VolumeWindowContext` 时填入，标注哪些关键事件应在哪个章节范围才允许发生。如为空，不渲染。

### 五、章节连续性诊断工具（`audit_chapter_continuity`）

**Agent 工具**：`inspect` 类，`riskLevel=low`，不需要 LLM，基于关键词组匹配实现确定性检测。

**检测内容**：
- 场景模式重复：预定义的关键词组（如 `["凌晨", "旅馆", "蹲"]`）在哪些章节中同时出现
- 开头段落重复：提取前 30 字作为前缀，前缀相同的章节出现 3 次以上则标记

**输出**：`repetitionClusters`、`openingPatternClusters`、`hasCriticalIssues` 和修复建议。

## 失效模式

- `completedMilestones` 和 `recentScenePatterns` 依赖上游服务在构建上下文时正确填入，若上游不填，这两个守卫就不生效。本次修改只建立了接口契约，数据填充需要在章节运行时协调器中实现。
- `keyMilestoneGuards` 目前初始化为空数组，需要卷规划服务在生成卷结构时填充守卫数据，否则 `volume_window` block 中不会出现守卫内容。
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
