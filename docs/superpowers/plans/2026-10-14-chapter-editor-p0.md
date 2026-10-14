# 章节编辑器 P0 优化 Implementation Plan

> **For agentic workers:** Use executing-plans to implement and verify these tasks in the current session. Follow repository delegation rules.

**Goal:** 让章节编辑器按具体问题修文，突出 AI 推荐的首要问题，并提供随正文目标切换的单一右侧操作面板。

**Architecture:** 在现有诊断、修文与候选确认链路中增加可选的结构化修复说明，兼容已有请求和诊断结果。问题顺序由诊断 AI 决定；客户端只呈现推荐项、选择目标和折叠其他内容。保存、来源问题关闭、版本保护和正文定位继续复用已有实现。

**Tech Stack:** TypeScript、React、Plate、TanStack Query、Zod、注册 PromptAsset、Node test。

**Spec:** 用户在本会话批准的三个 P0：按问题精准修文、每次突出一个最值得改的问题、右侧统一操作面板。阅读效果预览、处理历史与作者保护标记不在本轮范围。

## Global Constraints

- AI 负责修复目标、保留信息和问题优先级，不能以关键词或固定分类规则替代。
- 产品 Prompt 只修改 server/src/prompting/ 中的注册资产，更新资产版本。
- 不新增依赖，不改数据库结构，不运行真实模型；保留现有候选确认、快照与并发保存。
- 界面使用项目现有组件、语义色与低边框布局；实际视觉验收由用户完成。
- 新请求字段和新诊断字段均可选，旧客户端和旧诊断结果保持兼容。

## Task 1: 贯通结构化修复说明

**Files:**
- 修改 shared/types/novel.ts：ChapterEditorRepairBrief、诊断卡扩展与可选 repairBrief 请求字段。
- 修改 server/src/modules/novel/http/novelHttpSchemas.ts：repairBrief 校验。
- 修改 server/src/prompting/prompts/novel/chapterEditor/workspaceDiagnosis.promptSchemas.ts、workspaceDiagnosis.prompts.ts：repairGoal、repairApproach、mustPreserve，并由 AI 按阅读影响排序问题卡。
- 修改 server/src/services/novel/chapterEditor/ChapterEditorWorkspaceService.ts：保留新诊断字段。
- 修改 server/src/prompting/prompts/novel/chapterEditor/rewriteCandidates.prompts.ts 与 server/src/services/novel/chapterEditor/NovelChapterEditorService.ts：修文候选收到具体问题、影响、目标、改法和保留信息。
- 修改 client/src/pages/novels/components/chapterEditor/chapterEditorTypes.ts、document/editorDocument.ts、ChapterEditorShell.tsx：问题来源与具体修复说明随请求传递；补充要求不替换原诊断。
- 测试 server/tests/chapterEditorPreview.test.js、novelHttpSchemasContract.test.js、client/tests/directorChapterEditing.test.js。

**Interfaces:** `ChapterEditorRepairBrief = { title: string; problemSummary: string; whyItMatters: string; repairGoal?: string; repairApproach?: string; mustPreserve?: string[] }`；`ChapterEditorAiRevisionRequest.repairBrief?: ChapterEditorRepairBrief`。

- [x] 先新增失败回归：HTTP 解析保留 repairBrief；服务端候选输入收到完整说明；真实客户端请求包含发起问题的目标与保留项。
  ```js
  assert.deepEqual(capturedPromptInput.repairBrief, repairBrief);
  assert.deepEqual(request.body.repairBrief.mustPreserve, ['保留黑石裂纹线索']);
  ```
- [x] 运行回归确认旧实现缺失字段；服务端测试使用桩和隔离临时环境。
- [x] 实现可选字段贯通；诊断与修文 Prompt 明确修复此问题，不对用户文本作关键词分类。
- [x] 构建共享包与服务端，运行相关 Prompt、服务及 HTTP 回归。

## Task 2: 聚焦首要问题

**Files:** 修改 ChapterEditorSidebar.tsx、diagnostics/workspaceState.ts（如需复用推荐关联）、client/tests/directorChapterEditing.test.js。

**Interfaces:** 复用 `findRecommendedDiagnostic(workspace)`；推荐未明确关联时保留 AI 返回的卡片顺序，不依据严重度字符串自行排序。

- [x] 新增行为回归：首要问题默认展开，其他问题位于关闭的 details；章节背景默认收起；采纳后下一张卡仍可访问。
  ```js
  assert.equal(otherProblems.open, false);
  assert.equal(chapterBackground.open, false);
  ```
- [x] 运行回归确认现有页面缺少聚焦呈现。
- [x] 改为平面章节信息、简短本章目标、折叠背景、首要问题与折叠其余卡片。保留问题定位、直接处理和真实来源问题确认入口。
- [x] 运行诊断卡定位、移除、偏移与失败保护回归。

## Task 3: 单一右侧操作面板

**Files:** 修改 ChapterEditorDirectorPanel.tsx、ChapterEditorShell.tsx、CursorAIToolbar.tsx、SelectionAIToolbar.tsx；创建 assistant/ChapterEditorActions.tsx 与 assistant/index.ts；扩展 client/tests/directorChapterEditing.test.js。

**Interfaces:** 操作面板收到 `context: 'diagnostic' | 'selection' | 'cursor' | 'chapter'`、当前目标、候选作用范围、一个受控补充要求输入框以及既有操作回调。候选生成后的对比和采纳视图保留。

- [x] 新增行为回归：光标、手动选区、问题卡选择分别显示对应操作，始终只有一个 AI 要求输入框；分析期间仍可编辑要求；补充要求与具体问题一并提交。
  ```js
  assert.equal(dialog.querySelectorAll('textarea').length, 1);
  assert.equal(request.body.instruction, '保留人物克制的语气');
  ```
- [x] 运行回归确认旧界面的重复输入与分散操作。
- [x] 将工具条置于操作面板内部；工具条仅提供预设方向，指令输入统一受控。当前问题、手动选区、光标位置决定呈现，整章修改仍须明确选择。
- [x] 运行客户端类型检查、章节编辑/草稿/候选回归和相关源码契约检查。
- [x] 更新章节编辑 Wiki、同日期发布说明与 README 最新更新，完成代码审查和交接。

## Verification and Handoff

- 共享包构建、服务端构建、客户端类型检查。
- 相关服务端 Prompt/HTTP/编辑器测试，以及 JSDOM 客户端编辑回归；不以模型桩宣称真实生成质量已验证。
- docs manifest 和 diff 检查；保留先前未提交修改，不推送、合并或发布。
- 用户验收首要问题折叠、右侧上下文切换、具体修文效果与现有保存/定位保护。

## Execution evidence（2026-10-14）

- 三项 P0 已实现；结构化修复说明为可选字段，旧请求与旧诊断结果保持兼容。诊断允许无待处理问题，注册资产为 workspace_diagnosis v2 和 rewrite_candidates v3。
- 先确认 HTTP 字段丢失/长度未校验与五项客户端 P0 用例失败；复查增加整章切回片段、保存期间禁止续写两项回归，均先失败再修复。
- 最终：共享包构建、服务端构建、客户端类型检查均 exit 0；服务端相关用例 12/12，客户端编辑/草稿/候选用例 29/29，相关源码契约用例 7/7，共 48 项通过。
- docs manifest 通过（36 文档 / 17 进度项），git diff --check 通过。代码自行审查完成，Shell 852 行，展示职责分到 assistant 和 diagnostics。
- 初次并行验证遇到 Windows 内存不足；改为串行后，服务端单进程堆上限调至 3072 MB 完成构建。没有修改系统内存设置。服务端用例只使用新建临时 SQLite；没有开发库或真实模型操作。
- 候选行为由 API 桩与 JSDOM 验证，Plate 输入/定位使用测试接缝。真实界面、滚动和模型修文质量仍待用户验收。
- 实施验证时分支为 codex/chapter-editor-p0，基线 0aa27c3d；当时未提交、推送、整合或发布。此前未提交编辑器修改与无关用户改动均保留。后续提交和 beta 整合遵循用户的明确授权。
