# 前端可视化技术栈决策

## Background

项目已出现并将持续出现多类可视化需求：紧张度曲线（已上线，手写 SVG 待重构）、世界地图与势力图谱（`WorldVisualizationBoard.tsx` 目前为 836 行手写实现，含自研节点拥挤度算法）、知识图谱、角色关系网、故事时间线（`shared/types/timeline.ts` 类型已就绪）、自动导演工作流步骤图（step catalog 已具备 order/prerequisites 编排元数据）、伏笔账本依赖图、以及质量分/字数/RAG 追踪等统计图表。

历史教训：紧张度曲线第一版从零手写坐标换算与指针事件，60 章场景下密度失控、易误触、无缩放；`WorldVisualizationBoard` 也在重复发明图布局。每个可视化面各自手搓，成本与缺陷都在重复发生。同时项目源码用户较多，每新增一批依赖都要求他们重新 `pnpm install`，依赖必须一次定盘、避免分多轮引入。

## Decision

2026-07 一次性引入以下依赖（全部进 `client`，随功能页懒加载，不进首屏）：

| 层 | 依赖 | 职责 |
|---|---|---|
| 画布交互 | `@xyflow/react`（React Flow） | 一切"节点 + 连线 + 平移缩放"场景的交互骨架：知识图谱、世界地图/势力图、角色关系网、工作流步骤图、伏笔依赖图 |
| 布局算法 | `d3-force` | 力导向布局（图谱、关系网的自动排布） |
| 布局算法 | `dagre` | 层次/有向布局（工作流步骤图、伏笔依赖这类有明确方向的图） |
| 图表数学 | `d3-scale` / `d3-shape` / `d3-array` / `d3-zoom` / `d3-selection` | 定制交互图表（紧张度曲线等）的坐标映射、路径生成、缩放；`d3-selection` 仅作为 `d3-zoom` 的运行时依赖存在 |
| 标准图表 | `recharts` | 声明式统计图表（柱/线/饼/雷达）：质量分布、字数统计、RAG 追踪面板等，避免每个统计面板重新手写 |

## Current Rule

1. **渲染归 React**：禁止用 `d3-selection` 直接操作 DOM；D3 只做纯计算（scale/shape/force），坐标算完由 JSX 渲染。
2. **只按子模块引入 D3**：`import { scaleLinear } from "d3-scale"`；禁止安装或引入整包 `d3`。
3. **懒加载纪律**：所有可视化组件经 `React.lazy` 进入路由级独立 chunk，首屏 bundle 零增量。
4. **场景归位**：节点图类 → React Flow；笛卡尔坐标交互图表 → d3 数学 + 手写 React SVG；标准统计图 → Recharts。不要用 React Flow 硬做坐标系图表，也不要用 Recharts 硬做需要拖拽编辑的定制交互。
5. **存量迁移**：`WorldVisualizationBoard` 等手写图实现，在下次实质迭代时迁移到 React Flow，不做专项重写。

## 边界与触发条件（当前明确不引入）

- **Konva / react-konva**：仅当地图需求升级为"自由手绘多边形、像素级绘图工具"时再评估；当前"标点 + 区域 + 连线"形态由 React Flow 覆盖。
- **elkjs**：dagre 布局能力不够用（复杂正交路由、端口约束）时的升级项，体积约为 dagre 的三倍，不预装。
- **3D / WebGL（three.js 等）**：无场景，不预装。

## Failure Modes

- 新可视化需求出现时绕过本决策另引新库 → 先对照上表判断场景归位，确不覆盖再扩充本文档。
- 忘记懒加载导致首屏 bundle 膨胀 → build 后检查 chunk 划分。
- 在 React 组件里用 d3-selection 改 DOM → 与 React 渲染互相覆盖，属于事故写法。

## Related

- [tension-curve-plan](../plans/tension-curve-plan.md) — 紧张度曲线（本决策的第一个消费场景）
- `scripts/check-deps.cjs` — 源码用户依赖防呆检查，本次批量引入正是它要兜底的场景
