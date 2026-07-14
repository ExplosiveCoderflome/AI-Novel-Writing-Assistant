# 产品页面 DESIGN 分批优化方案

## 背景

客户端已经形成统一的产品设计规范，但页面级落地并不完整。当前 30 个真实页面中，首页、小说列表、创建小说、自动导演创建、标题工坊和 Prompt Workbench 已完成主要的页面级减噪；其余页面仍混合使用创作驾驶舱、传统后台卡片、普通聊天页和技术配置页等多种视觉语言。

本方案只优化现有页面的信息层级、视觉合同、状态表达、响应式与文案，不增加新的业务能力、API、数据库字段、路由或工作流分支。

客户端规范以 `docs/design/product-ui-design-system.md` 为准。`site/DESIGN.md` 只约束公开介绍站，不用于客户端页面。

## 目标

- 让新手在每个核心页面首屏都能看见当前对象、当前阶段、主任务、推荐动作和关键状态。
- 把页面从“功能和表单集合”收敛为 Dashboard、Workspace、Editor、Asset Library、Task Queue 或 Settings 中的一种主要类型。
- 统一使用 shadcn/CSS 语义 token，减少硬编码颜色、装饰渐变、过度阴影和卡片套卡片。
- 让 Loading、Empty、Error、Disabled、Success 都说明影响和下一步，而不是只展示状态名。
- 保持现有功能、数据和路由兼容；任何视觉改造不得覆盖正文、资产或任务状态。

## 页面设计合同

### Dashboard

先展示推荐下一步，再展示进度、风险和辅助信息。不得把统计数字当作页面主任务。

### Workspace

必须展示当前工作对象、阶段、唯一主操作和辅助状态。两栏或三栏布局需要保证中央主任务区是视觉中心。

### Editor

正文或主要内容必须占据视觉中心。诊断、参数和 AI 建议放在侧栏或次级面板，不得挤压主内容。

### Asset Library

资产条目不仅展示名称和编辑操作，还应尽可能说明来源、启用状态、影响范围、最近使用情况和下一步用途。

### Task Queue

必须区分阻塞问题、可继续的质量提醒和普通任务，并说明处理或忽略后的影响。

### Settings

按用户任务和可用性组织配置，优先回答“能否开始创作”和“如何修复”，技术参数进入次级区域。

## 当前页面基线

### 已基本对齐

- `/`
- `/novels`
- `/novels/create`
- `/novels/auto-director`
- `/titles`
- `/prompt-workbench`

### 部分对齐

- `/novels/:id/preview`
- `/novels/:id/edit`
- `/novels/:id/chapters/:chapterId`
- `/drama`
- `/drama/projects/:id`
- `/book-analysis`
- `/tasks`
- `/auto-director/follow-ups`
- `/settings`
- `/worlds`
- `/style-engine`

### 尚未完成页面级优化

- `/help`
- `/comic`
- `/comic/projects/:id`
- `/creative-hub`
- `/chat-legacy`
- `/knowledge`
- `/genres`
- `/story-modes`
- `/anti-ai-rules`
- `/settings/model-routes`
- `/worlds/generator`
- `/worlds/:id/workspace`
- `/base-characters`

## 分批实施

## 第一批：资产库基础与新手入口

范围：

- 共享 Asset Library 页面页头、推荐动作、分区与空态合同。
- 补充 `success`、`warning`、`info` 语义颜色 token。
- `/knowledge`
- `/genres`
- `/base-characters`

实施重点：

- 知识库首屏说明资料如何进入创作与检索，展示可用文档、处理中任务和失败任务，并根据状态给出下一步。
- 题材基底库从单一管理 Card 改为“用途说明 + 资产概览 + 树工作区”，空态直接引导创建第一个题材基底。
- 基础角色库明确它是跨小说复用资产，补齐 Loading、Error、Empty 和推荐动作，降低删除等危险操作的视觉权重。
- 不新增“使用小说数”等后端尚未提供的数据，不伪造资产影响范围。

验收：

- 三页都有对象、用途、推荐动作和状态反馈。
- 页面根布局不再由单个大 Card 承担全部层级。
- 不新增硬编码色值，不使用装饰渐变。
- 移动端页头动作可纵向排列，列表不产生横向滚动。
- client typecheck 通过。

## 第二批：核心创作与恢复工作台

范围：

- `/creative-hub`
- `/book-analysis`
- `/tasks`
- `/auto-director/follow-ups`

实施重点：

- 创作中枢从普通聊天视觉收敛为“创作线程 + 当前小说 + 执行活动”工作台。
- 拆书页把来源、分析阶段、结果和下一动作固定在首屏。
- 任务与导演跟进统一阻塞、质量提醒、普通任务的视觉等级和处理后果说明。
- 清理 Creative Hub 的硬编码 slate/amber/emerald 色和嵌套 Card。

阶段拆分：

- 2A 任务与恢复合同：建立 Workspace / Task Queue 共享展示边界，统一任务中心和导演跟进的阻塞、质量债、待操作与普通进度语义。
- 2B 拆书结果工作台：把来源、分析阶段、结果入口、部分完成和恢复动作固定在工作台首屏。
- 2C Creative Hub 创作工作台：收敛为创作线程、推进记录和当前小说上下文，修复线程加载与错误状态。

兼容边界：

- 只消费现有结构化状态，不新增 API、数据库字段、路由、Prompt 或工作流分支。
- `directorTaskId` 继续作为导演跟进事实标识，`workspaceTaskId` 不得作为替代。
- 拆书源文读取失败不得隐藏已经生成的分析结果；Creative Hub 切换线程不得继续展示上一线程内容。

## 第三批：世界、写法与模型基础设施

范围：

- `/worlds`
- `/worlds/generator`
- `/worlds/:id/workspace`
- `/style-engine`
- `/anti-ai-rules`
- `/settings/model-routes`
- `/settings` 内部遗留卡片

实施重点：

- 世界资产显示当前状态、可用于哪些创作步骤和推荐深化动作。
- 世界生成器改为清晰的分步工作区，不再把整条流程包在一个大 Card 中。
- 写法与防 AI 规则统一为资产库 + 编辑工作区，清理硬编码 slate 色和超大弹窗。
- 模型路由按“开书、规划、正文、审核、资料处理”组织可用性和修复动作。

## 第四批：短剧与漫画衍生生产

范围：

- `/drama`
- `/drama/projects/:id`
- `/comic`
- `/comic/projects/:id`

实施重点：

- 项目库突出最近项目和下一生产动作。
- 项目页统一来源、阶段、主任务、质量状态和下一步。
- 漫画页清理统计小卡、技术标签和硬编码颜色，避免把生成参数放在首屏中心。
- 不改变现有短剧、漫画生成和图片确认流程。

## 第五批：阅读、帮助与兼容页收尾

范围：

- `/novels/:id/preview`
- `/novels/:id/edit` 各遗留 Tab
- `/novels/:id/chapters/:chapterId`
- `/help`
- `/story-modes`
- `/chat-legacy`

实施重点：

- 小说预览补齐当前章节、阅读进度和进入编辑器的推荐动作。
- 小说工作台和章节编辑器收敛圆角、侧栏权重和状态块。
- 帮助页从营销 Hero 改为新手任务导航。
- 推进模式改为可复用资产库，技术字段进入编辑详情。
- 旧聊天页只做兼容性维护；确认无依赖后另行决定退役，不在视觉阶段擅自删除路由。

## 第六批：全站一致性验收

范围：全部客户端页面。

实施重点：

- 清理一次性十六进制颜色和散落的 slate/amber/emerald/sky 状态色。
- 检查圆角、阴影、卡片嵌套、标题层级和按钮主次。
- 把 `index.css` 中依赖 DOM 结构的 `.mobile-route-*` 兜底逐步迁回页面或模块所有的响应式布局。
- 检查键盘焦点、图标按钮可访问名称、对话框焦点管理和颜色之外的状态文字。
- 对所有新增文案执行用户视角复核。

## 实施边界

- 不在 `components/ui/` 写入业务逻辑。
- 跨资产库复用的组合组件归属 `client/src/components/assetLibrary/`，页面业务组件继续留在各自模块。
- 同一阶段只改一组具有共同页面类型的页面，验证通过后创建独立提交。
- 不运行浏览器、截图或 Playwright 作为默认验收；UI 交互验收交给用户，代码侧执行 typecheck 和聚焦测试。
- 每批开始前检查单文件长度；超过 700 行的页面必须先按职责拆分，不能继续堆叠视觉 JSX。

## 阶段状态

- 第一批：完成（2026-07-14）。
- 第二批：进行中（2026-07-14，2A 已完成，2B / 2C 收口中）。
- 第三批：待开始。
- 第四批：待开始。
- 第五批：待开始。
- 第六批：待开始。

## 第一批实施结果

- 建立 `client/src/components/assetLibrary/` 页面组合边界。
- 补齐 `success`、`warning`、`info` 全局语义 token。
- 知识资料库具备用途页头、资料/索引状态、动态推荐动作，以及加载、失败、空库和筛选无结果恢复入口。
- 题材基底库具备用途页头、题材/关联小说/说明完整度摘要，以及树结构工作区和删除保护说明。
- 基础角色库具备用途页头、角色/类型/形象/资料完整度摘要，以及加载、失败、空库和角色详情分区。
- 未新增 API、路由、数据库字段或业务流程；后端未提供的数据没有在界面中推测。

## 第二批 2A 实施结果

- 建立无业务状态的 Workspace 页面组合和 Task Queue 展示边界。
- 任务中心使用现有任务概览展示全局执行、等待操作和恢复候选，并为列表、详情补齐加载、失败、空态和重试。
- 导演跟进继续以 `directorTaskId` 作为事实身份，旧 `taskId` 只用于兼容读取，未使用 `workspaceTaskId` 替代。
- 明确区分必须处理、待操作、可继续质量提醒和普通进度；所有任务动作展示执行后果。
