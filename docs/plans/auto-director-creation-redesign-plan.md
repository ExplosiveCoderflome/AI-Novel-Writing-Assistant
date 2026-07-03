# 自动导演创建流程 UI 改造方案（渐进式舞台 + 独立路由页）

## 背景

自动导演创建目前是 `NovelCreate.tsx` 上方叠出的一个大弹窗（`NovelAutoDirectorDialog.tsx`，709 行，20+ 个 useState），内部一次性平铺全部内容：起始想法、导演起始设置（读者频道/叙事视角/节奏/情绪/章节数）、规划参考世界、本书世界处理、书级默认写法、模型设置、运行方式，方向候选阶段还要再叠一层 `NovelAutoDirectorCandidateDialog`——弹窗套弹窗。

确认的问题：

1. **同屏信息过载**：新用户第一眼面对十几个设置项，而产品文案自己都写着"先保持默认也可以"——说明大部分项不需要第一时间出现。
2. **布局紧凑、无设计感、零动效**：早期功能堆叠的产物，继续加功能只会更乱。
3. **弹窗形态撑不住这个流程**：这是一个多阶段、含长任务进度、支持中断恢复（workflowTaskId）的完整流程，被压在一个 Dialog 里，滚动局促、层级冲突、无法从 URL 恢复现场。

改造原则（用户已确认）：**纯 UI/交互层改造，功能语义全部沿用**——所有表单字段、默认值、mutation、候选批次逻辑、恢复逻辑不动，只改"怎么呈现、何时呈现"。

## 决策：独立路由页，不是当前页内全屏

推荐**新路由页面**（如 `/novels/auto-director`，恢复场景带 `?taskId=` 参数），理由：

1. **恢复语义天然匹配 URL**：现在恢复依赖外部传入 workflowTaskId 再打开弹窗；路由页可以直接从 URL 恢复现场，刷新/崩溃/桌面版重启后回到同一页即回到同一流程——这对长任务流程是实质收益，不只是形式。
2. **消灭弹窗套弹窗**：候选方向选择当前是 Dialog 里再弹 Dialog；页面形态下候选阶段就是页面的一个舞台区块，层级问题自然消失。
3. **给渐进式布局留空间**：舞台式流程需要纵向呼吸感和阶段间过渡动画，Dialog 的固定高度+内部滚动是天然枷锁。
4. **与项目已有心智一致**：单书工作台本身就是"左侧步骤 + 主区推进"的页面式流程，创建流程用同样的形态，新手从创建到工作台的心智是连续的。

`NovelCreate.tsx` 保留为轻量入口页（一句灵感 + "进入自动导演"按钮跳转路由页），不再承载弹窗。

## 设计核心：五个舞台的渐进式披露

关键取舍：**渐进不等于强制线性向导**。已完成的舞台折叠成可点击回改的摘要卡（不是消失），高级用户有"全部使用默认，直接生成方向"的快速通道，不惩罚熟练用户。

### Stage 0 · 起始想法（进入时唯一可见）

- 页面中央一个大输入区：起始想法 textarea + "没有想法？"灵感入口（现有 `NovelAutoDirectorIdeaInspirationPanel` 原样复用）。
- 两个出口：「继续完善设定」（进入 Stage 1）/「用默认设置直接生成方向」（跳到 Stage 4，中间三个舞台全用现有默认值）。
- 这是新手的第一屏，也是整个流程唯一必填的东西——和产品"一句灵感启动整本书"的叙事完全一致。

### Stage 1 · 导演起始设置

- 想法确认后从下方展开：读者频道倾向、叙事视角、节奏偏好、情绪浓度、预计章节数（现有 `NovelAutoDirectorSetupPanel` 的 basic form 区块拆出复用，字段与默认值零改动）。
- 确认后折叠为一行摘要卡（如"AI 判断频道 · 第三人称 · 均衡节奏 · 中情绪 · 约 80 章"），点击摘要卡可展开回改。

### Stage 2 · 世界与写法

- 规划参考世界样本、本书世界处理、书级默认写法（对应 SetupPanel 现有区块拆出）。
- 同样确认后折叠为摘要卡。

### Stage 3 · 模型与运行方式（最后确认）

- 模型设置 + 自动导演运行方式（四种模式卡片 + 正文后去 AI 检测开关）。
- 这一步的确认按钮就是"开始生成方向"——把"最容易被忽略但后果最重"的运行方式放在启动前最后一眼，位置本身就是提醒。

### Stage 4 · 方向候选与执行

- 现有 `NovelAutoDirectorCandidateBatches` / `CandidateSelectionContent` / `ProgressPanel` 平移为页面主区内容（不再是嵌套 Dialog）。
- 上方常驻已折叠的 Stage 0–3 摘要条，方向不满意时可回改设定重新生成——这正是现有"继续生成/定向修订"功能的空间化表达。

### 动效（framer-motion 已在依赖中，零新增安装）

- 舞台展开/折叠：高度 + 透明度过渡（`AnimatePresence` + layout 动画）。
- 摘要卡折叠：从表单到摘要行的收拢动画，让用户看见"设定被收好了"而不是突然消失。
- 候选方案卡：批次到达时 stagger 依次浮现。
- 进度阶段：当前阶段指示灯呼吸效果。
- 尊重 `prefers-reduced-motion`。

## 功能沿用清单（明确不动的东西）

- 全部表单字段、选项、默认值、hint 文案（`NovelAutoDirectorDialog.constants.ts` 不动）。
- 全部 mutation 与状态流转（`useNovelAutoDirectorCandidateMutations.ts`、`NovelAutoDirectorDialog.shared.ts` 不动或仅调整 import 路径）。
- 候选批次、定向修订、标题组重做、恢复（workflowTaskId）、运行模式语义。
- 后端 API、prompt、导演阶段编排零改动。

## 分步执行计划（文件层级）

### Part 1：路由页骨架与舞台状态机

- `client/src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx`（新）：路由页外壳，舞台状态机（当前舞台、各舞台完成态、快速通道标记），从 URL 读取 `taskId` 恢复现场。
- `client/src/pages/novels/autoDirector/directorCreateStages.ts`（新）：舞台定义、完成判定、摘要文案生成的纯函数。
- 路由注册（按 vite-plugin-pages 的文件路由约定落位）。

### Part 2：舞台区块组件（从现有面板拆分复用）

- `client/src/pages/novels/autoDirector/StageIdea.tsx`（新）：Stage 0，内部复用 `NovelAutoDirectorIdeaInspirationPanel`。
- `client/src/pages/novels/autoDirector/StageBasicSetup.tsx` / `StageWorldStyle.tsx` / `StageModelRun.tsx`（新）：从 `NovelAutoDirectorSetupPanel.tsx`（490 行）按区块拆出，表单状态结构不变，拆完后旧 SetupPanel 移除。
- `client/src/pages/novels/autoDirector/StageSummaryCard.tsx`（新）：已完成舞台的折叠摘要卡（展开回改交互）。
- `client/src/pages/novels/autoDirector/StageCandidates.tsx`（新）：Stage 4，内部复用 `NovelAutoDirectorCandidateBatches` / `CandidateSelectionContent` / `ProgressPanel`，消灭嵌套 Dialog。

### Part 3：入口切换与旧弹窗退役

- `client/src/pages/novels/NovelCreate.tsx`：改为轻量入口（灵感输入直通路由页，或直接跳转）；移除 `NovelAutoDirectorDialog` 挂载。
- 其他打开该弹窗的入口（若有恢复入口在导演跟进/任务中心）改为带 `taskId` 跳转路由页。
- `NovelAutoDirectorDialog.tsx` / `NovelAutoDirectorCandidateDialog.tsx` / `NovelAutoDirectorDialogHeader.tsx` 在全部入口切换完成后删除。

### Part 4：动效与收尾

- framer-motion 舞台过渡、摘要收拢、候选卡 stagger、`prefers-reduced-motion` 降级。
- 验证：client typecheck + build；路由页懒加载确认（创建流程本就是独立 chunk 的天然边界）；UI 交互验收按项目规范留给用户。

## 执行顺序与门禁

Part 1 → 2 → 3 → 4。**Part 3 完成前旧弹窗保持可用**（新旧并存期间以路由页为主入口做验证，确认恢复链路无回归后再删除旧组件）。本次为用户可见变更，完成时更新 release notes 与 README。

## 验收维度

- **符合度**：功能语义零变化（字段/默认值/mutation/恢复链路与旧弹窗逐项对照）；Stage 0 进入时确实只见想法输入；每个舞台可回改；快速通道可用；无嵌套弹窗残留。
- **完成度**：Part 1–4 全部为第一期必须项；旧弹窗组件删除干净、无死代码残留。
- **风险性**：重点回归恢复链路（带 taskId 进入路由页各阶段现场恢复）、从 NovelCreate 到路由页的参数传递、快速通道生成的请求体与旧弹窗默认请求体逐字段一致。
