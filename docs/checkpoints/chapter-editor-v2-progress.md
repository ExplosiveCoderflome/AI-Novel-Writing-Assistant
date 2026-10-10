# Chapter Editor V2 Progress

## 2026-10-11

### 正文安全编辑与按需诊断

- 编辑器与服务端共用正文坐标规则，保留空格、空段和单换行，选区替换不再因两端文本转换不同而偏移。
- 正文草稿与最近保存版本分离保存；服务端更新带 `expectedUpdatedAt` 版本校验，冲突时拒绝旧写入并保留本地草稿。
- 接受 AI 候选前继续创建快照，并校验目标片段仍未变化；保存或接受候选后不自动重跑章节诊断，改由作者主动重新分析。
- 页面退出、服务端新版本和浏览器会话恢复均提供草稿保护提示。半自动导演的手动修改影响分析与确认继续仍沿用导演来源页的既有入口。
- 半自动导演停在步骤确认时，章节执行台会显示正文来源页的“确认本章修改并继续”，保存正文后可直接回填并推进导演，不需要回到运行记录操作。

### 光标续写预览

- 正文光标可直接打开续写工具条，提供继续下一段、过渡、对话、环境、心理和冲突六类方向，也支持自定义补充要求。
- 续写使用独立的结构化 Prompt 和 `continue-preview` 服务契约，只返回可插入正文的 2 到 3 个候选，不重复发送整章内容。
- 候选写回沿用正文快照、`expectedUpdatedAt` 和修改前快照保护；目标范围是长度为零的光标插入点，正文变化后会拒绝旧位置。
- 续写完成了 Phase 4 的第一块能力；块级 / 语义 diff、局部接受和章节内版本抽屉仍需在后续阶段实现。

## 2026-04-10

### 交付范围

- 完成 `Chapter Editor V2` 的 `Phase 1 + Phase 2 MVP`。
- 范围聚焦在“正文中心的局部 AI 精修编辑器”，不包含问题修复闭环、光标续写和语义 diff。

### 完成项

- 共享章节编辑器壳层：新增 `ChapterEditorShell`，统一顶部轻控制条、左侧轻上下文、中央正文编辑区、右侧按需 diff 面板，实际落在独立 `NovelChapterEdit` 页面。
- 入口关系已纠正：`ChapterManagementTab` 继续作为工作台入口，独立 `NovelChapterEdit` 作为正文中心编辑页承载本轮章节精修能力。
- Plate 正文编辑：正文编辑从旧 `textarea` 切到 Plate，具备正文编辑、选区监听、保存状态、字数统计。
- 选区 AI 改写：支持 `优化表达 / 扩写 / 精简 / 强化情绪 / 强化冲突 / 自定义指令` 六类操作。
- 候选 diff：后端固定返回 `2-3` 个候选版本；前端支持 inline diff、候选切换、拒绝、再生成、接受。
- 安全快照：接受候选前先创建 `novel snapshot`，label 采用 `chapter-editor:{chapterOrder}:{operation}:{timestamp}`，之后再更新章节正文。
- Prompt 治理：新增 `novel.chapter_editor.rewrite_candidates@v1`，通过 Prompt Registry 接入，不在 service 内内联业务 prompt。
- 后端 contract：新增 `POST /novels/:id/chapters/:chapterId/editor/rewrite-preview`，shared types 已同步请求/响应结构。

### 验收结果

- 已通过 `pnpm typecheck`。
- 已通过 `pnpm --filter @ai-novel/client build`。
- 已通过 `node --test tests/chapterEditorPreview.test.js`。
- 已通过 `node --test tests/prompting-governance.test.js`。
- 当前可完成主闭环：`选中正文 -> 发起 AI 改写 -> 查看 2-3 个候选 diff -> 接受或拒绝`，且接受前有快照保护。

### 遗留项

- 问题修复仍停留在入口和占位阶段，尚未形成“定位 -> 建议 -> diff -> 接受 -> 关闭”闭环。
- 版本入口当前仍复用现有历史页跳转，尚未做成章节编辑器内版本抽屉。
- 光标续写、块级 diff、语义 diff、局部接受仍未进入本轮实现。
- 前端当前没有独立测试 runner，本轮未补交互自动化测试。

### 下一阶段入口

- `Phase 3`：问题定位修复闭环、章节内版本抽屉、问题关闭联动。
- `Phase 4`：光标续写、块级 diff / 语义 diff、局部接受、更细粒度回滚。
- 后续每轮章节编辑器开发继续在本文件追加 checkpoint，不重开新文档。
