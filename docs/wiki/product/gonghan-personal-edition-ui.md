# 宫寒个人版前端方向

## Background

宫寒个人版是在上游 AI Novel Writing Assistant 基础上的个人 fork。前端需要体现个人项目身份，但不能破坏原有长篇小说生产链、自动导演状态判断、路由和接口契约。

## Decision

主应用采用「小说导演控制台」方向：首页优先回答用户今天该继续哪本书、下一步点哪里、哪些后台任务需要注意。视觉上使用沉稳纸纹、墨绿和暖金强调色，避免默认后台模板感，也避免用大面积单调渐变替代真实工作台层级。

## Current Rule

- 公开品牌使用「宫寒小说自动化工作台 / Gonghan Novel Studio」。
- 首页应作为创作驾驶舱，聚合主推进项目、下一步行动、任务信号和创作队列。
- 侧边栏和移动端外壳应服务于新手完成整本小说，而不是只罗列功能模块。
- 前端优化默认只改展示层；不得改变 `client/src/api/*`、后端接口、路由路径、query key、自动导演状态判断或数据库契约。
- 图标使用 `lucide-react`，不用 emoji 作为 UI 图标。
- 主要视觉区域应包含纹理、边框、层级或真实产品资产，不依赖纯渐变撑场面。

## Examples

- 「一句灵感开书」作为新手入口，应优先连接到自动导演创建流程。
- 「主推进项目」的推荐操作应继续复用现有 workflow 判断函数，而不是新增前端特殊规则。
- 「创作队列」展示最近项目状态时，只改变信息层级和样式，不改变项目排序与跳转契约。

## Related Modules

- `client/src/pages/Home.tsx`
- `client/src/components/layout/AppLayout.tsx`
- `client/src/components/layout/Navbar.tsx`
- `client/src/components/layout/Sidebar.tsx`
- `client/src/components/layout/mobile/MobileSiteShell.tsx`
- `client/src/index.css`
