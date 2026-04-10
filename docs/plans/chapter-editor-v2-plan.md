# 章节编辑器 V2 改造方案

## 本轮交付进度

### 已完成

- 已按 `Phase 1 + Phase 2 MVP` 落地共享 `ChapterEditorShell`，并把它收口到独立 `NovelChapterEdit` 这条正文中心编辑器页上；`ChapterManagementTab` 继续保留为工作台入口。
- 已把正文编辑底座切到 Plate，支持正文编辑、选区监听、保存状态、字数统计和待确认 AI 会话。
- 已新增章节编辑专用 preview 接口 `POST /novels/:id/chapters/:chapterId/editor/rewrite-preview`，请求/响应 contract 已固定到 shared types。
- 已新增 `novel.chapter_editor.rewrite_candidates@v1` PromptAsset，并注册到 `server/src/prompting/registry.ts`。
- 已打通首版选区 AI 改写闭环：`优化表达 / 扩写 / 精简 / 强化情绪 / 强化冲突 / 自定义指令`，返回 `2-3` 个候选版本和写作友好型 inline diff。
- 已实现 `接受全部 / 拒绝全部 / 再生成 / 候选切换`，并在接受前先调用现有 novel snapshot 再更新章节正文。

### 进行中

- 问题列表目前已保留在 header / 轻侧区中作为入口与占位，但还没有进入“定位 -> 建议 -> diff -> 接受 -> 关闭”的完整修复闭环。
- 版本入口已接入现有历史页跳转，但还没有做成章节编辑器内的独立版本抽屉。
- 前端仓库当前没有独立测试 runner，本轮以 typecheck 和 production build 作为 client 侧验证基线。

### 延后到后续阶段

- `Phase 3`：问题修复 preview、章节内版本抽屉、问题定位与关闭闭环。
- `Phase 4`：光标续写、块级 diff、语义 diff、局部接受、更细粒度回滚。
- style rewrite 现有独立能力暂未并入首版选区主链，继续作为后续并线项。

### 本轮验证

- `pnpm typecheck`
- `pnpm --filter @ai-novel/client build`
- `node --test tests/chapterEditorPreview.test.js`
- `node --test tests/prompting-governance.test.js`

## 1. 背景

当前仓库里已经存在三套和章节编辑强相关的能力，但它们还没有汇成同一个产品闭环：

- `NovelEdit -> ChapterManagementTab` 仍然是章节执行工作台，采用“章节队列 + 正文结果区 + AI 执行台”的三栏结构，适合批量执行、审校和修复入口。
- 独立章节页 `NovelChapterEdit.tsx` 已经升级为正文中心的局部 AI 精修编辑器，承载真正的正文编辑与选区改写闭环。
- `AiRevisionWorkspace.tsx`、`NovelDraftOptimizeService.ts`、`draftOptimize.prompts.ts` 已经提供了“选区预览优化 + 应用预览”的通用模式，但现在只服务大纲和结构化大纲，不服务章节正文。

结论不是“章节编辑器从零开始做”，而是：

> 现有基础设施已经够支撑 V2，但章节能力被分散在不同页面、不同 prompt、不同交互范式里，导致用户始终没有进入一个真正的“正文中心的局部 AI 精修编辑器”。

## 2. 现状判断

### 2.1 现有前端结构

- `NovelEdit.tsx` 是主工作流入口，章节执行工作台仍挂在 `ChapterManagementTab.tsx`，而正文精修编辑器由 `NovelChapterEdit.tsx` 独立承载。
- `ChapterManagementTab.tsx` 当前把章节页拆成三栏：
  - 左侧 `ChapterExecutionQueueCard`
  - 中间 `ChapterExecutionResultPanel`
  - 右侧 `ChapterExecutionActionPanel`
- 独立章节页 `NovelChapterEdit.tsx` 现在直接承载保存、style rewrite、AI 改写候选与 diff 确认，正文编辑已切到 Plate。
- 当前几个相关文件已经接近不适合继续堆逻辑的状态：
  - `NovelChapterEdit.tsx`：485 行
  - `ChapterExecutionResultPanel.tsx`：419 行
  - `ChapterRuntimePanels.tsx`：328 行
  - `ChapterExecutionActionPanel.tsx`：321 行
  - `useChapterExecutionActions.ts`：275 行

这意味着 V2 不能继续把“选区工具条、diff、候选会话、问题导航、ghost text、版本抽屉”直接堆进现有组件里，必须抽出新的编辑器壳层和子模块。

### 2.2 现有后端基础

当前后端已经具备以下能力，可直接复用为章节编辑器 V2 的底座：

- 章节生成与 runtime：
  - `POST /novels/:id/chapters/:chapterId/runtime/run`
  - `POST /novels/:id/chapters/:chapterId/generate`
- 章节评审、审校、修复：
  - `POST /novels/:id/chapters/:chapterId/review`
  - `POST /novels/:id/chapters/:chapterId/audit/:scope`
  - `GET /novels/:id/chapters/:chapterId/audit-reports`
  - `POST /novels/:id/chapters/:chapterId/repair`
- 章节上下文与后续规划：
  - `GET /novels/:id/chapters/:chapterId/plan`
  - `POST /novels/:id/chapters/:chapterId/plan/generate`
  - `GET /novels/:id/chapters/:chapterId/state-snapshot`
  - `POST /novels/:id/replan`
- 风格检查与风格改写：
  - `POST /style-detection/check`
  - `POST /style-detection/rewrite`
- 版本安全：
  - 已有 novel 级 snapshot：`list/create/restoreNovelSnapshot`
- Prompt 治理基础：
  - 已有 `PromptAsset`、`registry.ts`
  - 已有 `novel.draft_optimize.selection/full`
  - 已有 `novel.chapter.writer`、`novel.review.chapter`、`novel.review.repair`

### 2.3 当前缺口

V2 需要补的不是“大而全章节系统”，而是下面这些正好缺失的环节：

- 没有真正的正文中心布局，章节主视图仍偏“执行台”。
- 没有选区级 AI 工具条。
- 没有候选版本与 diff 确认态。
- 没有章节正文专用的局部改写 prompt / route / session。
- 问题修复还不是“定位 -> 建议 -> diff -> 接受 -> 关闭”的编辑器内闭环。
- 没有章节级快照语义，只有 novel 级 snapshot。
- 光标续写不存在，当前仍是整章生成/整章修复思路。

## 3. 产品方向

### 3.1 章节编辑器负责什么

- 阅读、编辑当前章节正文。
- 对选中内容进行局部 AI 改写。
- 对光标位置进行局部续写预览。
- 处理当前章节的审校问题、修复建议和采纳确认。
- 提供足够可靠的快照与回退，降低用户使用 AI 的心理成本。

### 3.2 章节编辑器不负责什么

- 整章从零生成主入口。
- 章节流程状态总控。
- 复杂章节队列管理。
- 宏观导演式流程推荐。

这些继续留在 `NovelEdit` 的工作流与章节执行层，不塞回编辑器主视图。

### 3.3 最终产品定位

> 章节编辑器 V2 的目标不是“更复杂的章节工作台”，而是“正文中心的局部 AI 精修编辑器”。

## 4. 推荐落点

### 4.1 主入口选型

推荐把独立 `NovelChapterEdit` 作为 V2 的正文编辑主入口，而不是把章节编辑器塞回 `ChapterManagementTab` 的执行台三栏里。

原因：

- 用户当前主工作流已经在 `NovelEdit`。
- 左侧章节队列、章节选择、章节上下文和 pipeline 状态已经挂在这里。
- V2 最需要改的是中间正文区和右侧 AI 行为方式，不是另起一套路由。

### 4.2 独立章节页的角色

`/novels/:id/chapters/:chapterId` 继续保留，但应当转成“沉浸式章节编辑入口”，与主工作流共享同一套编辑器组件，而不是继续维护自己的旧式三栏页面。

建议策略：

- `NovelChapterEdit` 升级为 `ChapterEditorShell`
- `ChapterManagementTab` 继续保留原章节执行工作台和“打开章节编辑器”入口
- 编辑器本体只维护章节内闭环
- 编辑器本身只维护章节内闭环

## 5. 信息架构

### 5.1 页面结构

V2 推荐结构：

- 顶部轻控制条
- 左侧轻上下文面板
- 中央正文编辑器主区
- 右侧按需展开的 AI 结果抽屉
- 选区/光标处浮动 AI 交互层

### 5.2 顶部轻控制条

保留：

- 章节标题
- 字数
- 保存状态
- 当前写法资产
- 问题数
- 版本入口
- 返回章节执行页
- 保存 / 修订模式 / 更多操作

不保留：

- 大段流程说明
- 大型推荐流程
- 批量执行入口堆叠

### 5.3 左侧轻上下文面板

只保留会直接帮助当前写作的内容：

- 本章目标
- 本章摘要
- 前后文摘要
- 当前角色状态
- 必须命中的要点
- 世界观限制摘要

默认窄栏或收起；不再长期占正文宽度。

### 5.4 中央正文编辑区

这里是唯一主角，承载：

- 正文阅读与编辑
- 选区监听
- 光标监听
- 问题高亮
- diff 预览
- 接受 / 拒绝
- ghost text

### 5.5 右侧结果抽屉

默认收起，仅在以下场景出现：

- AI 正在生成预览
- 展示候选版本
- 展示 diff 详情
- 展示问题修复建议
- 展示修改说明

### 5.6 浮动 AI 层

这是 V2 的核心新增交互。

选中内容后弹出：

- 优化表达
- 扩写细节
- 精简压缩
- 强化情绪
- 强化冲突
- 改写风格
- 降低 AI 味
- 自定义指令

光标位于段尾或空白段时弹出：

- 继续写下一段
- 生成过渡段
- 增加对话
- 增加环境描写
- 增加心理描写
- 推进冲突

## 6. 交互闭环

```mermaid
flowchart LR
  A["选中文本 / 定位问题 / 放置光标"] --> B["发起 AI 操作"]
  B --> C["生成 2-3 个候选版本"]
  C --> D["默认展示 inline diff"]
  D --> E["接受 / 拒绝 / 再生成"]
  E --> F["接受前自动快照"]
  F --> G["应用到正文并刷新问题状态"]
```

### 6.1 首版必须闭环

第一期必须打通以下动作：

- 选中内容
- 发起 AI 改写
- 返回 2 到 3 个候选
- 展示 inline diff
- 接受全部
- 拒绝全部
- 再生成
- AI 接受前自动快照

### 6.2 第二期闭环

- 问题点击跳转
- 问题修复 preview
- 光标续写 ghost text
- 块级 diff 视图
- 修改说明

### 6.3 第三期闭环

- 局部接受
- 语义 diff
- 多风格对比
- 更细粒度回滚

## 7. 模块拆分

建议新增或抽出的模块：

- `ChapterEditorShell`
  - 负责页面壳、布局编排、模式切换、抽屉开合
- `ChapterEditorHeader`
  - 标题、字数、保存状态、问题数、版本入口
- `ChapterContextSidebar`
  - 本章目标、上下文、角色状态、约束
- `ChapterTextEditor`
  - Plate-based 正文编辑器、选区与光标监听、问题高亮、ghost text
- `SelectionAIFloatingToolbar`
  - 选区意图操作
- `CursorAIFloatingToolbar`
  - 光标续写操作
- `ChapterAIDiffDrawer`
  - 候选版本、diff、接受/拒绝/再生成、说明
- `ChapterIssueNavigator`
  - 问题列表、定位、状态
- `ChapterVersionDrawer`
  - 快照列表、回退入口

建议新增 hooks：

- `useChapterEditorState`
- `useChapterEditorSession`
- `useChapterEditorDiff`
- `useChapterIssueNavigation`
- `useChapterEditorSnapshots`

建议新增 shared model：

- `chapterEditor.types.ts`
- `chapterEditorDiff.ts`
- `chapterEditorSession.ts`

## 8. 状态设计

建议把“正文状态”和“AI 会话状态”分开。

```ts
type ChapterEditorMode = "edit" | "revise";

type ChapterSelection = {
  from: number;
  to: number;
  text: string;
} | null;

type ChapterEditorState = {
  chapterId: string;
  title: string;
  content: string;
  savedContent: string;
  mode: ChapterEditorMode;
  wordCount: number;
  saveStatus: "idle" | "saving" | "saved" | "error";
  selectedRange: ChapterSelection;
  activeIssueId: string | null;
};

type ChapterEditorOperation =
  | "polish"
  | "expand"
  | "compress"
  | "emotion"
  | "conflict"
  | "styleRewrite"
  | "antiAiTone"
  | "custom"
  | "continueWriting"
  | "issueFix";

type DiffChunk = {
  id: string;
  type: "equal" | "insert" | "delete";
  text: string;
};

type AICandidate = {
  id: string;
  label: string;
  content: string;
  summary?: string;
  semanticTags?: string[];
  diffChunks: DiffChunk[];
};

type ChapterEditorSession = {
  sessionId: string;
  operation: ChapterEditorOperation;
  targetRange: {
    from: number;
    to: number;
    originalText: string;
  } | null;
  customInstruction?: string;
  status: "idle" | "loading" | "streaming" | "ready" | "error";
  candidates: AICandidate[];
  activeCandidateId: string | null;
  viewMode: "inline" | "block";
};
```

## 9. AI 与后端边界

### 9.1 章节编辑器内 AI 只处理三类任务

- 局部改写：输入选区内容与上下文
- 局部续写：输入光标附近上下文
- 问题修复：输入问题关联段落与问题描述

### 9.2 不在编辑器里做的事情

- 整章从零生成
- 大型执行计划生成
- 全章流程推进推荐
- 队列批处理

### 9.3 Prompt 治理要求

所有新能力都必须走 `server/src/prompting/`：

- 不在 service 里内联 `systemPrompt/userPrompt`
- 不以关键词匹配代替 AI 意图理解
- Prompt 要进入 registry，成为新的 `PromptAsset`

建议新增 prompt family：

- `server/src/prompting/prompts/novel/chapterEditor/`

建议新增 prompt asset：

- `novel.chapter_editor.rewrite_candidates@v1`
- `novel.chapter_editor.continue_preview@v1`
- `novel.chapter_editor.issue_fix_preview@v1`
- `novel.chapter_editor.change_explain@v1`

### 9.4 建议新增接口

建议新增章节编辑器专用 preview 接口，而不是继续复用整章 repair：

- `POST /novels/:id/chapters/:chapterId/editor/rewrite-preview`
- `POST /novels/:id/chapters/:chapterId/editor/continue-preview`
- `POST /novels/:id/chapters/:chapterId/editor/issues/:issueId/fix-preview`

返回统一结构：

- `sessionId`
- `operation`
- `targetRange`
- `candidates`
- `activeCandidateId`

说明：

- 首版 preview 结果可以完全不落库，只有在“接受”时才更新 chapter content。
- 接受动作首版不一定要做独立 session 持久化表，客户端可直接基于当前 active candidate 进行 patch 应用，再调用 `updateNovelChapter`。
- 二期再考虑引入持久化的 `ChapterEditorSession` / `ChapterEditorSnapshot`。

## 10. Diff 方案

### 10.1 首版默认：写作友好型 inline diff

原因：

- 当前章节最常见的是局部润色、压缩、扩写、增强冲突、增强情绪。
- 这类改动更适合柔和的行内修订体验，而不是代码式大红大绿块。

实现建议：

- 新增：浅绿色底
- 删除：浅红底 + 删除线
- 替换：删除 + 新增组合

### 10.2 二期补充：块级 diff

适用于：

- 整段重写
- 风格改写
- 人称转换
- 大幅扩写

在抽屉顶部提供切换：

- 沉浸视图
- 对比视图

### 10.3 三期增强：语义 diff

显示的不只是“改了哪里”，还包括：

- 增强情绪表达
- 补充动作细节
- 提升画面感
- 压缩重复叙述
- 弱化模板化表达

## 11. 版本与快照策略

### 11.1 现实约束

当前仓库已经有 novel 级 snapshot，没有 chapter 级 snapshot。

这意味着 V2 首版不应该等待全新的章节版本系统完工后再落地。

### 11.2 建议策略

Phase 1：

- AI 接受前先调用现有 novel snapshot
- label 带上章节信息，例如 `chapter-editor:{chapterOrder}:{operation}:{timestamp}`
- 至少保证用户在接受 AI 改写前始终有安全网

Phase 2：

- 增补章节编辑器快照元数据
- 在 UI 中按章节过滤、展示“手动保存 / AI 接受前 / 问题修复前”

Phase 3：

- 如有必要，再引入 chapter-level snapshot 表，避免回退粒度过大

## 12. 问题修复模式

推荐把问题列表当作“导航”，不是“右侧报告中心”。

问题处理链路：

- 点击问题
- 正文跳转到对应段落
- 高亮问题区域
- 调用 issue fix preview
- 展示 diff
- 用户接受或拒绝
- 接受后调用 `resolveAuditIssue`

首版定位策略可以先采用：

- 以 `AuditReport`/`ReviewIssue` 里的 `evidence` 或 `excerpt` 做文本匹配
- 匹配失败时退化为跳到最相关段落并显示“近似定位”

不要为了首版强行上复杂锚点系统。

## 13. 复用策略

V2 不建议从零重写一切，推荐复用以下基础：

- 复用 `ChapterManagementTab` 作为章节执行工作台入口
- 复用 `NovelChapterEdit` 路由作为沉浸式正文编辑入口
- 复用 `AiRevisionWorkspace` 的选区优化交互范式，但升级为章节正文编辑器专用组件
- 复用 `NovelDraftOptimizeService` 的 preview 思路，但扩展为 chapter editor 专用 service
- 复用已有 `style detection/rewrite` 作为风格检查和“降低 AI 味”的辅助手段，不把它当作章节局部改写主路径
- 复用已有 `chapter plan`、`state snapshot`、`audit reports`、`replan` 作为上下文和问题来源

## 14. 分阶段计划

### Phase 1：编辑器壳层收口

目标：

- 统一章节编辑入口
- 正文主区上收
- 上下文与动作区降级为轻侧区

输出：

- `ChapterEditorShell`
- 共享的沉浸式章节编辑入口
- 从 `textarea` 过渡到可监听选区/光标的编辑器
- 中央正文区成为默认主视图

验收：

- 用户进入章节页后第一视觉是正文，不是操作台
- 主工作流和独立路由共享同一套编辑器壳层

### Phase 2：局部 AI 改写闭环

目标：

- 选区工具条
- 候选版本
- inline diff
- 接受 / 拒绝 / 再生成

输出：

- 选区操作 toolbar
- rewrite preview API
- chapter editor prompt assets
- diff drawer
- 接受前自动 snapshot

验收：

- 用户能在 3 步内完成“选中 -> 改写 -> 确认采纳”
- AI 改写不会直接覆盖正文

### Phase 3：问题修复与版本安全

目标：

- 问题定位
- issue fix preview
- 版本安全

输出：

- `ChapterIssueNavigator`
- 修复 preview 闭环
- 章节级版本展示入口

验收：

- 问题可一键跳转到正文
- 接受修复后问题状态能关闭

### Phase 4：光标续写与差异化能力

目标：

- 局部续写
- 块级 diff
- 修改说明
- 局部接受

输出：

- cursor preview
- ghost text
- block diff
- semantic tags

验收：

- 用户能把章节编辑器当成长期写作和修文主场，而不是临时修补页

## 15. 风险与约束

### 15.1 最大风险

- 继续把新逻辑堆进现有大文件，导致编辑器与执行台相互污染。
- 直接复用整章 repair 作为局部改写实现，导致行为太重、替换范围过大。
- 没有快照保护就允许 AI 直接改正文，用户会迅速失去信任。

### 15.2 明确约束

- 不在章节编辑器里加入宏观导演式流程 UI。
- 不新增关键词 fallback 路由。
- 不在 service 里直接写未注册 prompt。
- 单文件超过 700 行前必须拆模块；500 到 700 行区间也应主动避免继续扩张。

## 16. 验收清单

- 进入章节编辑器后，正文主区占据绝对视觉中心。
- 选中正文能弹出 AI 工具条。
- 至少 5 个局部改写意图可用。
- 每次改写返回 2 到 3 个候选。
- 默认显示 inline diff。
- 用户可以接受、拒绝、再生成。
- AI 接受前自动创建快照。
- 审校问题可以在正文中定位并进入修复 preview。
- 独立章节页和主工作流章节页共用一套编辑器组件，不再维持两套逻辑。

## 17. 最终结论

对当前仓库最合适的改造方向不是另起一个“更大的章节系统”，而是把现有章节执行、正文编辑、局部 AI 预览、审校修复和快照保护收拢为同一条章节内闭环。

最终目标可以收敛为一句话：

> 章节编辑器 V2 = 正文中心的局部 AI 精修编辑器。
