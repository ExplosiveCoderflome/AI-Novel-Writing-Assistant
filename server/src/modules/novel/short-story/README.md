# Short Story 模块边界

## 责任

`short-story` 是短篇作品的正式生产与编辑模块。它负责短篇计划、内部片段生成、全篇审校、一次必要修复、连续正文投影、人工编辑保护、自然语言修改和派生成长篇。

目录按职责组织：

- `application/`：生产编排、恢复、编辑和修订用例。
- `http/`：面向客户端的短篇 API 映射与输入校验。
- `domain/`：修订基础版本、影响范围及快照规则。
- `infrastructure/`：后续新增的模块专属外部适配器。

持久化由 Prisma、AI 调用由 Prompt Registry 的稳定门面承担。修订预览、上下文读取和候选执行分别归属 application 服务，不通过首次生产跳过已完成片段的逻辑恢复。

## 依赖方向

- HTTP 只能调用本模块 application 服务或明确的创作工作室门面。
- application 可以依赖 Prisma、正式 Prompt Asset 和小说 workflow 门面。
- 其他模块应通过本模块服务或路由消费能力，不应直接改写 `ShortStoryPlan`、`ShortStorySegment`。
- 产品级 Prompt 只能放在 `server/src/prompting/prompts/shortStory/` 并登记到 Prompt Registry。

## 运行时不变量

- 内部片段只用于生成、恢复和编辑定位；用户阅读与导出始终得到无内部标题的连续正文。
- 短篇成稿的默认产品形态是完整中文网络小说。计划 v2 必须提供钩子、即时目标、推进节拍、题材回报和结尾牵引；正文与审校不得退化成传统文学小品、散文或剧情梗概。
- 短篇在创建前必须解析题材基底与主要推进模式，次要推进模式可选。解析后的完整创作底座必须作为 required context 同时进入计划、片段正文、全篇审校、修复和用户确认后的改写，不能只保存资源 ID 或只注入名称。
- 用户明确选择的题材或推进模式优先于 AI 推荐；缺失项由注册 PromptAsset 进行结构化补齐，不允许关键词或正则路由。
- 网文可读性要求服务事件推进和手机阅读，但不等于统一爽文化。回报类型由题材和已确认方向决定。
- 已完成片段在普通失败重试时复用；人工编辑片段不得被后台生成或自动修复静默覆盖。
- 人工保存必须校验 `expectedVersion`，保存前写入快照，再递增版本并标记人工编辑时间。
- 普通质量问题写入 `qualityDebtJson` 后完成交付。只有显式 `replan_required`、无可用正文、运行时或数据安全问题可以停止整条生产链。
- 自动修复最多执行一次。残余可接受问题不能循环修复或把全篇任务标成失败。
- `SHORT_STORY_ON_V2` 默认关闭，正式 V2 接线还须等待短篇前置开发整合。关闭时全篇检查和一次修整保留既有路径；打开后的准备能力在每次实际审校请求发送前，核对完整消息、结构化格式、模型附加输入、输出额度及当前准确模型的窗口，初审、备用和纠正请求同样受约束。候选修稿先保留在内存，复验通过才在事务内核对片段版本并保存；复验不通过保留原稿及原稿质量提醒，不写入再回退，也不以候选的问题升级原稿的重规划。进行中的跨进程恢复和持久单次修复额度由后续正式接线闭合，不能据此视为计划06完成。
- 失败恢复从持久化片段游标继续。只有超过租期的 `generating` 片段可回收为失败状态，避免并发进程重复生成。
- 短篇发展成长篇必须创建新作品和新创作任务，并写入 `derivedFromNovelId`；原短篇不可原地转换。

## 数据与迁移

持久化事实源是 `NovelIntentVersion`、`ShortStoryPlan`、`ShortStorySegment` 、`NovelWorkflowTask`、`ShortStoryRevisionJob` 和 `ShortStoryRevisionCandidate`。PostgreSQL 与 SQLite schema、增量迁移必须同步维护。

涉及这些表的迁移属于数据风险操作。执行前必须先完成数据库备份、记录具体备份路径并验证备份文件存在且大小合理；未满足条件时只能生成和校验迁移文件，不能执行迁移。

## 相关模块

- `server/src/modules/novel/creation-studio/`
- `server/src/prompting/prompts/shortStory/`
- `server/src/services/novel/workflow/`
- `server/src/modules/export/`
- `client/src/pages/shortStory/`

## 修订与恢复边界

- 预览只保存待确认意图与完整基础版本，完整重规划的候选计划在此阶段生成；正式意图和正文在候选提交时统一切换。
- ShortStoryRevisionPreviewService 解释要求并生成预览；ShortStoryRevisionService 负责确认、租约、候选保存、恢复、版本校验和原子发布；ShortStoryContext 提供本模块上下文和基础版本。
- 首次生产没有修订指针，继续使用计划与片段游标；有 shortStoryOperationId 的任务只能恢复对应修订作业。不能从修订失败回到首次生产并跳过旧正文。
- 同一作业的候选按片段唯一保存，带令牌租约防止并发执行；完整候选通过基础版本检查后，在 Serializable 短事务中提交正文、快照、计划、意图、作业和任务结果。
- replan_required 的普通重试被拒绝，必须在短篇源页面预览并显式确认。取消、旧预览和人工编辑均受保护；旧版不明修订要求重新预览。
- 详细状态与验证约定见 [短篇工作流](../../../../../docs/wiki/workflows/creation-studio-short-story.md)。

## 参考与诊断边界

- 参考服务归创作工作室 `reference/index.ts` 门面所有。本模块只读取作品确认时保存的快照，不能重新抽取来源或在恢复时换用最新拆书。
- `ShortStoryContext` 和生产上下文将精炼参考合同传给计划、正文、审校、修复、改写与重规划；完整分析结论不重复进入每次写作。
- `creation_reference` 与 `production_foundation` 在短篇正文自定义模板中仍属必需上下文，模板遗漏时由运行时保底补入。
- 脱敏尝试记录归 `platform/llm/diagnostics/`，本模块只投影原因和标识、检查限流等待。诊断不能替代持久修订作业、解除人工暂停或改变质量债政策。
- 诊断读法及真实模型验证边界见 [定位指南](../../../../../docs/wiki/debugging/short-story-structured-failures.md)。
