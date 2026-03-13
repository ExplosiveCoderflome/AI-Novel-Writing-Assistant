# `ASSISTANT_UI_PLAN.md` 定稿：assistant-ui 深度接入与 LangGraph 创作中枢改造计划

## 摘要
本次改造以“直接按 LangGraph 重构、但采用并行迁移”作为固定策略，把当前自定义 `/chat + SSE + IndexedDB 会话` 的聊天工作台，升级为基于 `assistant-ui + useLangGraphRuntime` 的创作中枢。

目标结果：
- `/creative-hub` 成为新的 LangGraph 创作中枢默认入口。
- 运行信息以消息流内联展示为主，右侧面板收敛为资源绑定、全局状态、模型路由与快捷控制。
- 会话、分支、编辑、审批、重放、失败诊断统一收口到 LangGraph 线程与 checkpoint 语义。
- 现有 `/chat` 暂时保留为 `/chat-legacy`，稳定后再下线。
- 本计划文档单独保存为 `ASSISTANT_UI_PLAN.md`，不并入 `TASK.md`。

## 关键改动

### 1. 运行时与后端收口到 LangGraph
- 在服务端新增 `creative-hub` LangGraph 模块，独立于现有 `routes/chat.ts`，不要继续向旧聊天路由堆逻辑。
- 图状态固定包含：
  - `messages`
  - `threadId`
  - `runId`
  - `resourceBindings`（`novelId/chapterId/worldId/knowledgeDocumentIds/taskId`）
  - `approvalState`
  - `diagnostics`
  - `taskRefs`
  - `uiState`
- 图节点固定为：
  - `bind_context`
  - `coordinator_plan`
  - `tool_execute`
  - `approval_gate`
  - `answer_finalize`
  - `task_sync`
- 高风险写操作必须通过 `approval_gate` 触发 interrupt，不再靠前端拼接审批流。
- 现有 `AgentRuntime` 不直接删除，先作为 LangGraph 工具层/适配层被调用；等新图稳定后再逐步下沉或替换。
- 不接入 LangGraph Cloud，不接入 assistant-cloud；采用项目内自托管线程与 checkpoint 持久化。
- 后端新增线程与图运行接口，供前端 `useLangGraphRuntime` 和自定义 thread list 使用：
  - `POST /api/creative-hub/threads`
  - `GET /api/creative-hub/threads`
  - `PATCH /api/creative-hub/threads/:id`
  - `DELETE /api/creative-hub/threads/:id`
  - `GET /api/creative-hub/threads/:id/state`
  - `GET /api/creative-hub/threads/:id/history`
  - `POST /api/creative-hub/threads/:id/runs/stream`
  - `POST /api/creative-hub/threads/:id/interrupts/:interruptId`
- 服务端保留并扩展 `agent-catalog`，作为前端工具 UI、能力面板、建议动作和资源绑定提示的数据源。
- 线程与 checkpoint 进入数据库持久化；`chatStore` 不再作为会话真源，只允许保留本地草稿缓存。

### 2. 前端切到 `assistant-ui` 深接入模式
- 安装并对齐：
  - `@assistant-ui/react`
  - `@assistant-ui/react-ui`
  - `@assistant-ui/react-langgraph`
  - `@langchain/langgraph-sdk`
  - 开发环境额外接入 `@assistant-ui/react-devtools`
- 当前超过 500 行的 [ChatPage.tsx](/D:/code/AI-Novel-Writing-Assistant-v2/client/src/pages/chat/ChatPage.tsx) 必须先拆分，再承接新功能。
- 新的创作中枢页面改为模块化结构：
  - 线程列表区
  - 主消息流区
  - 右侧资源/状态区
  - 工具 UI 注册区
  - LangGraph runtime 适配区
- 创作中枢必须同时支持两种工作状态：
  - `全局模式`：未绑定小说时，用于列出小说、创建小说、选择工作区、查看系统级状态
  - `小说工作区模式`：绑定 `novelId` 后，围绕单本小说继续执行章节、世界观、知识文档、任务诊断
- `/creative-hub` 使用 `useLangGraphRuntime`；`/chat` 重定向到 `/creative-hub`；旧实现移动到 `/chat-legacy`。
- 线程列表改用 assistant-ui 的自定义 thread list 语义，线程标题、归档、删除、最近资源绑定都走服务端接口。
- 消息流内联渲染优先接入：
  - `Chain of Thought`
  - `ToolFallback` + 自定义 Tool UI
  - 消息编辑
  - 消息分支
  - regenerate
- 右侧面板只保留：
  - 当前资源绑定
  - 当前 run / interrupt 概览
  - 模型路由摘要
  - 最近任务状态
  - 快捷跳转到模块页
- 右侧资源区必须提供显式的小说工作区切换能力：
  - 小说下拉选择器
  - 清空当前小说绑定，回到全局模式
  - 未绑定小说时显示“创建新小说”快捷动作
- 创作中枢空状态与建议动作必须覆盖：
  - 列出当前小说列表
  - 创建新小说
  - 选择某本小说作为当前工作区
- 所有审批、失败诊断、任务状态、世界观冲突、知识库索引状态都优先作为 Tool UI 卡片显示在消息流中，而不是继续堆在侧栏文本里。
- 模块页统一补“发送到创作中枢”深链接，至少覆盖小说、拆书、知识库、世界观、写作公式、基础角色库、任务中心。

### 3. Tool UI 与系统能力映射
- 业务工具继续由后端执行，前端只注册同名 Tool UI，不在浏览器执行核心写作逻辑。
- 首批必须落地专用卡片的工具：
  - `list_novels`
  - `create_novel`
  - `select_novel_workspace`
  - `get_task_failure_reason`
  - `get_run_failure_reason`
  - `explain_generation_blocker`
  - `explain_world_conflict`
  - `list_tasks`
  - `list_knowledge_documents`
  - `list_book_analyses`
  - `list_writing_formulas`
  - `list_base_characters`
  - 小说章节读取与范围总结工具
- 审批改为 interrupt 卡片：
  - 卡片内直接展示目标资源、差异摘要、影响范围、审批备注输入框
  - 操作按钮直接调用 interrupt/resume 接口
- 失败诊断改为诊断卡片：
  - 显示失败摘要
  - 恢复建议
  - 相关 run / task 跳转
  - 可继续动作
- 小说工作区改为显式卡片与动作闭环：
  - `list_novels` 返回小说列表卡片
  - `create_novel` 返回创建结果卡片
  - 创建成功后自动把新小说写回当前线程 `resourceBindings.novelId`
  - `select_novel_workspace` 负责把指定小说绑定为当前线程工作区
- 工具 UI 必须支持“继续追问”动作，把结构化建议回填为下一条 prompt。
- 使用 assistant-ui Context API 管理：
  - 当前线程绑定资源
  - 当前运行状态
  - 当前 interrupt
  - 当前工具面板状态
  - 模块页跳入创作中枢时的上下文注入

### 4. 线程、分支与兼容迁移
- 现有本地 `chatStore` 会话模型迁移为服务端线程模型：
  - 线程标题
  - 归档状态
  - 最近运行
  - 最近绑定资源
  - 最近更新时间
- 前端不再依赖 `/chat/history` 空接口；历史统一从线程状态与线程历史读取。
- 分支与编辑按 LangGraph checkpoint 语义实现：
  - `load(thread)` 返回消息与 interrupts
  - `getCheckpointId(threadId, parentMessages)` 从服务端线程历史中解析
  - 无法精确匹配 checkpoint 时，禁止编辑分支，返回显式错误
- 旧的 `useSSE`、手写消息拼装、运行事件拼接逻辑只保留给 `/chat-legacy`，不再继续扩展。
- 旧 `RuntimeSidebar` 中与 trace/approval 强绑定的逻辑逐步下线，避免新旧双份状态长期并存。

## 接口与类型变更
- 前端新增 `creative hub` 专用 API 层，替代当前零散 `chat.ts + agentRuns.ts + chatStore` 组合。
- `shared/types/agent` 扩展或新增：
  - `CreativeHubThread`
  - `CreativeHubThreadState`
  - `CreativeHubInterrupt`
  - `CreativeHubResourceBinding`
  - `CreativeHubCheckpointRef`
- `shared/types/api` 新增 LangGraph 风格流式事件与线程响应类型，不再只围绕旧 SSEFrame。
- 保留现有 `agent-catalog`，但为每个工具补足：
  - `uiKind`
  - `resourceScopes`
  - `approvalRequired`
  - `followupActions`
- 创作中枢接口与 planner 必须显式支持全局小说管理能力：
  - 无 `novelId` 时允许调用 `list_novels` / `create_novel`
  - `create_novel` 成功后必须回写线程绑定并刷新右侧工作区状态
  - `select_novel_workspace` 作为显式工作区切换动作，不依赖用户手写 URL 参数
- 模块页深链接统一规范：
  - `/creative-hub?novelId=...`
  - `/creative-hub?worldId=...`
  - `/creative-hub?taskId=...`
  - 支持组合绑定，但同类资源一次只允许一个主绑定。

## 测试与验收
- 服务端测试：
  - 线程创建、重命名、归档、删除
  - `state/history` 读取
  - run stream 正常结束
  - interrupt 审批恢复
  - checkpoint 匹配与分支编辑
  - 失败诊断问题不再误触发写作任务
- 前端测试：
  - 创作中枢线程切换
  - 工具卡片渲染
  - interrupt 卡片审批
  - 消息编辑后生成分支
  - 资源绑定从模块页带入
  - 全局模式下选择小说并切换为小说工作区
  - 全局模式下创建新小说并自动绑定到当前线程
  - `/chat-legacy` 与 `/creative-hub` 并行不冲突
- 开发验收场景固定覆盖：
  - “列出当前的小说列表”
  - “创建一本小说《抗日奇侠传》”
  - “把《抗日奇侠传》设为当前工作区”
  - “这本书当前写到哪一章”
  - “第三章为什么失败”
  - “列出当前小说关联的知识库状态”
  - “检查当前世界观和前两章是否冲突”
  - “把基础角色模板加入这本书”
  - “重写第三章并进入审批”
  - “编辑上一条指令并生成新分支”
- 质量门槛：
  - `typecheck` 全绿
  - 现有 server tests 全绿
  - 新增 creative hub route/runtime tests
  - 不允许继续向 500 行以上单文件堆逻辑

## 假设与默认值
- 本计划即 `ASSISTANT_UI_PLAN.md` 的最终内容。
- 路线固定为“直接按 LangGraph 设计，但采用并行迁移，不一次性替换全部旧实现”。
- UI 表达固定为“消息流内联为主，右侧资源面板为辅”。
- 不使用 assistant-cloud，不依赖 LangGraph Cloud，全部使用项目自托管后端。
- 旧 `/chat` 与本地 `chatStore` 只作为过渡兼容层，不再继续加新能力。
- 现有 `AgentRuntime`、任务中心、能力目录继续复用，但都以 LangGraph 创作中枢为新的主运行语义。
