# 世界可视化资产边界

## Background

世界模块需要让写作者直观看到世界的地点、势力、规则和时间变化。地理地图尤其容易被误解为真实 GIS 地图，但小说创作需要的是“可指导叙事的相对空间”，不是精确经纬度或专业制图。

## Decision

世界地图使用 0-100 的相对坐标系表达主要地点位置：

- `x` 越大表示越偏东。
- `y` 越大表示越偏南。
- `directionHint` 表示北、南、东、西、中心或斜向方位。
- `regionType` 表示大陆、国家、区域、城市、地标、边境、路线或其他。
- `edges` 表达地点之间的相邻、通道、隔绝或控制关系，并可附带路线类型。

这套数据用于绘制小说世界的主要地点位置和连通关系，不承诺真实地理比例、边界面积或精确距离。

## Current Rule

世界可视化数据优先来自结构化世界手册：

1. `locations` 生成地图节点，并携带地形、风险、叙事作用和控制势力。
2. `locationControls` 可生成地点之间的控制或边界关系。
3. 如果结构化世界不足，旧版 `geography/background` 文本会按地点名称和方位词生成保守的相对坐标。
4. AI 可视化 Prompt 必须输出可清洗的地图坐标，不应只返回地点清单。

前端渲染规则：

- 有 `x/y` 时按世界地图布局绘制。
- 缺少坐标时可退回自动布局，保证旧数据仍可展示。
- 地图节点展示地点名、方位、地形和风险提示。
- 路线可按道路、河流、海路、传送、商道、军道、边界等类型区分。

## Failure Modes

- 如果只把地点按圆形布局展示，用户会误以为系统仍只是关系图，不能理解地点方位。
- 如果把相对坐标当作真实地理坐标，会制造错误精度感。
- 如果没有结构化地点，仅靠自由文本抽取，地图只能作为草图，不能表达完整区域边界。
- 如果 Prompt 不要求坐标，LLM 容易返回地点名列表，前端只能退回关系图。

## Related Modules

- `shared/types/world.ts`
- `server/src/services/world/worldVisualization.ts`
- `server/src/services/world/worldVisualizationSchema.ts`
- `server/src/prompting/prompts/world/world.prompts.ts`
- `client/src/pages/worlds/components/WorldVisualizationBoard.tsx`
