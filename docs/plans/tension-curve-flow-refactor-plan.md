# 紧张度曲线 React Flow + D3 重构方案

## 背景

紧张度曲线第一版为手写 SVG（固定 720×240 viewBox + 手写线性映射 + 原生指针事件），已确认四个体验问题：

1. 60 章挤进固定宽度，点间距约 11px，标签重叠、极易误触相邻章节。
2. `pointerdown` 按下瞬间即写值并标记用户锚定，没有拖拽缓冲，手抖即误锚定。
3. 未设置（null）与真实 0 值都贴在基线上，视觉难区分。
4. 只能拖动、无精确数值输入退路；无缩放、无平移。

可视化技术栈已定盘（见 [visualization-stack](../design/visualization-stack.md)），`@xyflow/react` 与 d3 子模块已随 commit `cf2cd07e` 一次性安装。本方案将曲线迁移到 React Flow 画布 + d3 数学的组合上。

## 设计核心：把"章节点"建模为受约束的 Flow 节点

- **每章一个自定义节点**，位置 `x = chapterOrder × 固定步距`（如 56px），`y = yScale(conflictLevel)`，其中 `yScale` 用 `d3-scale` 的 `scaleLinear`（值域 0–100 ↔ 画布高度）。60 章自然铺开成约 3400px 宽的画布，由 React Flow 的 **pan / zoom / MiniMap** 浏览——密度问题从根上消失，不再靠压缩点距硬塞。
- **相邻章节点之间连自定义 edge**，edge 跟随节点拖动自动重绘——折线就是 edges 本身，不需要手工维护 polyline。
- **拖拽约束**：节点拖动时锁定 X（章节序号不可变）、Y 夹在值域内；利用 React Flow 的 `nodeDragThreshold`（约 3px）区分"点击"与"拖拽"，根治"按下即跳变"的误触问题。拖拽结束（`onNodeDragStop`）才换算数值、写回草稿并标记用户锚定——拖拽过程只动视觉，不写状态。
- **精确输入退路**：选中节点弹出 `NodeToolbar`——包含 0–100 数值输入框（回车确认，标记 user）与"交还 AI"按钮。这同时替代现在底部那排"第 N 章交还 AI"按钮列表（锚定点一多即不可扩展）。
- **null 与 0 分离**：未设置章节放在坐标区下方的独立"未设置轨道"（灰点、不可拖、Toolbar 提示先细化该章），与真实 0 值在空间上分开。
- **坐标系背景**：Y 轴刻度线（0/25/50/75/100）与 beat 分段色带经 React Flow 的 `ViewportPortal` 渲染进画布坐标系，随缩放平移同步。
- **参考线**：模板值经 `d3-shape` 的 `line` + `curveMonotoneX` 生成平滑路径，同样走 `ViewportPortal` 只读叠加。
- **视窗切换语义升级**：整卷 / 单 beat 切换从"过滤数据"改为"`fitView` 聚焦到该 beat 的节点范围"——上下文不丢，相邻 beat 的走势仍在画布上可见。
- **只读模式**（卷骨架页缩略图）：`nodesDraggable=false` + 隐藏 Toolbar，同一组件复用。

对外契约不变：`onPointChange` / `onPointRelease` / series props 保持现有签名，两个消费方（节奏拆章工作台、卷骨架页）接入代码基本不动；锚定语义、持久层、prompt 链路零改动——这是纯前端组件层重构。

## 不做的事

- 不改锚定/解除锚定的后端语义与接口（Part A/B 已验收的链路不动）。
- 不做多序列同屏（revealLevel 等仍按 series 数组预留，第一期只渲染 conflictLevel 一条）。
- 不改 `tensionCurveAnalysis.ts` 的形状体检与参考模板算法（只换消费方式）。
- 不在本方案迁移 `WorldVisualizationBoard`（独立事项）。

## 分步执行计划（文件层级）

### Part 1：Flow 画布组件

- `client/src/components/tensionCurve/TensionCurveFlow.tsx`（新）
  React Flow 实例装配：节点/边生成（数据 → nodes/edges 的纯函数）、拖拽约束与阈值、`onNodeDragStop` 换算回调、fitView 策略、Controls + MiniMap、只读模式开关。样式 `@xyflow/react/dist/style.css` 在此组件内 import（随懒加载 chunk 走，不进首屏）。
- `client/src/components/tensionCurve/ChapterPointNode.tsx`（新）
  自定义节点：圆点视觉（AI 蓝 / 锚定红 / 未设置灰）、选中态、NodeToolbar（数值输入 + 交还 AI）、hover 信息（章序、标题、数值、锚定状态）。
- `client/src/components/tensionCurve/curveCoordinates.ts`（新）
  纯计算模块：`d3-scale` 的值域映射、步距常量、null 轨道 Y、beat 色带区间计算、参考线路径生成（`d3-shape`）。单测目标。
- `client/src/components/tensionCurve/CurveBackdrop.tsx`（新）
  `ViewportPortal` 背景层：Y 轴刻度、网格线、beat 色带、参考曲线路径。
- `client/src/components/tensionCurve/TensionCurvePanel.tsx`（改）
  保留外壳（标题、锚定计数、形状体检提示、图例、参考线开关、视窗按钮），图表区从手写 SVG 替换为 `TensionCurveFlow`；删除手写坐标换算与指针事件代码；底部"交还 AI"按钮列表移除（职责移入 NodeToolbar）。

### Part 2：消费方接入与懒加载

- `client/src/pages/novels/components/StructuredOutlineWorkspace.tsx`、`OutlineTab.tsx`（改）
  `TensionCurvePanel` 改为 `React.lazy` + `Suspense`（骨架占位），确保 `@xyflow/react` 及 d3 模块进入独立 chunk；props 传递按既有签名微调（视窗切换回调语义从过滤改为聚焦）。

### Part 3：细节规格与测试

- 拖拽数值吸附：默认吸附到 5 的倍数，按住 Shift 精调到 1（在 `TensionCurveFlow` 拖拽换算处实现）。
- `client/tests/`（或就近 `*.test.mjs`，按 client 现有测试约定）：`curveCoordinates` 纯函数单测——值↔坐标往返、clamp 边界、null 轨道、beat 区间。
- 验证：client typecheck + build，确认 chunk 划分（可视化库不在首屏 chunk）；拖拽/缩放/Toolbar 的 UI 交互验收按项目规范留给用户。

## 执行顺序与门禁

Part 1 → 2 → 3。Part 1 完成后先在节奏拆章工作台单点接入验证，再动卷骨架页。本次为用户可见变更，完成时更新 release notes 与 README 最新更新区块。

## 2026-07 首次实施验收偏差与修正项

首次实施（TensionCurvePanel.tsx 单文件改写）引入了 React Flow + d3，但禁用了 pan/zoom 并保留 720×240 固定坐标系，方案核心（步距铺开 + 画布浏览）未落地；NodeToolbar、null 轨道、beat 色带、fitView 聚焦均未实现。验收不通过，修正项如下（按优先级）：

1. **坐标系改造（本方案原 Part 1 核心，必须做）**：`x = chapterOrder × 步距`（约 56px），删除 720 固定宽映射；开启 `panOnDrag` / `zoomOnScroll`（可限制为仅横向）；`translateExtent` 放宽到画布实际尺寸；接入 `Controls` 与 `MiniMap`；X 轴章节标签按缩放级别抽稀（整卷视图隔 5 章一标）。
2. **批量交还 AI（新增，数据污染现状下最急）**：曲线工具条增加"整卷交还 AI"与"当前节奏段交还 AI"；消费方（StructuredOutlineWorkspace）新增批量回调，逐章走既有同值 + `conflictLevelSource: "ai"` 释放通道；底部逐章按钮列表删除。
3. **NodeToolbar（原方案 Part 1）**：选中节点显示数值精确输入 + 单点交还 AI，替代按钮列表。
4. **null 独立轨道（原方案 Part 1）**：未设置章节放坐标区下方专用轨道，不再与 0 值同线。
5. **图例收敛**：五张说明卡折叠为单行紧凑图例，说明文案移入 hover。
6. **beat 色带 + fitView 聚焦切换（原方案 Part 1/2）**：可随 1 落地或紧随其后。
7. **结构治理**：`buildCanvasData` 与 `layout` 两处重复的 segment 构建逻辑合并；坐标纯函数抽到 `curveCoordinates.ts` 并补单测（原方案 Part 3）。

### 本轮修正进展

- 已完成坐标系核心修正：章节 X 轴改为固定步距铺开，React Flow 开启 pan / zoom，并接入 Controls 与 MiniMap；节奏段切换改为视图聚焦，不再过滤掉上下文章节。
- 已完成批量交还 AI：曲线工具条提供“整卷交还 AI”和“当前节奏段交还 AI”，工作台逐章复用既有同值 `conflictLevelSource: "ai"` 释放通道。
- 已完成 NodeToolbar：点选章节节点后可直接输入 0–100 精确值，用户锚定点可在节点工具条内交还 AI；底部逐章交还按钮列表已移除。
- 已完成 null 独立轨道：暂无强度章节进入“待定”轨道，不再与真实 0 值共用基线。
- 已完成图例收敛：五张说明卡改为单行紧凑图例，详细解释放入 hover。
- 已完成结构治理第一步：坐标计算抽到 `curveCoordinates.ts`，节点 / 背景 / 图例抽到 `TensionCurveNodes.tsx`，Panel 回到装配层且单文件行数回落到项目阈值内。
- 未完成项：`curveCoordinates` 纯函数单测、懒加载 chunk 验证、完整浏览器交互验收仍待后续补齐。

## 验收维度

- **符合度**：对外 props 契约与锚定语义零变化；四个已确认的体验问题（密度、误触、null/0 混淆、无精确输入）逐一有对应机制消除；懒加载纪律符合 visualization-stack 决策。
- **完成度**：Part 1–3 全部为第一期必须项。
- **风险性**：重点确认拖拽结束才写值（过程不产生锚定）、只读模式确实无任何写路径、beat 聚焦切换在章节数为 0 / 1 的边界不崩、`@xyflow/react` 样式引入不污染全局 CSS。
