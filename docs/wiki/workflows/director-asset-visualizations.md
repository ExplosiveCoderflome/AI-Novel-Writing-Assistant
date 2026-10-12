# 导演资产图谱的只读边界

## 背景与决定

V1 和 V2 共用已保存的小说资产，但导演任务、命令、恢复与执行租约必须保持独立。地图和角色关系图属于资产阅读能力，复用已有图谱组件不等于复用旧导演流程。

V2 在小说目录提供“世界地图”和“角色关系图”。两者按需加载，阅读正文不触发图谱查询或生成；视图布局和筛选只改变本地展示。

## 世界地图数据规则

- 从 workspace 投影的本书 `NovelWorld` 结构读取地点、势力、规则和显式路线。只有本书副本不存在时才兼容关联 `World`，副本缺失内容不从世界库补齐。
- 坐标、方向、风险和故事作用使用保存字段。没有坐标时由图谱布局安排位置，属于示意图；不能从“北门”等名称猜测地理方向，也不能把共同控制区推断成通行路线。
- 地点连接和势力关系只显示两端均存在的记录，不因固定展示额度截断保存世界。没有历史事件集合时保留空时间线，不能把规则或冲突包装成历史事件。
- 缺少结构、地点或读取失败分别显示相应提示，阅读不能补生成、同步世界库或改写资产。

`worlds/:id/visualization` 的旧实现可能在缺少结构化资料时调用 LLM，因此不能作为 V2 的自动阅读接口。V2 用纯数据投影连接现有 WorldVisualizationBoard，保留地图缩放、拖动、筛选和全屏能力。

## 角色关系数据规则

- 节点使用本书保存的角色资料，关系读取现有 `character-relations` 和 `character-dynamics/overview` GET。两条查询只读，不进入角色诊断、关系重建或旧导演执行。
- 动态总览是全书最新视角，并非某章历史快照。图谱必须说明可能包含后续剧情；阅读章节的角色抽屉仍按其历史范围显示有来源的记录。
- 关系图保留全部、当前角色、高张力和动态阶段筛选，以及节点、连线详情和全屏查看。查询失败应提示关系资料不完整，并提供只读重试，不能当作没有关系。
- 未打开关系视图时不发送图谱查询；打开时定期读取已保存变化。预览禁用网络读取，并忽略同键缓存中的真实关系数据。
- 前端复用的是纯图谱门面，禁止把旧 CharacterRelationsTab 的诊断和修改动作一并导入 V2。

## 验证与维护

数据投影测试覆盖保存坐标、显式路线、悬空连接、大世界不截断和禁止从文本猜测地图。Node 渲染检查覆盖目录入口、地图默认页签、角色关系读取、预览和错误提示；它不能替代用户的缩放、拖动与窄栏交互验收。

临时 SQLite 验证 workspace 与关系查询读取前后的保存行一致。V1 / V2 独立 Worker、版本归属和 epoch 规则继续由[导演版本隔离](director-version-isolation.md)约束；资产图谱不得新增任何导演状态写入。

## 相关模块

- `client/src/pages/directorNext/workspace/visualizations/`：V2 数据投影和图谱接入。
- `client/src/pages/worlds/components/visualization/`：世界图谱展示门面与布局。
- `client/src/pages/novels/components/characterWorkspace/relationshipGraph/`：角色关系图纯展示门面。
- `server/src/app/director/workspace/`：本书保存资料投影。
- `server/src/services/novel/dynamics/CharacterDynamicsQueryService.ts`：已保存动态查询。
