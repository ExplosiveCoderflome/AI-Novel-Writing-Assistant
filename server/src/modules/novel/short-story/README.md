# Short Story 模块边界

## 责任

`short-story` 是短篇作品的正式生产与编辑模块。它负责短篇计划、内部片段生成、全篇审校、一次必要修复、连续正文投影、人工编辑保护、自然语言修改和派生成长篇。

目录按职责组织：

- `application/`：生产编排、恢复、编辑和修订用例。
- `http/`：面向客户端的短篇 API 映射与输入校验。
- `domain/`：后续新增的纯业务规则与状态转换。
- `infrastructure/`：后续新增的模块专属外部适配器。

当前没有独立 `domain/` 或 `infrastructure/` 文件，是因为持久化由 Prisma、AI 调用由 Prompt Registry 的稳定门面承担；不要为了目录完整而添加无所有权的空壳或通用 helper。

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
- 失败恢复从持久化片段游标继续。只有超过租期的 `generating` 片段可回收为失败状态，避免并发进程重复生成。
- 短篇发展成长篇必须创建新作品和新创作任务，并写入 `derivedFromNovelId`；原短篇不可原地转换。

## 数据与迁移

持久化事实源是 `NovelIntentVersion`、`ShortStoryPlan`、`ShortStorySegment` 和 `NovelWorkflowTask`。PostgreSQL 与 SQLite schema、增量迁移必须同步维护。

涉及这些表的迁移属于数据风险操作。执行前必须先完成数据库备份、记录具体备份路径并验证备份文件存在且大小合理；未满足条件时只能生成和校验迁移文件，不能执行迁移。

## 相关模块

- `server/src/modules/novel/creation-studio/`
- `server/src/prompting/prompts/shortStory/`
- `server/src/services/novel/workflow/`
- `server/src/modules/export/`
- `client/src/pages/shortStory/`
