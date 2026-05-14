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
- 重新生成候选没有进入新一轮：检查 batch reuse、command idempotency 和候选阶段运行态。
- 生成没有使用知识库资料：检查 `knowledgeDocumentIds`、小说/世界绑定、启用状态和 prompt context requirement。

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
