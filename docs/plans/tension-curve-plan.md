# 节奏紧张度曲线方案（P1）

## 优先级与前置条件

**优先级：P1（重要但不立即启动）。**

当前阶段的主线仍然是继续增强各模块的坚固性与灵活性（章节生产链稳定性、状态回灌可靠性、写法引擎与上下文组装的健壮性等加固工作）。本方案在这些加固工作取得阶段性收敛之前不启动实现，先以设计文档形式沉淀，避免灵感散失。

启动本方案前应满足：

- 拆章 / 章节细化 / 重规划链路近期无高频回归问题。
- 章节更新接口与卷规划草稿状态（draft state)在前端的编辑-保存链路稳定。

## 背景

节奏 / 拆章与卷战略阶段目前对"这一卷的节奏形状"没有任何直观呈现。逐章的冲突强度数据其实已经存在并参与生成链路：

- `shared/types/novel.ts` 的 `VolumeChapterPlan` 已有 `conflictLevel?: number | null` 与 `revealLevel?: number | null` 两个逐章字段。
- 拆章生成时 AI 会为每章打分；章节细化、任务单质量审查与正文写作的 prompt（`server/src/prompting/prompts/novel/volume/shared.ts`）都会把 `conflict level` / `reveal level` 送入上下文。
- 前端章节卡片（`client/src/pages/novels/components/StructuredChapterDetailCard.tsx` 等）以单章数字形式展示。

问题在于：这些数值埋在一张张章节卡片里，用户无法一眼看出"这一卷中段是不是太平了""高潮是不是全堆在卷尾前两章"。对目标用户（不懂写作的新手）来说，说不出"第 23 章冲突应该是 7"，但一眼能看出曲线形状不对。这正是长篇最常见的失败模式：中段拖沓、高潮拥挤、章末无钩。

## 目标

在节奏 / 拆章工作台（并在卷战略页提供只读缩略视图）增加一条以章节为最小单位的**紧张度曲线**：

1. **展示**：X 轴 = 章节序号，Y 轴 = `conflictLevel`；视窗支持"整卷"与"单个节奏段（beat）"切换，章节到节奏段的映射复用 `VolumeBeat` 的既有归属关系。
2. **默认生成**：曲线直接来自拆章已生成的逐章 `conflictLevel`，不需要新的生成步骤；无值章节以断点或灰点呈现。
3. **手动拨动**：拖动某章的点即修改该章 `conflictLevel`，走既有章节规划更新接口保存。
4. **消费闭环**：手动调整过的值标记为"用户锚定"，后续章节细化、重规划、正文生成必须尊重锚定值，并把"本章目标冲突强度 + 相对前后章走势（升 / 降 / 持平）"写入 prompt。

## 核心设计决策

### 1. 用户锚定 vs AI 生成值（不可协商）

- 用户拖动过的点持久化为**锚定值**，与 AI 生成值在数据上可区分（例如 `conflictLevelSource: "ai" | "user"` 或等价机制），UI 上视觉区分。
- 重规划（replan window）与重新拆章时，锚定值作为**硬约束**传入 prompt，AI 不得重新打分覆盖；只有用户显式"解除锚定"或整卷重置时才回到 AI 托管。
- 理由：不定这条规则，功能上线后必然出现"我调好的曲线被一次重规划抹平"的挫败感——与 PR #78 修复的"手动 JSON 规则被特征编译覆盖"是同一类"手动编辑被自动链路静默覆盖"问题，这类问题在本项目已有前科，必须在设计期堵住。

### 2. 画"形状约束"，不只画点

曲线的增量价值在相邻关系而非单点数值：

- 形状体检提示（纯前端启发式即可起步）：连续 N 章持平提示"节奏平坝"；卷末应有全卷最高峰；每个 beat 内部应有小起伏。
- 默认参考线：按题材（升级流 / 悬疑流等）提供参考形状模板，用户在参考线基础上微调，显著优于从零拨点。参考形状模板可先硬编码常量起步，后续再考虑沉淀为可配置资产。

### 3. 多序列架构，单序列起步

- 第一期只做 `conflictLevel` 单曲线。
- 前端曲线组件按"多序列"设计：`revealLevel` 是现成的第二条曲线（冲突线 + 揭示线双轨是编剧工具的经典组合），后续还可能有情绪强度等序列。组件 props 层面预留序列数组，避免第二期重写。

## 不做的事

- 不新增独立的"紧张度"数据模型主体；复用 `VolumeChapterPlan.conflictLevel`。
- 第一期不做 `revealLevel` 及其他参数的可编辑曲线（仅架构预留）。
- 不在本方案内改动重规划的窗口决策算法本身，只是把锚定值作为约束输入。
- 不做跨卷的整本级曲线（第一期视窗最大到单卷）。

## 执行前已核实的数据链路事实

以下事实已在代码中确认，方案基于它们展开：

- Prisma 模型：`server/src/prisma/schema.prisma` 中 `VolumeChapterPlan`（约 1719 行起）与 `Chapter`（约 491 行附近）**两张表都持有 `conflictLevel Int?`**，量纲为 **0–100**（HTTP schema 约束 `min(0).max(100)`）。规划态真源是 `VolumeChapterPlan`，`Chapter` 上的值经同步链（`server/src/services/novel/volume/VolumeChapterSyncService.ts` / `ChapterExecutionContractService.ts`）流向执行态。
- HTTP 入参：`server/src/modules/novel/http/novelHttpSchemas.ts` 的 `volumeChapterSchema`（卷工作区保存，72 行附近）与 `updateChapterSchema`（章节更新，225 行附近）均已接受 `conflictLevel`。
- 规划落库：`server/src/services/novel/volume/volumeWorkspacePersistence.ts` 是 `volumeChapterPlan.update` 的写入点。
- 重规划：`server/src/services/planner/PlannerService.ts` + `server/src/services/planner/ReplanWindowDecisionService.ts`；即时章节规划走 `server/src/services/novel/planning/ChapterPlanJITService.ts`。
- Prompt 消费：`server/src/prompting/prompts/novel/volume/shared.ts`（421–440 行附近）已把 `conflict level` 注入章节细化与任务单上下文。
- 前端：节奏拆章工作台在 `client/src/pages/novels/components/StructuredOutlineTab.tsx` / `StructuredOutlineWorkspace.tsx` / `StructuredChapterListCard.tsx`，编辑草稿态在 `client/src/pages/novels/hooks/useNovelVolumePlanning.draft.ts`，客户端 API 在 `client/src/api/novel/chapters.ts`（已含 `conflictLevel` 字段）。

## 分步执行方案（文件层级）

### Part A：锚定语义与数据层

1. `shared/types/novel.ts`
   - `VolumeChapterPlan` 接口新增可选字段 `conflictLevelSource?: "ai" | "user" | null`（命名以实现时统一为准，下同）。
2. `server/src/prisma/schema.prisma` + `prisma migrate`
   - 仅 `VolumeChapterPlan` 表新增来源标记列（String? 或等价枚举），默认 null 视作 "ai"。**不动 `Chapter` 表**——执行态只消费值，不需要锚定语义。
3. `server/src/modules/novel/http/novelHttpSchemas.ts`
   - `volumeChapterSchema` 新增可选的来源标记入参；`updateChapterSchema` 不动。
4. `server/src/services/novel/volume/volumeWorkspacePersistence.ts`
   - 写入链透传来源标记；**关键规则**：请求显式携带 `conflictLevel` 且标记为 user 时落 "user"；AI 生成路径落 "ai"；未携带则保留 DB 现值（对齐 PR #78 的 hasOwnProperty 判断模式，避免静默覆盖）。
5. 映射层（`legacyVolumeSource.ts` / `volumeDraftContext.ts` 等 row→DTO 处）
   - 读取链带出来源标记，前端可见。

Part A 验证：`server` 与 `shared` typecheck；migration 可前滚；新增单测覆盖"显式 user 值不被 AI 路径覆盖 / 未携带字段不改变现值"。

### Part B：生成与重规划链路尊重锚定

1. `server/src/services/novel/volume/volumeChapterListGeneration.ts`
   - 重新拆章时：对已存在且 `conflictLevelSource = "user"` 的章节，生成后回写阶段保留用户值与标记；prompt 侧把锚定章节的值作为已知约束注入（含章节序号与目标值清单）。
2. `server/src/prompting/prompts/novel/volume/chapterDetail.prompts.ts` + `shared.ts`
   - 章节细化上下文中锚定章节的 conflict level 标注为"用户指定，不可更改"；同时补充相对前后章的走势描述（升/降/持平），无论锚定与否都注入。
3. 重规划链路（`server/src/services/planner/PlannerService.ts` 消费侧 + 重规划落库处）
   - 重规划窗口内的锚定值清单作为硬约束进入重规划 prompt；落库时对 user 标记章节保留原值原标记。**不改 `ReplanWindowDecisionService` 的窗口决策算法**。
4. `server/src/services/novel/volume/VolumeChapterSyncService.ts`
   - 确认规划→执行同步仍单向传值，锚定标记不进入 `Chapter` 表。

Part B 验证：新增专项测试文件（`server/tests/` 下，如 `tensionCurveAnchoring.test.js`）——覆盖"重新拆章不覆盖 user 锚定 / 重规划落库保留锚定 / prompt 文本含锚定约束与走势描述"三类断言；回归跑 `novelDirectorRecovery` / `directorWorkflowStepCatalog` 等既有守卫测试确认零影响。

### Part C：曲线组件与工作台集成

1. `client/src/components/tensionCurve/`（新目录）
   - 多序列曲线组件：X 轴章节序号、Y 轴 0–100；拖点编辑、锚定点与 AI 点视觉区分、beat 分段背景着色、参考形状虚线。props 按序列数组设计（第一期只传 conflictLevel 一条）。
2. `client/src/pages/novels/components/StructuredOutlineTab.tsx`（或 `StructuredOutlineWorkspace.tsx`，以现有布局为准）
   - 接入曲线区块；视窗切换（整卷 / 单 beat，beat 归属取自章节 `beatKey`）。
3. `client/src/pages/novels/hooks/useNovelVolumePlanning.draft.ts` + `client/src/api/novel/chapters.ts`
   - 拖动落点写入草稿态并标记 user 来源，保存走既有卷工作区保存链路；不新增独立保存接口。
4. 卷战略页（`client/src/pages/novels/` 对应组件）
   - 只读缩略曲线（复用同一组件的 readonly 模式）。

Part C 验证：client typecheck + build；UI 交互验收按项目规范留给用户执行。

### Part D：形状体检与参考模板（第一期可顺延）

1. `client/src/components/tensionCurve/`（同目录内独立文件）
   - 纯前端启发式：连续 N 章持平提示"节奏平坝"、卷末峰值缺失提示、beat 内零起伏提示。
2. 题材参考形状模板常量（升级流 / 悬疑流等）与叠加显示入口。

### 执行顺序与门禁

A → B → C → D 严格顺序；**B 未通过专项测试前不开始 C**（防止"曲线能拖但 AI 不理"的半成品状态）。每个 Part 完成后独立提交，B 完成时更新 release notes（用户可见行为自 B 起变化：锚定值开始约束生成）。

## 验收维度

按方案协作规范从三个维度验收：

- **符合度**:曲线数据是否完全来自既有 `conflictLevel` 链路（0–100 量纲不变、不新增平行数据源）；锚定语义是否贯穿"编辑—拆章—细化—重规划—正文生成"全链；`Chapter` 表是否保持无锚定语义。
- **完成度**：Part A–C 为第一期必须项，Part D 可作为第一期收尾或顺延。
- **风险性**：重点回归重规划链路（锚定约束不得改变窗口决策行为）、卷工作区保存接口兼容性（未携带字段不得改变现值）、以及"用户锚定被自动链路覆盖"的专项测试是否真实覆盖拆章与重规划两条覆盖路径。
