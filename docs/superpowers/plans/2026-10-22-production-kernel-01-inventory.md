# 正文生产内核 · 计划 01：只读盘点

状态：**可交付**，适合低阶 LLM 执行。
**目标：** 为内核设计产出五份盘点文档：规则清单、决策点、V2 分支、短篇能力、状态表归属。
**性质：** 只读。**不得修改任何源代码、测试、schema 或配置。** 只允许在 `docs/superpowers/inventory/production-kernel/` 下新建文档，并在 `docs/superpowers/reports/production-kernel/` 下写报告。

先读：`docs/superpowers/plans/2026-10-22-production-kernel-00-roadmap.md`（全局约束与停止条件），以及 `docs/superpowers/specs/2026-10-22-production-kernel-design.md` 第 3～7 节（理解"内核归属"一列里各个取值的含义）。

## 通用规则

- 所有文档用中文。表格列名和列顺序必须与本计划一致，不得增删列。
- 每一行都必须有代码证据，写成 `路径:行号`，路径相对于仓库根目录。找不到证据时写 `UNKNOWN`，并在报告中列出。
- 不得猜测。拿不准的分类写 `UNKNOWN`，并附一句原因。
- 命令在仓库根目录 `D:\code\ai-production-kernel` 下的 PowerShell 中执行。PowerShell 5.1 对中文正则不可靠，需要匹配中文时，用 Grep 工具或 `node -e` 执行。

"内核归属"一列只允许以下取值：

| 取值 | 含义 |
| --- | --- |
| `decision` | 决策器 `decideNext` 的一条规则 |
| `stage:<阶段名>` | 某个单元阶段的内部行为，阶段名取 prepare、draft、accept、repair、verify、select、commit、reconcile 之一 |
| `work_stage` | 作品级阶段（全篇审校或修复） |
| `port:story_state` | 故事状态端口 |
| `port:budget` | 预算端口 |
| `port:fence` | 所有权或取消围栏 |
| `profile` | 生产配置中的一项参数 |
| `caller` | 调用方（V2 或短篇编排）的职责，不属于内核 |
| `ui_projection` | 前端展示规则，不属于内核 |
| `v1_only` | 只与 V1 有关，内核不继承 |
| `obsolete` | 文档中已声明退役 |
| `UNKNOWN` | 无法判定 |

## Task 1：生产规则清单

**输出：** `docs/superpowers/inventory/production-kernel/01-production-rules.md`

**来源文档**（逐个读完）：

- `docs/wiki/workflows/chapter-production-chain.md`
- `docs/wiki/architecture/chapter-runtime-boundaries.md`
- `docs/wiki/workflows/chapter-review-retry-policy.md`
- `docs/wiki/workflows/quality-debt-attribution.md`
- `docs/wiki/workflows/chapter-artifact-delta-reliability.md`
- `docs/wiki/workflows/chapter-automatic-recovery.md`
- `docs/wiki/workflows/payoff-ledger-contract.md`
- `docs/wiki/workflows/novel-fact-ledger.md`
- `docs/wiki/workflows/timeline-constraint-layer.md`
- `docs/wiki/workflows/character-resource-ledger.md`
- `docs/wiki/workflows/character-location-continuity.md`
- `docs/wiki/architecture/manual-chapter-persistence-boundaries.md`
- `docs/wiki/workflows/chapter-editor.md`
- `docs/wiki/workflows/creation-studio-short-story.md`
- `docs/wiki/prompts/novel-generation-quality-guards.md`
- `docs/wiki/debugging/character-continuity-hard-facts.md`

**做法：**

1. 规则的认定：凡是包含"必须、不得、不能、只能、只允许、禁止、唯一、最多"之一的句子，或者列表项，算一条规则。
2. 同一含义在多处重复出现时，合并为一行，"来源"列列出所有出处。
3. 每条规则找到实现它的代码，写成 `路径:行号`。实现分散在多处时，最多写 3 处。

**表格列：**

| ID | 规则（一句话复述） | 来源（文档#小节） | 代码证据 | 内核归属 | 可测试方式 |
| --- | --- | --- | --- | --- | --- |

- ID 格式为 `R001`、`R002`……
- "可测试方式"只允许填 `纯函数`、`临时库集成`、`结构检查（rg）`、`不可测`，后两者附原因。

**完整性自检**（写进报告）：

- 每份来源文档里抽查 5 句含关键词的句子，确认都能在表中找到对应 ID。
- 统计各"内核归属"取值的行数。

## Task 2：单章流水线的决策点

**输出：** `docs/superpowers/inventory/production-kernel/02-pipeline-decision-points.md`

**来源代码：**

- `server/src/services/novel/runtime/chapterRuntimePipeline.ts`，函数 `runPipelineChapterWithRuntime`、`resumeFinalizedPipelineChapter`、`repairDraftContent`、`shouldDeferNonPatchableReviewRisk`、`buildQualityDebtAttribution`
- `server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts`
- `server/src/services/novel/runtime/repair/ChapterRepairEligibility.ts`
- `server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts`
- `server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts`
- `server/src/services/novel/production/NovelPipelineExecutor.ts`（只记录与单章决策有关的分支）

**做法：** 逐个列出上述函数里的每一个 `if`、三元表达式、`break`、`return` 和 `throw`，回答两个问题："在什么条件下，走向哪个结果"。

**表格列：**

| ID | 位置（路径:行号） | 条件（用自然语言复述） | 结果 | 输入来源 | 对应规则 ID | 内核归属 |
| --- | --- | --- | --- | --- | --- | --- |

- ID 格式为 `D001`……
- "结果"列只允许填：`继续下一轮`、`采用候选稿`、`保留原稿`、`记录质量债`、`标记需修复`、`暂停等待人工`、`停止并重规划`、`失败`、`结束`、`其他：<说明>`。
- "输入来源"列只允许填：`AI 结构化输出`、`确定性文本检测`、`调用方参数`、`持久化状态`、`混合`。
- "对应规则 ID"填 Task 1 中的 ID。找不到对应规则时写 `无`。这类行是"代码中有、文档中没有"的隐含规则，**必须**在报告中单独列出。

## Task 3：旧生产代码中的 V2 分支

**输出：** `docs/superpowers/inventory/production-kernel/03-v2-branches.md`

**命令：**

```powershell
rg -n "director_v2|directorNext|isCurrentV2|V2|v2Run|runExecution|directorVersion" server/src/services/novel/runtime server/src/services/novel/production server/src/services/novel/state server/src/services/novel/chapterEditor server/src/services/novel/fact server/src/services/novel/dynamics server/src/services/novel/quality -g "*.ts"
```

**做法：** 命令输出的每一行在表中占一行，不得遗漏。纯注释行也要列出，分类写 `注释`。

**表格列：**

| ID | 位置（路径:行号） | 代码片段（不超过 80 字） | 作用（一句话） | 分类 | 内核接管后的处理 |
| --- | --- | --- | --- | --- | --- |

- ID 格式为 `B001`……
- "分类"只允许填：`V2 专属行为`、`V1/V2 版本判断`、`类型或参数透传`、`注释`、`误匹配`。
- "内核接管后的处理"只允许填：`计划 07 删除`、`改为内核阶段行为`、`保留（V1 也需要）`、`误匹配无需处理`、`UNKNOWN`。

**完整性自检：** 表格行数必须等于命令输出的行数，两个数字都写进报告。

## Task 4：短篇生产能力

**输出：** `docs/superpowers/inventory/production-kernel/04-short-story-capabilities.md`

**来源：**

- `server/src/modules/novel/short-story/`（全部文件）
- `server/src/prompting/prompts/shortStory/shortStory.prompts.ts`
- `server/src/prisma/schema.prisma` 中的 `ShortStoryPlan`、`ShortStorySegment` 模型
- `docs/wiki/workflows/creation-studio-short-story.md`
- 进行中的短篇分支（只读）：`git diff main...codex/short-story-revision-recovery --stat`，以及该分支中与短篇相关的文件差异

**分四节：**

**第 1 节：流程表。** 按执行顺序列出短篇生产的每一步。

| 步骤 | 函数（路径:行号） | 使用的 Prompt | 读写的表与字段 | 失败或暂停的处理 |
| --- | --- | --- | --- | --- |

**第 2 节：七项能力对照表。** 七行，依次为事实一致、人物状态、信息来源、因果与承诺兑现、审校、修后核对、编辑保护。

| 能力 | 短篇的实现（路径:行号，没有则写"无"） | 长篇的对应实现（路径:行号） | 差异 | 可否直接使用内核同名阶段 |
| --- | --- | --- | --- | --- |

"可否直接使用"一列只允许填 `可以`、`需配置参数`、`需作品级阶段`、`UNKNOWN`。

**第 3 节：篇幅相关的参数。** 列出短篇特有的预算、段数、字数、连续性、审校范围、修复次数等，每项写明它在代码里的来源。这些是 `short_story` 配置的原始素材。

**第 4 节：进行中分支的影响。** 列出 `codex/short-story-revision-recovery` 改动了上述哪些步骤和能力。如果该分支不存在，写"分支不存在"。

## Task 5：状态表归属

**输出：** `docs/superpowers/inventory/production-kernel/05-state-stores.md`

**要盘点的模型：** `ConsistencyFact`、`NovelFactEntry`、`StoryStateSnapshot`、`CharacterState`、`RelationState`、`InformationState`、`ForeshadowState`、`PayoffLedgerItem`、`CharacterResourceLedgerItem`、`CanonicalStateVersion`、`StateChangeProposal`、`CharacterTimeline`、`StoryTimelineEvent`、`TimelineHook`、`TimelineConstraint`、`TimelineCheckReport`、`AuditReport`、`AuditIssue`、`ChapterSummary`、`CharacterSyncProposal`、`CharacterMindSnapshot`，以及 `Chapter` 上的 `riskFlags`、`generationState`、`chapterStatus`。

**命令**（每个模型执行一次，把 `<model>` 换成首字母小写的模型名）：

```powershell
rg -n "\.<model>\.(create|createMany|upsert|update|updateMany|delete|deleteMany)\b" server/src -g "*.ts"
rg -n "\.<model>\.(findMany|findUnique|findFirst|count|aggregate|groupBy)\b|<model>:\s*\{|include:\s*\{[^}]*<model>" server/src -g "*.ts"
```

**表格列：**

| 模型 | 写入方（路径:行号） | 读取方（路径:行号，最多 5 处） | 服务的能力 | 与其他模型的重复或重叠 | 建议的端口方法 |
| --- | --- | --- | --- | --- | --- |

- "服务的能力"只允许填七项能力的名称，可以填多项。
- "建议的端口方法"写成 `storyState.<动词><名词>` 的形式，例如 `storyState.readCharacterHardFacts`。不确定时写 `UNKNOWN`。
- 只读不写的模型、只写不读的模型，必须在报告中单独列出。

## Task 6：报告与提交

1. 写报告 `docs/superpowers/reports/production-kernel/01-<YYYY-MM-DD>.md`，内容包括：
   - 五份文档的路径和行数；
   - 各 Task 的完整性自检结果；
   - 所有 `UNKNOWN` 项；
   - Task 2 中"代码中有、文档中没有"的隐含规则；
   - 只读不写、只写不读的模型。
2. 提交（只添加本计划产出的文件）：

```powershell
git add docs/superpowers/inventory/production-kernel docs/superpowers/reports/production-kernel
git commit -m "优化：盘点正文生产内核所需的规则、决策点与状态归属"
```

3. 确认 `git status --short` 中没有其他改动。

## 停止条件

在计划 00 的 G1～G6 之外，再加两条：

| 编号 | 情况 |
| --- | --- |
| S1 | 发现自己需要修改任何非文档文件 |
| S2 | 单个 Task 的 `UNKNOWN` 超过该表行数的 20% |

## 验收者检查项（我来做）

1. `git diff --stat main..HEAD` 中只有文档。
2. 抽查 Task 1 中的 10 条规则和 Task 2 中的 10 个决策点，核对代码证据的行号是否正确。
3. 重新运行 Task 3 的命令，核对行数是否与表格一致。
4. 抽查 Task 5 中的 3 个模型，核对写入方是否齐全。
5. 判断 Task 2 列出的隐含规则是否需要补进 wiki。
