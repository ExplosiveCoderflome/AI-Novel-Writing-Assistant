# 当前基线下的剩余改造清单

## 文档定位

- 本文件不再沿用最早的分阶段设想，而是以当前仓库实际代码为基线，列出还未完成的改造项。
- 目标不是重复记录“已经做了什么”，而是明确“距离可稳定交付的目标方案还差什么”。
- 本清单默认按重要性和依赖关系组织，但不强制分阶段执行。

## 当前已具备的基线能力

- 已有统一的 Agent Runtime 基础设施，包含 `orchestrator`、`toolRegistry`、`approvalPolicy`、`traceStore`、`AgentRuntime`。
- `/api/chat` 已支持 `standard / agent` 双模式、`global / novel` 上下文模式、`runId` 和审批续跑。
- 已有 `AgentRun / AgentStep / AgentApproval` 数据模型、`/api/agent-runs` 路由、审批处理、运行轨迹与步骤重放。
- `/chat` 已复用现有页面完成运行轨迹、审批区、`runId` 恢复、会话与运行关联。
- `TaskCenter` 已支持 `agent_run` 类型，且适配器化拆分已经完成。
- `NovelService` 已退化为 facade，核心逻辑已拆入 `NovelCoreService / NovelPipelineService / NovelGenerationService / NovelReviewService / NovelContextService / NovelArtifactService` 等模块。
- 章节流水线已不再完全依赖内联逻辑，当前管线已接入 `server/src/services/novel/chapterWritingGraph.ts`。
- 模型路由后端已落地，包含 `modelRouter`、数据库配置表与 `getLLM(taskType)` 集成。
- RAG 侧的叙事距离衰减已经落地。
- 小说快照的后端数据模型与 API 已落地。
- `CreativeDecision` 数据模型已存在，且已接入章节上下文构建。

## 剩余核心问题

- 当前生产路径仍存在明显的 fallback/关键词驱动痕迹，尤其是 `includes` 风格的意图识别和章节定位能力不足。
- Agent 已能执行工具，但“规划准确命中用户意图”与“回答严格受工具结果约束”仍不稳定，导致已经检索到信息却仍然答错，或未真正触发目标动作。
- 章节主链路虽已接入 graph，但仍存在双轨迹：`server/src/graphs/chapterWritingGraph.ts` 与 `server/src/services/novel/chapterWritingGraph.ts` 并存，职责边界不清。
- 事件系统、创作决策系统、模型路由、快照系统都存在“后端基础已落地，但产品闭环未完成”的情况。

## 剩余改造清单

### 1. 规划器与意图识别重做

- 用 `LLM 结构化规划器 + 规则兜底` 替换当前生产路径里的关键词拼接式 fallback 主逻辑。
- 规划器输出固定 schema，至少包含：
  - `goal`
  - `contextNeeds`
  - `actions[]`
  - `riskLevel`
  - `requiresApproval`
  - `idempotencyKey`
  - `confidence`
- 规划器输出必须先过 schema 校验，再进入执行层；校验失败要记录为可解释失败步骤。
- 低置信度或解析失败时才允许走 fallback，fallback 只能作为兜底，不能继续承担主路径职责。
- 在规划输入中补齐：
  - 最近消息窗口
  - `chatMode / contextMode`
  - 当前 `run` 状态
  - 可用工具目录
  - 权限矩阵摘要
  - 当前 novel 绑定信息

### 2. 章节语义理解与章节定位补齐

- 支持把自然语言章节表达解析为结构化章节目标，而不是只识别显式 `chapterId`。
- 必须覆盖的表达：
  - `前两章都写了什么`
  - `第一章 / 第二章 / 第三章`
  - `第 3 章`
  - `1-3 章`
  - `第一章到第三章`
  - `重写第三章`
  - `书写第三章`
- 为章节定位补齐按 `order` 查章能力，不能只依赖 `chapterId`。
- 规划器要能区分：
  - 查询章节内容
  - 生成章节
  - 重写章节
  - 保存草稿
  - 启动章节区间流水线

### 3. Tool-first 能力补全与取数修正

- 重写 `get_novel_context` 的返回策略，不能再固定为“最近 12 章 + 每章 120 字摘要”。
- 至少提供以下能力之一：
  - 支持按 `chapterOrder`
  - 支持按章节范围
  - 支持返回全部章节元信息
- 将“章节摘要信息”和“章节正文信息”明确拆分，避免查询正文时仍只拿到摘要。
- 为查询场景补齐以下工具或等价能力：
  - `get_chapter_by_order`
  - `list_chapters`
  - `get_chapter_content_by_order`
  - `summarize_chapter_range`
- 对“前 N 章写了什么”这类问题，规划器必须能自动串联：
  - 先获取章节定位信息
  - 再按章读取正文或足够长的摘要
  - 最后基于工具结果合成答案

### 4. 回答生成约束与幻觉收敛

- 回答阶段必须显式消费工具结果，不能只把工具调用当作旁路信息。
- 对于 novel 模式中的事实问答，必须优先使用 `novel` 工具结果；若信息不足，应明确返回“不足”，而不是编造标题、章节内容或设定。
- 增加 grounded-answer 约束：
  - 标题类问题只能来自 `get_novel_context`
  - 章节内容类问题只能来自章节正文工具或确定的章节摘要工具
  - 若工具结果为空，回答必须显式说明缺失原因
- 将“Planner 已取到工具结果，但最终回答未引用结果”的情况纳入可观察性检查。

### 5. 写作动作触发链路补齐

- 为“写/书写/生成 + 第 N 章”补齐稳定触发逻辑。
- 单章写作要能解析为 `{ startOrder: N, endOrder: N }`，而不是只支持范围表达。
- 明确单章写作与区间流水线的关系：
  - 单章写作是否走 `queue_pipeline_run`
  - 还是直接走 graph 生成
- 不论采用哪种执行方式，都必须在运行轨迹中可见，并能在任务中心追踪。
- “预览执行范围”和“真正执行写作”必须严格区分，避免只预览不执行或只拿圣经不发起生成。

### 6. Agent Runtime 状态机完善

- 当前运行时需要继续补齐为可重入状态机：
  - `queued`
  - `planning`
  - `executing`
  - `waiting_approval`
  - `succeeded`
  - `failed`
  - `cancelled`
- 补齐多审批点、审批过期、重复审批提交冲突、取消后的审批失效处理。
- 补齐同一 `runId` 的互斥执行保护。
- 工具失败后的重试策略、错误分类、可恢复提示需要标准化。
- `retry` 语义要明确为创建新的执行链并关联原 `run`，而不是复用原链继续脏跑。

### 7. 权限矩阵与审批体验补完

- 审批策略需继续细化为显式 `agent x tool` 白名单，默认 deny。
- 高风险写操作必须统一走审批门禁：
  - 整章覆盖
  - 跨章节批量修改
  - 启动流水线任务
  - 世界观硬规则变更
- 审批信息需补齐：
  - `before / after` 摘要
  - 影响范围
  - 风险说明
  - 推荐动作
- 审批拒绝后应给出替代路径，而不是直接让 run 终止为黑盒失败。
- `/chat` 右侧审批区仍需继续优化信息密度、视觉层次和可扫描性。

### 8. 运行轨迹与可观察性继续增强

- `AgentStep` 仍需补齐更完整的元信息：
  - `provider`
  - `model`
  - `tokenUsage`
  - `cost`
  - `duration`
  - `parentStepId`
- 明确“实时 SSE 轨迹”和“持久化轨迹”的一致性模型。
- 在轨迹中补齐回答生成步骤，避免只有工具步骤没有最终 answer synthesis 步骤。
- 将“从某一步重放”的输入快照、输出快照、差异说明做完整。
- 为前端提供更可读的工具 I/O 展示，而不是只展示摘要文本。

### 9. 章节主链路统一收口

- 明确只保留一套章节 graph 主实现，解决以下双轨问题：
  - `server/src/graphs/chapterWritingGraph.ts`
  - `server/src/services/novel/chapterWritingGraph.ts`
- 将真正生效的章节主链路文档化，避免“定义了一套 graph，但生产跑的是另一套服务图”。
- 当前 graph 里仍需进一步显式化角色分工：
  - Planner
  - Writer
  - Reviewer
  - Continuity
  - Repair
- 将这些角色与 runtime 步骤、trace、模型路由、审批策略对齐，而不是只在内部函数层面串起来。

### 10. 事件系统补成真正钩子体系

- 当前已有 `EventBus` 和少量 `emit`，但缺少 handler 目录、注册机制和完整事件覆盖。
- 需要补齐：
  - `handlers/`
  - 应用启动时统一注册
  - handler 优先级
  - handler 失败隔离与日志
- 需要把当前仍然堆在 `NovelCoreService` 内的副作用继续迁出，例如：
  - 章节摘要生成
  - fact 提取
  - RAG 索引刷新
  - 角色时间线联动
  - 质量报告后处理
- 事件类型需扩展到：
  - `chapter:updated`
  - `character:changed`
  - `world:updated`
  - `outline:revised`
  - `pipeline:completed`

### 11. 创作决策系统闭环

- `CreativeDecision` 目前只有数据模型与上下文注入，缺少采集与管理闭环。
- 需要补齐显式写入入口：
  - API
  - 前端 CRUD
  - 重要性与过期设置
- 需要补齐隐式采集：
  - 用户修改 AI 草稿后的意图提取
  - 流水线审校 / 修复过程中的决策沉淀
- 需要补齐使用界面：
  - 章节编辑页侧边栏
  - 决策列表
  - 搜索 / 过滤 / 编辑
- 若保留该能力，则需补 `WritingSession` 或等价会话模型，记录决策来源与编辑痕迹。

### 12. 模型路由产品化

- 后端模型路由能力已存在，但缺少前端管理页。
- 在设置页补齐“模型路由”配置界面：
  - 按任务类型展示当前路由
  - 允许编辑 provider / model / temperature / maxTokens
  - 提供默认值回退提示
- 明确 chat、planner、writer、review、repair、summary、fact extraction 等任务的路由策略。
- 将 agent runtime 与 chapter graph 使用的任务类型统一，避免不同模块使用不同命名或默认值。

### 13. 快照系统产品化

- 当前快照后端已可创建、列出、恢复，但仍缺少前端版本历史管理能力。
- 需要补齐：
  - 小说编辑页“版本历史”页签
  - 快照列表
  - 快照预览
  - 恢复前后的差异对比
  - 手动创建快照入口
- 自动快照触发策略需明确并落地：
  - 流水线执行前
  - 结构化大纲同步前
  - 用户手动恢复前

### 14. `/chat` 页面继续产品化

- 当前 `/chat` 已能用，但仍有明显未完成点：
  - 空状态体验仍偏弱
  - 右侧 Runtime 区块信息密度不均衡
  - 审批、轨迹、知识文档、模型配置之间层次还不够清晰
  - 输入区与运行区在长轨迹情况下的滚动和交互仍需优化
- 所有用户可见文案需统一为中文。
- `novel` 模式下要继续强化 `novelId` 约束，避免误把全局上下文当小说上下文使用。
- 会话历史与 `run` 历史的切换体验仍需优化，尤其是一会话多 run 的浏览体验。

### 15. 任务中心继续打磨

- `agent_run` 已接入，但仍需继续完善展示语义：
  - 审批中
  - 失败分类
  - 可重试 / 可取消原因
  - 跳转回 `/chat?runId=...`
- 统一 `book_analysis / novel_pipeline / image_generation / agent_run` 的状态文案与筛选体验。

### 16. 测试与验收补齐

- 补齐规划器单元测试：
  - 结构化输出校验
  - 低置信度 fallback
  - 单章 / 范围章节解析
  - novel 事实问答的工具编排
- 补齐工具测试：
  - 幂等键
  - 输入 / 输出 schema
  - 错误码
  - `dryRun`
- 补齐运行时测试：
  - 状态机迁移
  - 审批续跑
  - replay
  - cancel / retry 一致性
- 补齐集成和端到端场景：
  - “这本书叫什么”
  - “前两章都写了什么”
  - “写第三章”
  - “重写第三章并触发审批”
  - 刷新后恢复 run 轨迹
- 验收标准中必须明确：
  - 生产问答路径不再依赖 `includes` 作为主判断机制
  - novel 模式下回答必须有 grounding
  - 章节生成主链路只有一套真实实现

## 当前优先级最高的未完成项

- 重做规划器与章节语义理解，解决“取到了信息却答错”和“写第三章未真正触发写作”。
- 重写 `get_novel_context` 与章节取数链路，解决“前两章 / 指定章节 / 范围章节”无法准确获取的问题。
- 将回答生成改为严格受工具结果约束，收敛 novel 模式下的事实幻觉。
- 统一章节 graph 主链路，消除双实现并把角色分工、trace、模型路由彻底对齐。

## 不再沿用的旧判断

- 不再以最初 `TASK.md` 的“阶段一到阶段八”作为实施顺序约束。
- 不再把“是否存在某个目录或某个模型”视为完成标准。
- 后续验收一律以“是否形成完整产品闭环”和“是否能稳定支撑真实使用场景”为准。
