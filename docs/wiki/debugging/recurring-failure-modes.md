# 重复故障模式与排查路径

## 背景

项目多次出现的故障往往不是单点 bug，而是边界被绕过：重型任务跑在 API 进程、状态多源推断、Prompt 绕过 registry、章节热路径过长、RAG 检索范围不一致。把这些排查结论沉淀下来，可以避免每次重新定位同类问题。

## 决策

调试时先确认事实源、执行面、投影和治理入口，再看具体代码。不要先用 UI 补丁、关键词兜底或局部 try/catch 掩盖系统性问题。

## 当前规则

- API 卡死先查是否有长任务仍在 Web API 进程执行。
- 状态不一致先查 `DirectorRun / StepRun / Event / Artifact` 与 projection，而不是先改前端显示。
- Prompt 输出问题先查 PromptAsset、schema、repair、semantic retry 和 provider capability。
- 章节产出慢先查热路径是否重新串入多次 LLM 后处理。
- RAG 不命中先查显式文档、绑定文档、全局启用文档和 context resolver。
- 数据破坏风险操作必须先备份、验证备份，再取得明确批准。

## 示例

常见排查路径：

- 继续导演后所有接口变慢：检查 route 是否直接 await 长任务，Worker 是否独立 lease，SQLite/Prisma 写锁是否被长链路占用。
- 任务中心显示失败但小说页显示运行中：检查 projection 是否由旧 task status、runtime command 和产物事实混合推断。
- 章节正文为空还继续推进：检查 writer 空返回防线、单章自动重试和失败落态。
- 章节审校反复进入修复循环：检查后置质量闭环是否已经封顶为一次修复，最终结果是否已收敛到“未通过但继续生产”，以及工作区是否还把终态章节算成 repair ticket。
- 长弧伏笔被当成当前章阻断：检查时间线钩子的 `resolveMode` 和 `blocking` 是否被误标成 `immediate + blocking`，以及检测器是否把 `short_arc` / `long_arc` 升级成硬失败。
- 重新生成候选没有进入新一轮：检查 batch reuse、command idempotency 和候选阶段运行态。
- 生成没有使用知识库资料：检查 `knowledgeDocumentIds`、小说/世界绑定、启用状态和 prompt context requirement。

### 局域网 HTTP 的导演命令提交

`crypto.randomUUID()` 依赖浏览器安全上下文。通过 `http://192.168.*` 等局域网地址访问时，直接调用它会在构造命令时抛错，请求尚未发出；开发机的 localhost 测试不能覆盖这个环境差异。

新导演的命令标识由 `client/src/api/directorNext.ts` 的 `createDirectorCommandKey` 统一生成。优先使用原生 UUID；缺失时使用可在普通 HTTP 中工作的 `getRandomValues`，加时间和本页面序号；没有 Crypto API 时使用随机片段、时间和序号。标识只用于命令去重，不能作为认证令牌或授权依据，同一时刻的不同提交也必须保持不同标识。

此规则覆盖启动正文、三种阶段处理、模式切换、继续与取消。兼容处理不能改变本次章节范围、运行归属、预期状态版本或创作方式，也不能绕过服务端的命令与状态校验。排查时先确认请求是否发出，再区分浏览器能力缺失与服务端拒绝。代码回归需模拟缺少 `randomUUID` 的环境并检查真实请求载荷，不能只在 Node 的完整 Crypto 环境中验证。

## 失败模式

不能用来替代根因修复的手段：

- 降低前端轮询频率来掩盖 API 执行面阻塞。
- UI 禁用按钮来避免重复执行，而不处理 command 幂等。
- 给意图识别加关键词 fallback 来掩盖 AI schema 或上下文问题。
- 在业务 service 里补局部 JSON parse 分支来绕过 Prompt Registry。
- 把后台资产回灌失败显示成正文生成失败。

## 相关模块

- `server/src/routes/`
- `server/src/workers/`
- `server/src/services/novel/director/`
- `server/src/services/novel/runtime/`
- `server/src/services/rag/`
- `server/src/prompting/`
- `client/src/pages/tasks/`
- `client/src/pages/novels/`

## 来源文档

- [自动导演执行面隔离与 API 保活计划](../../plans/auto-director-execution-plane-isolation-plan.md)
- [导演模式模块化与状态治理改造清单](../../plans/director-mode-module-state-refactor-checklist.md)
- [正文产出链路瘦身与资产回灌优化计划](../../plans/chapter-output-pipeline-optimization-plan.md)
- [Prompt Governance Audit 2026-05-08](../../checkpoints/prompt-governance-audit-2026-05-08.md)
- [README 最新更新](../../../README.md)
## 补丁重叠与单章用量归属

模型生成多个修复目标时可能让小片段包含在大段中。按返回顺序修改正文会让小片段从编辑后的文本消失，产生误导性的 missing_target。全部目标必须先在同一份原文定位，统一校验唯一性与互不重叠；成功后从后往前应用。任一校验失败返回完整原文，不能返回部分修改稿。Prompt 要求同一区域的问题合并为一条补丁；运行时仍报告 overlapping_target，不能猜测丢弃哪条修复意图，也不能额外启动无预算的补丁调用。局部失败按任务冻结的问题策略记录质量债。

排查单章超限应分开读取 GenerationJob 总用量、chapterUsage 起止计数和逐次调用日志。正文保存之后的后续窗口决策与章节规划属于作业消耗，不属于保存章的消耗。新日志保留流式返回的实际 input/output/total Tokens；累计流片段取最终最大值，不重复相加。中断流的已报告消耗也写入错误记录；供应商未报告的用量保持未知。历史缺失的逐次用量不能用字符估算回填成实际消耗。
