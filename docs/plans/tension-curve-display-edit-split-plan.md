# 紧张度曲线「展示 / 编辑」分离方案

## 背景

紧张度曲线当前是一个"既能看又能拖"的单一组件，直接内嵌在节奏拆章工作台里。这带来两个问题：

1. **误触成本高**：曲线常驻可编辑状态，用户只是想看一眼节奏走向，稍不注意就拖动了一个点，产生一次不必要的锚定。
2. **编辑现场太小、太孤立**：编辑动作被压缩在一个几百像素高的内嵌卡片里，用户拖动某章数值时看不到"这一章属于哪个节奏段、这个节奏段要交付什么、卷战略对这一段的定位是什么"——纯粹在跟一个孤立的数字打交道，容易调出脱离叙事意图的曲线（比如把"暴露危机"节奏段的强度拖成和"开卷抓手"一样平）。

用户方向：**外部（工作台内嵌、卷战略缩略图）永远只展示，不可编辑；编辑收进一个弹窗，弹窗要把"这一段和卷级规划的关系"讲清楚，而不是只给一堆可拖的点。**

## 设计核心

### 1. 两层组件，职责单一

- **展示层**（`TensionCurvePanel`，改造后）：任何场景下都是只读——不接收 `onPointChange`/`onPointRelease`，没有拖拽、没有 NodeToolbar、没有整卷/批量交还按钮。保留：图例、形状体检提示、参考线开关（参考线是只读对照，属于"看"的范畴，不属于"编辑"）。新增一个明显的"编辑"入口（按钮或点击曲线本身）。
- **编辑层**（新增 `TensionCurveEditDialog`）：一个全屏或大尺寸的 Dialog/Sheet，内部装配当前的可编辑画布（拖拽、NodeToolbar、整卷/单段交还 AI、批量释放）——这部分逻辑基本从现有 `TensionCurvePanel` 平移过去，不重新发明。

两层共享同一份底层几何计算（`curveCoordinates.ts`）和节点渲染（`TensionCurveNodes.tsx`），只是编辑层多装配交互与上下文面板。

### 2. 编辑弹窗的产品设计：卷级链接怎么放

这是本方案的重点。弹窗不是"把现在的卡片放大"，而是在数值曲线周围补齐"为什么长这样"的叙事上下文。三个信息层，从粗到细：

**顶部：卷级定位条（一直可见，不随选中章节变化）**
卷战略对这一卷的定位——`VolumeStrategyVolume` 已有 `roleLabel`（卷角色定位）、`coreReward`（核心读者回报）、`escalationFocus`（本卷升级焦点）。这三条以一行摘要形式常驻弹窗顶部，作用是：用户在拖动第 23 章的强度之前，先看一眼"这一卷本来就该是承上启下、还是该是全书最高潮"——避免把一个"承上启下卷"硬拖出堆满尖峰的曲线。

**中层：节奏段导航条（点击切换聚焦区间，同时联动详情）**
现有的 beat 切换按钮保留，但每个 beat 按钮旁/下方联动展示该 beat 的 `summary`（一句话概括）和 `mustDeliver`（必须交付的清单）——这两个字段 `StructuredBeatSheetCard.tsx` 里已经在用同样的方式展示，弹窗直接复用同一套文案来源，不新造内容。效果：切到"中段转向：暴露危机"这个 beat 时，曲线下方能看到"这一段必须交付：xxx、xxx"，用户拖动这几章的强度时，心里对着的是具体交付目标，不是抽象的红点。

**细层：选中章节的详情侧栏（点选曲线上某个节点时展开）**
点选一个章节点，弹窗侧边（或底部抽屉）展开该章的 `title`/`summary`/`purpose`/`exclusiveEvent` 等字段的只读摘要（`StructuredChapterDetailCard` 已有这些字段，弹窗只做只读展示，不重复实现编辑表单）。同时提供一个"打开完整章节细节卡片"的跳转入口，供需要改标题/摘要等非数值内容时深入编辑——曲线弹窗本身不接管这些字段的编辑权，职责边界清楚：曲线弹窗只管强度数值，其余细节仍归章节细节卡片。

**布局草图（桌面宽屏，弹窗占大部分视口）**：

```
┌─────────────────────────────────────────────────────────┐
│ 卷级定位条：承上启下卷 · 核心回报：xxx · 本卷升级焦点：xxx   │
├─────────────────────────────────────────────────────────┤
│ [整卷] [开卷抓手] [首次升级] [中段转向:暴露危机*] [高潮...] │
│ 当前节奏段必须交付：暴露危机线索、反派身份浮现              │
├───────────────────────────────────────┬─────────────────┤
│                                         │ 第23章 详情      │
│         （可编辑曲线画布，占主区）       │ 标题/摘要/目的   │
│                                         │ [打开完整细节]   │
│                                         │                 │
├───────────────────────────────────────┴─────────────────┤
│ 形状体检提示 · 参考线切换 · 整卷/当前段交还 AI             │
└─────────────────────────────────────────────────────────┘
```

移动端/窄屏：卷级定位条、节奏段导航条折叠为可展开的摘要行；侧栏详情改为点选后从底部弹出的抽屉。

### 3. 两个消费方的处理方式不同（需要你确认）

- **节奏拆章工作台**（`StructuredOutlineWorkspace.tsx`）：内嵌处改为只读展示 + "编辑紧张度曲线"按钮，点击打开弹窗；弹窗关闭后展示层读取的仍是同一份工作台草稿状态，无需额外同步逻辑。
- **卷战略/卷骨架页**（`OutlineTab.tsx`）：**已确认不做就地编辑**。保持纯只读缩略图，不接入编辑弹窗，不搬运批量释放、章节详情跳转等编辑装配依赖。缩略图上可加一个"去节奏/拆章编辑"的跳转链接，引导用户回到节奏拆章工作台完成编辑。

## 不做的事

- 不改变锚定/解除锚定的持久层语义与 API（这是纯前端展示形态调整）。
- 不新增"卷级定位条""节奏段交付清单"的数据来源——全部复用 `strategyPlan`/`beatSheet` 现有字段，不新增后端字段或 prompt 改动。
- 弹窗内不接管章节标题/摘要/目的等字段的编辑权，这些仍归 `StructuredChapterDetailCard`。
- 不在卷战略/卷骨架页接入编辑弹窗或任何就地编辑能力（已确认，仅保留只读缩略图 + 跳转链接）。

## 分步执行计划（文件层级，供确认方案后使用）

### Part 1：展示层瘦身
- `client/src/components/tensionCurve/TensionCurvePanel.tsx`：移除拖拽、NodeToolbar 交互、批量/单点交还按钮，`onPointChange`/`onPointRelease`/`onPointReleaseMany` props 整体去掉；新增 `onRequestEdit?: () => void` 及一个"编辑紧张度曲线"入口按钮。

### Part 2：编辑层拆出
- `client/src/components/tensionCurve/TensionCurveEditDialog.tsx`（新）：Dialog 外壳 + 卷级定位条 + 节奏段导航条（联动 summary/mustDeliver）+ 主编辑画布区 + 选中章节详情侧栏 + 底部工具条（形状体检、参考线、批量交还）。当前可编辑逻辑（拖拽约束、NodeToolbar、批量释放）从旧 `TensionCurvePanel` 平移到这里的画布区。
- `client/src/components/tensionCurve/TensionCurveVolumeContextBar.tsx`（新）：卷级定位条，接收 `VolumeStrategyVolume` 摘要字段。
- `client/src/components/tensionCurve/TensionCurveBeatContextStrip.tsx`（新）：节奏段导航条 + summary/mustDeliver 联动展示，复用 `StructuredBeatSheetCard` 现有的文案取用方式。
- `client/src/components/tensionCurve/TensionCurveChapterDetailSidebar.tsx`（新）：选中章节只读摘要 + 跳转入口。

### Part 3：消费方接入
- `client/src/pages/novels/components/StructuredOutlineWorkspace.tsx`：内嵌处改为只读 `TensionCurvePanel` + `TensionCurveEditDialog`（受控开关状态）；把批量释放、`onChapterNumberChange`、`strategyPlan`、`selectedBeatSheet`、章节详情跳转的回调都传给弹窗。
- `client/src/pages/novels/components/OutlineTab.tsx`：保持只读缩略图，不接入编辑弹窗；加一个跳转到节奏拆章工作台的链接/按钮。

## 验收维度

- **符合度**：展示层任何场景下不可写；`OutlineTab.tsx` 的缩略图确认无任何编辑入口（无拖拽、无弹窗触发）；编辑弹窗内的卷级/节奏段上下文文案与 `StructuredBeatSheetCard`/卷战略页展示的字段来源完全一致，不出现文案不同步。
- **完成度**：Part 1–3 为第一期必须项，全部纳入本轮范围（卷战略页范围已确认为"只读 + 跳转"，无待决项）。
- **风险性**：重点确认弹窗关闭后草稿状态与工作台主视图一致（无遗漏保存或状态错位）、批量交还等既有安全规则（同值 + 显式 ai 来源）在搬到弹窗后行为不变。

## 本轮实施进展

- Part 1 已完成：`TensionCurvePanel` 只保留只读展示、视口切换、参考线、图例和形状提示，不再接收 `onPointChange` / `onPointRelease` / `onPointReleaseMany`。
- Part 2 已完成：可编辑 React Flow 画布拆入 `TensionCurveFlowCanvas`，编辑装配进入 `TensionCurveEditDialog`；弹窗补齐卷级定位条、节奏段交付条、章节详情侧栏和整卷/当前段交还 AI。
- Part 3 已完成：节奏 / 拆章工作台通过“编辑紧张度曲线”打开弹窗；卷战略 / 卷骨架页保持只读缩略图，只提供“去节奏 / 拆章编辑曲线”的跳转入口。
- 已通过代码级验证：`pnpm --filter @ai-novel/client typecheck`。按项目验证规则，浏览器截图与拖拽手感验收留给用户在实际 UI 中确认。
