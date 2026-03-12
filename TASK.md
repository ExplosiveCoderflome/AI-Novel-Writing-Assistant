# 创作中枢与全模块 Agent 化总计划

## 摘要
将项目从“多模块页面 + AI 对话辅助”升级为“双中心并行”的 AI 原生创作系统：
- `创作中枢` 成为跨模块状态获取、控制、诊断、编排的统一入口。
- 现有模块页继续保留，作为专业工作台和富编辑界面。
- 小说、拆书、知识库、世界观、写作公式、基础角色库、任务中心全部收口到统一 `Agent + Tools + Runtime + Task Plane`。

文档策略默认采用：
- `TASK.md` 直接替换为本计划，旧的“剩余改造清单”不再作为主文档继续维护。
- 当前处于 Plan Mode，本计划即为后续写入 `TASK.md` 的定稿文本。

## 关键改动

### 1. 产品定位与信息架构重构
- 将 `AI 对话` 统一改名为 `创作中枢`。
- 采用“双中心并行”结构：
- `创作中枢` 负责跨模块理解、查询、控制、编排、审批、诊断。
- 模块页负责结构化浏览、批量管理、富编辑和人工兜底。
- `创作中枢` 默认绑定当前工作区资源，优先支持：
- 当前小说
- 当前章节
- 当前世界观
- 当前知识库范围
- 当前运行任务
- 模块页统一增加“发送到创作中枢”入口和当前资源绑定提示。
- `/chat` 的产品语义调整为“命令与状态中心”，不再以闲聊页思路设计。

### 2. 统一资源模型与能力目录
- 将系统核心对象统一抽象为资源：
- `Novel`
- `Chapter`
- `BookAnalysis`
- `KnowledgeDocument`
- `World`
- `WritingFormula`
- `BaseCharacter`
- `CreativeDecision`
- `Snapshot`
- `GenerationJob`
- `AgentRun`
- 为每类资源统一定义 4 组能力：
- `read/list`
- `inspect/explain`
- `mutate/create/update`
- `run/control`
- 增加统一能力目录接口，供前端和 planner 使用：
- `GET /api/agent-catalog`
- 返回 `agents`、`tools`、`riskLevel`、`input schema summary`、`resource scopes`、`approval policy summary`
- `shared/types/agent` 补齐：
- `DomainAgentName`
- `ResourceScope`
- `ToolCategory`
- `AgentCatalog`
- `CapabilityDefinition`
- `ResourceRef`
- 当前固定 agent 扩展为域语义：
- `Coordinator`
- `NovelAgent`
- `BookAnalysisAgent`
- `KnowledgeAgent`
- `WorldAgent`
- `FormulaAgent`
- `CharacterAgent`
- 运行时内部仍可复用现有 `Planner / Writer / Reviewer / Continuity / Repair`，但对外语义以领域 agent 为主。

### 3. 全模块 Tool Catalog 补齐
- 小说域继续保留并强化已有工具：
- 章节定位、章节正文、范围总结、写作、重写、草稿、快照、创作决策、章节失败诊断
- 拆书域新增工具：
- 列表、详情、状态、失败原因、重试、提炼写作公式、沉淀到知识库
- 知识库域新增工具：
- 列表、上传/接入、索引状态、失败原因、重建索引、检索、摘要、关联资源查询
- 世界观域新增工具：
- 列表、详情、约束读取、冲突检查、设定修改、与小说绑定关系查询
- 写作公式域新增工具：
- 列表、创建、修改、归档、适配小说/章节、解释命中原因
- 基础角色库域新增工具：
- 列表、详情、创建、修改、克隆到小说、生成角色关系草案
- 任务域新增工具：
- 统一任务列表、详情、失败原因、重试、取消、重放、审批状态读取
- 所有高风险写操作统一进入审批矩阵，不允许模块各自绕过 runtime 直接落库。

### 4. Runtime、任务中心与诊断能力统一
- 将 `TaskCenter` 和 `Agent Runtime` 收口为统一运行平面：
- 所有后台操作都必须能映射到统一任务语义
- `TaskCenter` 展示所有任务，`创作中枢` 展示任务的控制与解释
- 扩展统一任务/运行状态模型：
- `queued`
- `running`
- `waiting_approval`
- `succeeded`
- `failed`
- `cancelled`
- 为所有任务和 run 补充诊断字段：
- `failureCode`
- `failureSummary`
- `failureDetails`
- `recoveryHint`
- `sourceResource`
- `targetResources`
- 增加“解释类工具”并纳入 planner 主路径：
- `get_task_failure_reason`
- `get_run_failure_reason`
- `get_index_failure_reason`
- `explain_conflict`
- `explain_generation_blocker`
- 统一轨迹事件顺序：
- `planning`
- `tool_call`
- `tool_result`
- `approval`
- `answer`
- `terminal status`
- 所有“为什么失败”“现在状态如何”“还能不能继续执行”类提问，必须优先走诊断工具，不允许误判成新写作任务。

### 5. 创作中枢前端重做
- 创作中枢页面改为三栏结构：
- 左侧：会话/运行历史、资源固定区
- 中间：命令流、回答、执行结果、建议动作
- 右侧：当前绑定资源、审批、轨迹、任务状态、模型路由
- 输入框支持两类交互：
- 自然语言命令
- 显式动作建议卡片
- 所有模块页增加“在创作中枢中继续”能力，并自动带上资源上下文。
- 任务中心继续保留独立页，但与创作中枢共享同一任务数据源、状态语义和跳转关系。
- 模块页顶部统一显示：
- 当前资源状态
- 最近任务
- 最近 Agent 操作
- 可发往创作中枢的快捷动作

## 接口与类型变更
- 新增 `GET /api/agent-catalog`，返回系统级 agents/tools/capabilities。
- 扩展 `/api/tasks` 与 `/api/agent-runs` 的详情返回：
- 失败原因
- 恢复建议
- 来源/目标资源引用
- 审批摘要
- 扩展 `shared/types/agent`：
- `DomainAgentName`
- `ToolCategory`
- `ResourceScope`
- `AgentCatalog`
- `CapabilityDefinition`
- `ResourceRef`
- 扩展 `shared/types/task`：
- `failureCode`
- `failureSummary`
- `recoveryHint`
- `sourceRoute`
- `sourceResource`
- `targetResources`
- 所有新增用户可见文案统一中文。
- 模型路由任务类型需与领域 agent 和 runtime 统一命名，不允许一处用角色名、一处用页面名。

## 实施顺序
1. 用新总计划整体替换 `TASK.md`，冻结旧清单为历史。
2. 先落地统一资源模型、能力目录和 catalog API。
3. 再补齐拆书、知识库、世界观、写作公式、基础角色库的 tools。
4. 同步扩展任务中心与 runtime 的诊断字段和统一状态语义。
5. 重做 `创作中枢` 页面与资源绑定、运行面板、跨模块动作入口。
6. 最后清理旧的页面内直连服务写操作，将高风险动作全部改为经由 runtime 和审批执行。

## 测试与验收
- 能力目录测试：
- 能正确返回全部 agent、tool、riskLevel、scope
- 模块 tool 测试：
- 每个域至少覆盖 `list/get`、`inspect/explain`、`run/control`
- 任务与运行时测试：
- 失败原因读取
- 审批中断与恢复
- retry / cancel / replay
- 资源引用正确性
- 创作中枢集成场景：
- “这本书当前写到哪一章”
- “第三章为什么失败”
- “列出当前小说关联的知识库状态”
- “把这次拆书结果提炼成三条写作公式”
- “检查当前世界观和前两章是否冲突”
- “把基础角色库里的角色模板加入这本书”
- 双中心一致性验收：
- 模块页发起的动作能在创作中枢看到
- 创作中枢发起的动作能在任务中心和模块页看到
- 最终验收标准：
- 所有主要模块都可被 agent 读取状态和执行控制
- “创作中枢”不再只是聊天页，而是系统总入口之一
- 失败诊断类问题不再误触发新的写作任务
- 高风险写操作全部可追踪、可审批、可解释

## 假设与默认值
- 产品形态采用“`创作中枢` 与模块页双中心并行”，不走单中心替代路线。
- Agent 范围采用“全模块可读可控”，但富编辑仍保留在模块页。
- 实施方式采用“大改重构”，允许重排导航、路由语义和运行体系，但不做破坏性数据重置。
- `TASK.md` 默认整体替换为本计划，不保留旧清单为主文档。
